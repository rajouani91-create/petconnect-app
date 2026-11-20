import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatIsoDate, type MessageKey } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import { practiceSchedule, type PracticeSchedule as Schedule } from '../lib/practiceSchedule';
import {
  STATUS_LABEL, STATUS_TONE, bookingErrorKey, cancelAppointment, checkSlot, confirmAppointment, dayOf, freeSlots, hasWarnings, markAppointment,
  moveAppointment, practiceAppointments, timeOf, toInstant, whenErrors, type PracticeAppointment, type Warnings,
} from '../lib/practiceAppointments';
import {
  CAL_VIEWS, PX_PER_MIN, closedBands, dayStatus, gridRange, isClosed, isMovable, isoWeek, layoutDay, monthGrid, nearestSlot, onDay, shiftAnchor,
  stepSlot, timeAtY, toHHMM, toMin, weekDays, type CalView, type DayStatus,
} from '../lib/practiceCalendar';
import { CancelDialog, SlotPicker, WarningBox } from './PracticeAppointments';
import { usePractice } from './PracticeProvider';

const VIEW_LABEL: Record<CalView, MessageKey> = { day: 'calDay', week: 'calWeek', month: 'calMonth' };
type Msg = { ok: boolean; text: string; undo?: () => Promise<void> };
type Drop = { day: string; time?: string };

/** Kalender der Praxis: Tag, Woche, Monat; Verschieben per Ziehen (Touch: gedrückt halten) und per Tastatur */
export function PracticeCalendar() {
  const { t, lang } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const now = useNow();
  const today = zonedNow(now).date;
  const [params, setParams] = useSearchParams();
  const view: CalView = (CAL_VIEWS as string[]).includes(params.get('ansicht') ?? '') ? (params.get('ansicht') as CalView) : 'week';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('tag') ?? '') ? params.get('tag')! : today;
  const go = (v: CalView, d: string) => setParams({ ansicht: v, tag: d }, { replace: true });

  const [rows, setRows] = useState<PracticeAppointment[] | null>(null);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PracticeAppointment | null>(null);
  const [cancelling, setCancelling] = useState<PracticeAppointment | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([practiceAppointments(), practiceSchedule()]);
      setRows(a);
      setSched(s);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  useEffect(() => { if (!pending) void load(); }, [load, pending]);

  // Woche auf dem Handy: zum heutigen Tag blättern
  const gridRef = useRef<HTMLDivElement>(null);
  const loaded = rows !== null && sched !== null;
  useEffect(() => {
    const w = gridRef.current;
    const head = w?.querySelector<HTMLElement>('.tg-head.is-today');
    if (w && head && w.scrollWidth > w.clientWidth) w.scrollLeft = Math.max(0, head.offsetLeft - 56);
  }, [view, anchor, loaded]);

  const status = (d: string): DayStatus => (sched ? dayStatus(d, sched.hours, sched.absences) : { kind: 'closed' });
  const notifies = (a: PracticeAppointment) => a.has_access || a.source === 'online';

  /** Verschieben auf eine genaue Zeit (Tagesansicht) oder die nächstliegende freie Zeit eines Tages (Woche, Tastatur) */
  async function moveTo(a: PracticeAppointment, target: Drop) {
    if (!isMovable(a, now)) { setMsg({ ok: false, text: t('calNotMovable') }); return; }
    if (target.day < today) { setMsg({ ok: false, text: t('calPastDay') }); return; }
    const st = status(target.day);
    if (st.kind !== 'open') { setMsg({ ok: false, text: t('calClosedDay') }); return; }
    setBusy(true);
    setMsg(null);
    try {
      let iso: string | null;
      if (target.time) {
        iso = toInstant(target.day, target.time);
        if (new Date(iso) <= now) { setMsg({ ok: false, text: t('calPastDay') }); return; }
        const w = await checkSlot(iso, a.minutes, a.id);
        if (hasWarnings(w)) {
          setMsg({ ok: false, text: w.overlaps.length ? t('calTaken', { n: w.overlaps.map((o) => o.pet).join(', ') }) : t('calClosedDay') });
          return;
        }
      } else {
        iso = nearestSlot(await freeSlots(a.minutes, target.day, 1, 200, a.id), timeOf(a.starts_at));
        if (!iso) { setMsg({ ok: false, text: t('calNoFreeDay') }); return; }
      }
      if (iso === a.starts_at) return;
      const prev = a.starts_at;
      await moveAppointment(a.id, iso, false);
      await load();
      setMsg({
        ok: true,
        text: t('calMoved', { n: a.pet_label, d: formatDate(new Date(`${dayOf(iso)}T12:00:00Z`), lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }), t: timeOf(iso) })
          + (notifies(a) ? ` ${t('calInformed', { n: a.owner_label })}` : ''),
        undo: async () => {
          setBusy(true);
          try { await moveAppointment(a.id, prev, true); await load(); setMsg({ ok: true, text: t('calUndone') }); } catch (e) { setMsg({ ok: false, text: t(bookingErrorKey(e)) }); } finally { setBusy(false); }
        },
      });
    } catch (e) {
      setMsg({ ok: false, text: t(bookingErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function keyMove(a: PracticeAppointment, key: string) {
    const d = dayOf(a.starts_at);
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      await moveTo(a, { day: shiftAnchor(d, 'day', key === 'ArrowLeft' ? -1 : 1) });
    } else {
      if (!isMovable(a, now)) { setMsg({ ok: false, text: t('calNotMovable') }); return; }
      setBusy(true);
      try {
        const next = stepSlot(await freeSlots(a.minutes, d, 1, 200, a.id), a.starts_at, key === 'ArrowUp' ? -1 : 1);
        if (!next) { setMsg({ ok: false, text: t('calNoFreeDay') }); return; }
        await moveTo(a, { day: d, time: timeOf(next) });
      } finally {
        setBusy(false);
      }
    }
  }

  // ---------- Ziehen (Maus sofort nach kurzer Bewegung, Touch nach 350 ms gedrückt halten) ----------
  const drag = useRef<{ a: PracticeAppointment; x: number; y: number; touch: boolean; active: boolean; timer?: number } | null>(null);
  const suppressClick = useRef(false);
  const dropAt = (x: number, y: number): Drop | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]');
    if (!el) return null;
    // Zeitraster: Uhrzeit aus der Höhe in der Spalte, auf 15 Minuten gerundet
    if (el.dataset.gridStart !== undefined) {
      const r = el.getBoundingClientRect();
      return { day: el.dataset.dropDay!, time: timeAtY(y - r.top, Number(el.dataset.gridStart), Number(el.dataset.gridEnd), drag.current?.a.minutes ?? 0) };
    }
    return { day: el.dataset.dropDay!, time: el.dataset.dropTime };
  };
  const keyOf = (d: Drop | null) => (d ? `${d.day}|${d.time ?? ''}` : null);

  useEffect(() => {
    function move(e: PointerEvent) {
      const g = drag.current;
      if (!g) return;
      const dist = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (!g.active) {
        if (g.touch && dist > 10) { window.clearTimeout(g.timer); drag.current = null; return; }
        if (!g.touch && dist > 5) { g.active = true; setDragId(g.a.id); }
        else return;
      }
      setHover(keyOf(dropAt(e.clientX, e.clientY)));
      // am Rand automatisch weiterblättern (lange Tagesansicht)
      if (e.clientY < 80) window.scrollBy(0, -24);
      else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 24);
    }
    function up(e: PointerEvent) {
      const g = drag.current;
      drag.current = null;
      if (!g) return;
      window.clearTimeout(g.timer);
      setDragId(null);
      setHover(null);
      if (!g.active) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const d = dropAt(e.clientX, e.clientY);
      if (d) void moveTo(g.a, d);
    }
    function touchMove(e: TouchEvent) { if (drag.current?.active) e.preventDefault(); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('touchmove', touchMove);
    };
  });

  function startDrag(e: RPointerEvent, a: PracticeAppointment) {
    if (!isMovable(a, now) || busy || e.button > 0) return;
    const touch = e.pointerType !== 'mouse';
    const g = { a, x: e.clientX, y: e.clientY, touch, active: false, timer: undefined as number | undefined };
    if (touch) g.timer = window.setTimeout(() => { if (drag.current === g) { g.active = true; setDragId(a.id); navigator.vibrate?.(20); } }, 350);
    drag.current = g;
  }

  const card = (a: PracticeAppointment, compact = false) => {
    const movable = isMovable(a, now);
    return (
      <button key={a.id} type="button" className={`cal-appt cal-${a.status}${dragId === a.id ? ' is-dragging' : ''}${movable ? ' is-movable' : ''}`}
        aria-label={t('calApptL', { t: timeOf(a.starts_at), n: a.pet_label, x: a.type_name, s: t(STATUS_LABEL[a.status]) })}
        aria-keyshortcuts={movable ? 'ArrowLeft ArrowRight ArrowUp ArrowDown' : undefined}
        onPointerDown={(e) => startDrag(e, a)}
        onContextMenu={(e) => { if (drag.current) e.preventDefault(); }}
        onClick={() => { if (!suppressClick.current) setEditing(a); }}
        onKeyDown={(e: KeyboardEvent) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !busy) { e.preventDefault(); void keyMove(a, e.key); }
        }}>
        <span className="mono cal-time">{timeOf(a.starts_at)}</span>
        <span className="cal-pet">{a.pet_label}</span>
        {!compact && <span className="cal-type">{a.type_name}</span>}
        <span className="cal-tags">
          {a.status === 'new' && <span className="pill pill-warn">{t('bkStNew')}</span>}
          {(a.status === 'attended' || a.status === 'no_show') && <span className={`pill ${STATUS_TONE[a.status]}`}>{t(STATUS_LABEL[a.status])}</span>}
          {a.new_client && <span className="pill pill-accent">{t('bkNewClient')}</span>}
          {a.overridden && <span className="pill pill-crit">{t('calOverlap')}</span>}
        </span>
      </button>
    );
  };

  // ---------- Zeitraster für Tag und Woche ----------
  const nowMin = zonedNow(now).minutes;
  const grid = (days: string[]) => {
    const all = days.flatMap((d) => onDay(rows ?? [], d));
    const { start, end } = gridRange(days.map(status), all);
    const px = (m: number) => `${(m - start) * PX_PER_MIN}px`;
    const hours: number[] = [];
    for (let m = start; m <= end; m += 60) hours.push(m);
    const dragA = dragId ? (rows ?? []).find((r) => r.id === dragId) ?? null : null;
    const [hDay, hTime] = (hover ?? '').split('|');
    const height = `${(end - start) * PX_PER_MIN}px`;
    return (
      <div className="tg-wrap" ref={gridRef}>
        <div className={`tg${days.length === 1 ? ' tg-one' : ''}`} style={{ '--tg-cols': days.length } as CSSProperties}>
          <div className="tg-corner" aria-hidden="true" />
          {days.map((d) => {
            const s = status(d);
            return days.length === 1 ? (
              <div key={d} className={`tg-head${d === today ? ' is-today' : ''}`}><strong>{formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'long', timeZone: 'UTC' })}</strong></div>
            ) : (
              <button key={d} type="button" className={`tg-head${d === today ? ' is-today' : ''}${s.kind !== 'open' ? ' is-closed' : ''}`} onClick={() => go('day', d)} aria-label={t('calOpenDay', { d: formatIsoDate(d, lang) })}>
                <span>{formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'short', timeZone: 'UTC' })} <strong>{formatDate(new Date(`${d}T12:00:00Z`), lang, { day: 'numeric', month: 'numeric', timeZone: 'UTC' })}</strong></span>
                <span className="small muted">{statusText(s)} · {onDay(rows ?? [], d).length}</span>
              </button>
            );
          })}
          <div className="tg-times" style={{ height }} aria-hidden="true">
            {hours.map((m) => <span key={m} style={{ top: px(m) }}>{toHHMM(m)}</span>)}
          </div>
          {days.map((d) => {
            const s = status(d);
            return (
              <div key={d} className={`tg-col${d === today ? ' is-today' : ''}${hDay === d ? ' is-hover' : ''}`} style={{ height }}
                data-drop-day={d} data-grid-start={start} data-grid-end={end}>
                {closedBands(s, start, end).map((b) => (
                  <div key={`${b.kind}-${b.from}`} className={`tg-band tg-${b.kind}`} style={{ top: px(b.from), height: `${(b.to - b.from) * PX_PER_MIN}px` }}>
                    {b.kind === 'pause' && b.to - b.from >= 30 && <span className="small muted">{t('scBreak')}</span>}
                    {s.kind === 'absence' && <span className="small muted">{s.reason || t('calAbsent')}</span>}
                  </div>
                ))}
                {layoutDay(onDay(rows ?? [], d)).map(({ a, col, cols }) => (
                  <div key={a.id} className={`tg-ev${a.minutes < 30 ? ' is-short' : ''}`} style={{
                    top: px(toMin(timeOf(a.starts_at))), height: `${Math.max(22, a.minutes * PX_PER_MIN - 2)}px`,
                    left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
                  }}>{card(a, a.minutes < 25 || cols > 2)}</div>
                ))}
                {dragA && hDay === d && hTime && (
                  <div className="tg-ghost" aria-hidden="true" style={{ top: px(toMin(hTime)), height: `${dragA.minutes * PX_PER_MIN}px` }}>
                    {hTime}–{toHHMM(toMin(hTime) + dragA.minutes)} · {dragA.pet_label}
                  </div>
                )}
                {d === today && nowMin >= start && nowMin <= end && <div className="tg-now" style={{ top: px(nowMin) }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const statusText = (s: DayStatus) => s.kind === 'open' ? `${s.opens}–${s.closes}` : s.kind === 'absence' ? (s.reason || t('calAbsent')) : t('scClosed');
  const title = view === 'day'
    ? formatDate(new Date(`${anchor}T12:00:00Z`), lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : view === 'week'
      ? (() => { const w = weekDays(anchor); const f = (d: string) => formatDate(new Date(`${d}T12:00:00Z`), lang, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }); return t('calWeekTitle', { w: isoWeek(anchor), a: f(w[0]!), b: f(w[6]!) }); })()
      : formatDate(new Date(`${anchor}T12:00:00Z`), lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <h1>{t('calTitle')}</h1>
        <p className="muted">{t('calSub')}</p>
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status"><p><strong>{t('pp_pendingTitle')}</strong></p><p>{t('scPending')}</p></div>
      ) : loadErr && !rows ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !rows || !sched ? <p className="muted">{t('loading')}</p> : (
        <section className="card stack cal" aria-labelledby="cal-title">
          <div className="cal-bar">
            <div className="chips-wrap" role="group" aria-label={t('calViewL')}>
              {CAL_VIEWS.map((v) => <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => go(v, anchor)}>{t(VIEW_LABEL[v])}</button>)}
            </div>
            <div className="row-actions cal-nav">
              <button type="button" className="btn btn-ghost" aria-label={t('calPrev')} onClick={() => go(view, shiftAnchor(anchor, view, -1))}>‹</button>
              <button type="button" className="btn btn-secondary" onClick={() => go(view, today)}>{t('calToday')}</button>
              <button type="button" className="btn btn-ghost" aria-label={t('calNext')} onClick={() => go(view, shiftAnchor(anchor, view, 1))}>›</button>
            </div>
          </div>
          <h2 id="cal-title" className="h-sub" aria-live="polite">{title}</h2>
          <div className="record-status" role="status" aria-live="polite">
            {msg && (
              <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>
                {msg.text}
                {msg.undo && <> <button type="button" className="link-btn" disabled={busy} onClick={() => void msg.undo!()}>{t('calUndo')}</button></>}
              </p>
            )}
          </div>

          {view === 'day' && (() => {
            const st = status(anchor);
            return <p className="muted small">{statusText(st)} · {t('calCount', { n: onDay(rows, anchor).length })}</p>;
          })()}
          {view !== 'month' && grid(view === 'day' ? [anchor] : weekDays(anchor))}

          {view === 'month' && (
            <div className="cal-month" role="grid" aria-label={title}>
              {monthGrid(anchor).map((w) => (
                <div key={w[0]} className="cal-month-row" role="row">
                  {w.map((d) => {
                    const items = onDay(rows, d);
                    const hasNew = items.some((a) => a.status === 'new');
                    const s = status(d);
                    return (
                      <button key={d} type="button" role="gridcell" className={`cal-month-cell${d.slice(0, 7) !== anchor.slice(0, 7) ? ' is-other' : ''}${d === today ? ' is-today' : ''}${s.kind !== 'open' ? ' is-closed' : ''}`}
                        aria-label={`${formatIsoDate(d, lang)}: ${t('calCount', { n: items.length })}`} onClick={() => go('day', d)}>
                        <span className="cal-month-day">{Number(d.slice(8))}</span>
                        {items.length > 0 && <span className={`pill ${hasNew ? 'pill-warn' : 'pill-ok'}`}>{items.length}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <p className="muted small note-line">{t('calTip')}</p>
          <p className="muted small">
            <Link to="/praxis/termine/einstellungen" className="link">{t('calSettings')}</Link>
          </p>
        </section>
      )}
      {editing && (
        <EditDialog a={editing} now={now} onClose={() => setEditing(null)}
          onDone={async (text) => { setEditing(null); await load(); setMsg({ ok: true, text }); }}
          onCancel={() => { setCancelling(editing); setEditing(null); }} />
      )}
      {cancelling && <CancelDialog a={cancelling} busy={busy} onClose={() => setCancelling(null)}
        onCancel={async (reason, note, alts) => {
          setBusy(true);
          try {
            await cancelAppointment(cancelling.id, reason, note, alts);
            await load();
            setMsg({ ok: true, text: t(cancelling.status === 'new' ? 'obDeclined' : 'bkCancelled', { n: cancelling.pet_label }) });
            return true;
          } catch (e) {
            setMsg({ ok: false, text: t(bookingErrorKey(e)) });
            return false;
          } finally {
            setBusy(false);
          }
        }} />}
    </div>
  );
}

/** Termin antippen → bearbeiten: Datum/Uhrzeit, bestätigen, absagen, Erschienen, zur Patientenakte */
function EditDialog({ a, now, onClose, onDone, onCancel }: {
  a: PracticeAppointment; now: Date; onClose: () => void; onDone: (text: string) => Promise<void>; onCancel: () => void;
}) {
  const { t, lang } = useI18n();
  const uid = useId();
  const z = zonedNow(now);
  const today = z.date;
  const nowHHMM = `${String(Math.floor(z.minutes / 60)).padStart(2, '0')}:${String(z.minutes % 60).padStart(2, '0')}`;
  const [day, setDay] = useState(dayOf(a.starts_at));
  const [time, setTime] = useState(timeOf(a.starts_at));
  const [errors, setErrors] = useState<{ day?: MessageKey; time?: MessageKey }>({});
  const [warn, setWarn] = useState<Warnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ ok: boolean; key: MessageKey } | null>(null);
  const closed = isClosed(a);
  const movable = isMovable(a, now);
  const started = new Date(a.starts_at) <= now;

  async function act(fn: () => Promise<unknown>, text: string) {
    setBusy(true);
    try { await fn(); await onDone(text); } catch (e) { setInfo({ ok: false, key: bookingErrorKey(e) }); } finally { setBusy(false); }
  }

  async function save(force: boolean) {
    setInfo(null);
    if (day === dayOf(a.starts_at) && time === timeOf(a.starts_at)) { setInfo({ ok: true, key: 'calNoChange' }); return; }
    const errs = whenErrors(day, time, today, nowHHMM);
    setErrors(errs);
    if (errs.day || errs.time) return;
    const iso = toInstant(day, time);
    setBusy(true);
    try {
      if (!force) {
        const w = await checkSlot(iso, a.minutes, a.id);
        if (hasWarnings(w)) { setWarn(w); return; }
      }
      await moveAppointment(a.id, iso, force);
      await onDone(t('bkMoved', { n: a.pet_label, d: formatIsoDate(day, lang), t: time }));
    } catch (e) {
      setInfo({ ok: false, key: bookingErrorKey(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t('calEditTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        {movable && <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy || !!warn}>{t('calSave')}</button>}
      </>
    }>
      <div className="stack">
        <p>
          <strong>{a.pet_label}</strong> · {a.owner_label} <span className={`pill ${STATUS_TONE[a.status]}`}>{t(STATUS_LABEL[a.status])}</span><br />
          <span className="muted small">{a.type_name} · {t(a.source === 'online' ? 'bkSrcOnline' : 'bkSrcPhone')}{a.phone ? ` · ${a.phone}` : ''}</span>
        </p>
        {a.note && <p className="small pre-line">{a.note}</p>}
        {closed ? <p className="notice notice-info">{t('calClosedAppt')}</p> : !movable ? <p className="muted small">{t('calStarted')}</p> : (
          <form id={`${uid}-f`} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false); }} noValidate>
            <div className="row-2">
              <Field id={`${uid}-d`} label={t('wkDate')} error={errors.day ? { key: errors.day } : undefined} required>
                {(x) => <input {...x} type="date" min={today} value={day} onChange={(e) => { setDay(e.target.value); setWarn(null); }} />}
              </Field>
              <Field id={`${uid}-t`} label={t('bkTime')} error={errors.time ? { key: errors.time } : undefined} required>
                {(x) => <input {...x} type="time" step={300} value={time} onChange={(e) => { setTime(e.target.value); setWarn(null); }} />}
              </Field>
            </div>
            <SlotPicker minutes={a.minutes} day={day} exclude={a.id} value={time} onPick={(hm) => { setTime(hm); setWarn(null); }} />
            {warn && <WarningBox w={warn} busy={busy} onForce={() => void save(true)} onBack={() => setWarn(null)} />}
          </form>
        )}
        {info && <p className={`notice ${info.ok ? 'notice-info' : 'notice-crit'}`} role="status">{t(info.key)}</p>}
        <div className="row-actions">
          {a.status === 'new' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => confirmAppointment(a.id), t('obConfirmed', { n: a.pet_label }))}>{t('calConfirm')}</button>}
          {!closed && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>{t(a.status === 'new' ? 'obDecline' : 'calCancel')}</button>}
          {started && (a.status === 'confirmed' || a.status === 'attended' || a.status === 'no_show') && (
            <>
              {a.status !== 'attended' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act(() => markAppointment(a.id, true), t('bkMarked'))}>{t('bkAttended')}</button>}
              {a.status !== 'no_show' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(() => markAppointment(a.id, false), t('bkMarked'))}>{t('bkNoShow')}</button>}
            </>
          )}
          {a.has_access && a.pet_id && <Link to={`/praxis/patienten/${a.pet_id}`} className="btn btn-ghost">{t('calToRecord')}</Link>}
        </div>
      </div>
    </Dialog>
  );
}
