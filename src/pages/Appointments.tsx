import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { localeOf } from '../i18n';
import {
  addAppointment,
  deleteAppointment,
  listAppointments,
  setAppointmentStatus,
  updateAppointment,
  type AppointmentInput,
  type AppointmentRow,
} from '../lib/api';
import { appointmentIcs, downloadIcs, icsFilename } from '../lib/ics';
import {
  OWNER_STATUS_LABEL, OWNER_STATUS_TONE, bookingOwnerErrorKey, cancelBooking, leaveWaitlist, ownerPracticeBookings, ownerWaitlist, takeAlternative, takeWaitlistOffer,
  type OwnerBooking, type OwnerWaitlistEntry,
} from '../lib/booking';
import { formatDate, formatIsoDate } from '../i18n';
import { dayOf, timeOf } from '../lib/practiceAppointments';
import { CANCEL_LABEL, CANCEL_REASONS, type CancelReason } from '../lib/practiceAppointments';
import { recordErrorKey } from '../lib/record';
import {
  APPT_KINDS,
  APPT_KIND_LABEL,
  APPT_LOCATION_MAX,
  APPT_STATUS_LABEL,
  APPT_TITLE_MAX,
  NOTE_MAX,
  formatDateTime,
  formatTimeOnly,
  isApptKind,
  isApptStatus,
  localDate,
  localTime,
  shorten,
  splitAppointments,
  toInstant,
  validateAppointment,
  type ApptErrors,
  type ApptFormValues,
  type ApptStatus,
} from '../lib/schedule';
import { Field } from '../components/Field';
import { IconCalendar, IconPlus, IconTrash } from '../components/Icons';
import { Loading } from '../components/Loading';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from '../components/record/shared';
import { ALL_PETS, PetFilter, PetSelect, useLocalToday, usePetAccess } from '../components/schedule/shared';

type Mode = { kind: 'add' } | { kind: 'edit'; row: AppointmentRow } | null;

/** Termine aller betreuten Tiere: nächste oben, vergangene und abgesagte einklappbar. */
export function Appointments() {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const today = useLocalToday();
  const { pets, names, editable, editablePets } = usePetAccess();
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState(ALL_PETS);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<AppointmentRow | null>(null);
  const [bookings, setBookings] = useState<Map<string, OwnerBooking>>(new Map());
  const [waitlist, setWaitlist] = useState<OwnerWaitlistEntry[]>([]);
  const [wlBusy, setWlBusy] = useState(false);
  const [toCancel, setToCancel] = useState<AppointmentRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const petKey = pets.map((p) => p.id).join(',');
  const load = useCallback(async () => {
    try {
      const [list, b] = await Promise.all([
        listAppointments(petKey ? petKey.split(',') : []),
        // Stand der Praxistermine (angefragt, bestätigt, abgesagt); fehlt er, bleibt die Liste trotzdem nutzbar
        ownerPracticeBookings().catch((e: unknown) => { console.error(e); return [] as OwnerBooking[]; }),
      ]);
      ownerWaitlist().then(setWaitlist).catch(() => setWaitlist([]));
      setRows(list);
      setBookings(new Map(b.map((x) => [x.appointment_id, x])));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petKey]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = (rows ?? []).filter((r) => filter === ALL_PETS || r.pet_id === filter);
  const { upcoming, past } = splitAppointments(shown, today);
  const anyEditable = editablePets.length > 0;
  const petName = (id: string) => names.get(id) ?? '';

  const replace = (row: AppointmentRow) => setRows((cur) => (cur ?? []).map((r) => (r.id === row.id ? row : r)));

  async function changeStatus(row: AppointmentRow, next: ApptStatus) {
    try {
      const updated = await setAppointmentStatus(row.id, next);
      replace(updated);
      setStatus(t(next === 'done' ? 'apMarkedDone' : next === 'cancelled' ? 'apMarkedCancelled' : 'apMarkedPlanned', { x: row.title }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater(next === 'planned' ? `act-${row.id}` : 'add');
  }

  async function remove(row: AppointmentRow) {
    setToDelete(null);
    try {
      await deleteAppointment(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('apDeleted', { x: row.title }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  async function cancelAtPractice(row: AppointmentRow) {
    setToCancel(null);
    try {
      await cancelBooking(row.id);
      await load();
      setStatus(t('obCancelled', { x: row.title }));
    } catch (e) {
      console.error(e);
      setStatus(t(bookingOwnerErrorKey(e)), false);
    }
    focusLater('add');
  }

  /** Warteliste und Ausweichtermine: Aktion ausführen, neu laden, Meldung */
  async function wlRun(fn: () => Promise<unknown>, ok: string) {
    setWlBusy(true);
    try {
      await fn();
      await load();
      setStatus(ok);
    } catch (e) {
      console.error(e);
      setStatus(t(bookingOwnerErrorKey(e)), false);
    } finally {
      setWlBusy(false);
    }
  }
  const slotText = (iso: string) => `${formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(iso)}`;

  function exportIcs(row: AppointmentRow) {
    const ics = appointmentIcs({ id: row.id, title: row.title, petName: petName(row.pet_id), startsAt: row.starts_at, endsAt: row.ends_at, location: row.location, status: row.status });
    downloadIcs(ics, icsFilename(`${row.title}-${petName(row.pet_id)}`));
    setStatus(t('calDownloaded'));
  }

  const item = (r: AppointmentRow) => {
    const fromPractice = !!r.practice_appointment_id;
    const canChange = editable.has(r.pet_id) && !fromPractice;
    const bk = fromPractice ? bookings.get(r.id) : undefined;
    const reason = bk?.cancel_reason && (CANCEL_REASONS as readonly string[]).includes(bk.cancel_reason) ? (bk.cancel_reason as CancelReason) : null;
    const st = isApptStatus(r.status) ? r.status : 'planned';
    const isPast = st === 'planned' && localDate(new Date(r.starts_at)) < today;
    return (
      <li key={r.id} className={`record-row appt-row${st !== 'planned' ? ' is-closed' : ''}`}>
        <span className="date-block" aria-hidden="true">
          <span className="date-block-mon">{new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(r.starts_at))}</span>
          <span className="date-block-day">{new Date(r.starts_at).getDate()}</span>
        </span>
        <div className="record-main">
          <span className="appt-when mono">
            {formatDateTime(r.starts_at, locale)}
            {r.ends_at && ` – ${formatTimeOnly(r.ends_at, locale)}`}
          </span>
          <span className="record-title">
            {r.title}
            {bk ? <span className={`pill ${OWNER_STATUS_TONE[bk.status]}`}>{t(OWNER_STATUS_LABEL[bk.status])}</span>
              : st !== 'planned' && <span className={`pill appt-${st}`}>{t(APPT_STATUS_LABEL[st])}</span>}
            {isPast && <span className="pill">{t('apPast')}</span>}
          </span>
          <span className="muted small">
            {[isApptKind(r.kind) ? t(APPT_KIND_LABEL[r.kind]) : r.kind, petName(r.pet_id), r.location].filter(Boolean).join(' · ')}
          </span>
          {r.note && <span className="small appt-note">{shorten(r.note)}</span>}
          {bk?.status === 'cancelled_practice' && reason && <span className="small">{t('rcReason')}: {t(CANCEL_LABEL[reason])}</span>}
          {fromPractice && bk?.status === 'new' && <span className="small practice-note">{t('obRequestedNote')}</span>}
          {fromPractice && (!bk || bk.status !== 'new') && <span className="small practice-note">{t('apFromPractice')}</span>}
          {bk && (bk.status === 'new' || bk.status === 'confirmed') && !isPast && (bk.reminders?.length ?? 0) > 0 && (
            <span className="small muted">{t('wlRemindRow', { h: bk.reminders!.map((h) => `${h} h`).join(', ') })}</span>
          )}
          {bk && !bk.can_cancel && (bk.status === 'new' || bk.status === 'confirmed') && editable.has(r.pet_id) && !isPast && (
            <span className="small muted">{bk.practice_phone ? t('obLatePhone', { p: bk.practice_phone }) : t('obLate')}</span>
          )}
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" aria-label={t('calExportL', { x: r.title })} onClick={() => exportIcs(r)}>
            <IconCalendar size={18} />
            {t('calExport')}
          </button>
          {bk?.can_cancel && editable.has(r.pet_id) && (
            <button type="button" className="btn btn-ghost" aria-label={t('apCancelL', { x: r.title })} onClick={() => setToCancel(r)}>
              {t('apCancel')}
            </button>
          )}
          {canChange && (
            <>
              {st === 'planned' ? (
                <>
                  <button type="button" ref={register(`act-${r.id}`)} className="btn btn-secondary" aria-label={t('apDoneL', { x: r.title })} onClick={() => void changeStatus(r, 'done')}>
                    {t('apDone')}
                  </button>
                  <button type="button" className="btn btn-ghost" aria-label={t('apCancelL', { x: r.title })} onClick={() => void changeStatus(r, 'cancelled')}>
                    {t('apCancel')}
                  </button>
                </>
              ) : (
                <button type="button" ref={register(`act-${r.id}`)} className="btn btn-ghost" aria-label={t('apReopenL', { x: r.title })} onClick={() => void changeStatus(r, 'planned')}>
                  {t('apReopen')}
                </button>
              )}
              <button type="button" ref={register(`edit-${r.id}`)} className="btn btn-ghost" aria-label={t('apEditL', { x: r.title })} onClick={() => { setMode({ kind: 'edit', row: r }); setStatus(''); }}>
                {t('editBtn')}
              </button>
              <button type="button" className="btn-icon" aria-label={t('apDelL', { x: r.title })} onClick={() => setToDelete(r)}>
                <IconTrash size={20} />
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('nav_termine')}</h1>
        <p className="muted">{t('apSub')}</p>
      </header>

      {!anyEditable && pets.length > 0 && <p className="notice notice-info">{t('apViewOnly')}</p>}
      <PetFilter pets={pets} value={filter} onChange={setFilter} />

      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {anyEditable && mode === null && (
            <div className="row-actions">
              <Link to="/termine/buchen" className="btn btn-primary">
                <IconCalendar size={20} />
                {t('obBookCta')}
              </Link>
              <button type="button" ref={register('add')} className="btn btn-secondary" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
                <IconPlus size={20} />
                {t('apAdd')}
              </button>
            </div>
          )}
          {anyEditable && mode && (
            <section className="card">
              <AppointmentForm
                key={mode.kind === 'edit' ? mode.row.id : 'add'}
                pets={editablePets}
                today={today}
                initial={mode.kind === 'edit' ? toForm(mode.row) : emptyForm(filter !== ALL_PETS && editable.has(filter) ? filter : editablePets.length === 1 ? editablePets[0]!.id : '', today)}
                editing={mode.kind === 'edit'}
                onCancel={() => {
                  const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                  setMode(null);
                  focusLater(back);
                }}
                onSave={async (petId, input) => {
                  if (mode.kind === 'edit') {
                    const row = await updateAppointment(mode.row.id, input);
                    replace(row);
                    setMode(null);
                    setStatus(t('apUpdated', { x: row.title }));
                    focusLater(`edit-${row.id}`);
                  } else {
                    const row = await addAppointment(petId, input);
                    setRows((cur) => [...(cur ?? []), row]);
                    setMode(null);
                    setStatus(t('apSaved', { x: row.title }));
                    focusLater('add');
                  }
                }}
              />
            </section>
          )}

          {(() => {
            const alts = (rows ?? []).filter((r) => (bookings.get(r.id)?.alternatives?.length ?? 0) > 0 && editable.has(r.pet_id));
            if (!alts.length && !waitlist.length) return null;
            return (
              <section className="card stack" aria-labelledby="ap-wl-h">
                <h2 id="ap-wl-h">{t('wlOwnerTitle')}</h2>
                <ul className="record-list">
                  {alts.map((r) => {
                    const bk = bookings.get(r.id)!;
                    return (
                      <li key={r.id} className="record-row">
                        <div className="record-main">
                          <span className="record-title">{t('wlAltFor', { x: r.title, n: petName(r.pet_id) })}</span>
                          <span className="small">{t('wlAltText', { p: bk.practice_name, d: slotText(r.starts_at) })}</span>
                          <div className="row-actions">
                            {bk.alternatives!.map((iso) => (
                              <button key={iso} type="button" className="btn btn-secondary" disabled={wlBusy} aria-label={t('wlAltTakeL', { d: slotText(iso) })}
                                onClick={() => void wlRun(() => takeAlternative(r.id, iso), t('wlAltTaken', { d: slotText(iso) }))}>{slotText(iso)}</button>
                            ))}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {waitlist.map((w) => (
                    <li key={w.id} className="record-row">
                      <div className="record-main">
                        {w.status === 'offered' && w.offered_at ? (
                          <span className="record-title">{t('wlFree', { d: formatIsoDate(dayOf(w.offered_at), lang), t: timeOf(w.offered_at), pet: w.pet_name })}</span>
                        ) : (
                          <span className="record-title">{w.pet_name} <span className="pill pill-warn">{t('wlWaiting')}</span></span>
                        )}
                        <span className="small">{w.practice_name} · {w.type_name} · {w.wish_day ? t('wlWish', { d: formatIsoDate(w.wish_day, lang) }) : t('wlWishAny')}</span>
                      </div>
                      <div className="row-actions">
                        {w.can_take && (
                          <button type="button" className="btn btn-primary" disabled={wlBusy}
                            onClick={() => void wlRun(async () => { if (!(await takeWaitlistOffer(w.id))) throw new Error('offer_expired'); }, t('wlTaken'))}>{t('wlTake')}</button>
                        )}
                        {editable.has(w.pet_id) && (
                          <button type="button" className="btn btn-ghost" disabled={wlBusy} aria-label={t('wlLeaveL', { n: w.pet_name })}
                            onClick={() => void wlRun(() => leaveWaitlist(w.id), t('wlLeft'))}>{t(w.status === 'offered' ? 'wlDecline' : 'wlLeave')}</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}

          <section className="card stack" aria-labelledby="ap-next-h">
            <h2 id="ap-next-h">{t('apNext')}</h2>
            {upcoming.length === 0 ? <p className="muted">{t('apNone')}</p> : <ul className="record-list">{upcoming.map(item)}</ul>}
            <p className="muted small">{t('calHint')}</p>
          </section>

          {past.length > 0 && (
            <details className="card disclosure">
              <summary>{t('apPastH', { n: past.length })}</summary>
              <ul className="record-list">{past.map(item)}</ul>
            </details>
          )}
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toCancel !== null} title={t('obCancelTitle')} confirmLabel={t('obCancelBtn')} onCancel={() => setToCancel(null)} onConfirm={() => toCancel && void cancelAtPractice(toCancel)}>
        {toCancel && <p>{t('obCancelAsk', { x: toCancel.title, d: formatDateTime(toCancel.starts_at, locale), p: toCancel.location ?? '' })}</p>}
      </ConfirmDelete>
      <ConfirmDelete open={toDelete !== null} title={t('apDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('apDelAsk', { x: toDelete.title, d: formatDateTime(toDelete.starts_at, locale) })}</p>}
      </ConfirmDelete>
    </div>
  );
}

function emptyForm(petId: string, today: string): ApptFormValues {
  return { petId, title: '', kind: 'vet', date: today, start: '', end: '', location: '', note: '' };
}

function toForm(r: AppointmentRow): ApptFormValues {
  const s = new Date(r.starts_at);
  return {
    petId: r.pet_id,
    title: r.title,
    kind: isApptKind(r.kind) ? r.kind : 'other',
    date: localDate(s),
    start: localTime(s),
    end: r.ends_at ? localTime(new Date(r.ends_at)) : '',
    location: r.location ?? '',
    note: r.note ?? '',
  };
}

const ORDER: (keyof ApptFormValues)[] = ['petId', 'title', 'kind', 'date', 'start', 'end', 'location', 'note'];

function AppointmentForm({
  pets,
  initial,
  today,
  editing,
  onSave,
  onCancel,
}: {
  pets: { id: string; name: string }[];
  initial: ApptFormValues;
  today: string;
  editing: boolean;
  onSave: (petId: string, v: AppointmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<ApptFormValues>(initial);
  const [errors, setErrors] = useState<ApptErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // erstes leeres Pflichtfeld (Tier, sonst Titel) fokussieren
    const first = formRef.current?.querySelector<HTMLElement>(initial.petId ? `#${CSS.escape(`${uid}-title`)}` : `#${CSS.escape(`${uid}-petId`)}`);
    first?.focus();
  }, [initial.petId, uid]);

  const set = <K extends keyof ApptFormValues>(k: K, val: ApptFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof ApptFormValues) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateAppointment(v);
    setErrors(errs);
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${first}`)}`)?.focus();
      return;
    }
    const starts = toInstant(v.date, v.start);
    const ends = v.end ? toInstant(v.date, v.end) : null;
    if (!starts) {
      setErrors({ start: 'apErrTime' });
      return;
    }
    setBusy(true);
    try {
      await onSave(v.petId, {
        title: v.title.trim(),
        kind: v.kind,
        starts_at: starts,
        ends_at: ends,
        location: v.location.trim() || null,
        note: v.note.trim() || null,
      });
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{editing ? t('apEditTitle') : t('apAdd')}</h2>
      <p className="small"><Link to="/praxen" className="link">{t('psFindLink')}</Link></p>
      <Field id={`${uid}-petId`} label={t('schedPet')} error={fe('petId')} required>
        {(a) => <PetSelect a={a} pets={pets} value={v.petId} disabled={editing} onChange={(x) => set('petId', x)} />}
      </Field>
      <Field id={`${uid}-title`} label={t('apTitle')} hint={t('apTitleHint')} error={fe('title')} required>
        {(a) => <input {...a} type="text" maxLength={APPT_TITLE_MAX} value={v.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <Field id={`${uid}-kind`} label={t('apKind')}>
        {(a) => (
          <select {...a} value={v.kind} onChange={(e) => isApptKind(e.target.value) && set('kind', e.target.value)}>
            {APPT_KINDS.map((k) => <option key={k} value={k}>{t(APPT_KIND_LABEL[k])}</option>)}
          </select>
        )}
      </Field>
      <div className="row-3">
        <Field id={`${uid}-date`} label={t('apDate')} error={fe('date')} required>
          {(a) => <input {...a} type="date" min={editing ? undefined : today} value={v.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field id={`${uid}-start`} label={t('apStart')} error={fe('start')} required>
          {(a) => <input {...a} type="time" value={v.start} onChange={(e) => set('start', e.target.value)} />}
        </Field>
        <Field id={`${uid}-end`} label={t('apEnd')} error={fe('end')} optional>
          {(a) => <input {...a} type="time" value={v.end} onChange={(e) => set('end', e.target.value)} />}
        </Field>
      </div>
      <Field id={`${uid}-location`} label={t('apLocation')} error={fe('location')} optional>
        {(a) => <input {...a} type="text" maxLength={APPT_LOCATION_MAX} autoComplete="off" value={v.location} onChange={(e) => set('location', e.target.value)} />}
      </Field>
      <Field id={`${uid}-note`} label={t('apNote')} error={fe('note')} optional>
        {(a) => <textarea {...a} maxLength={NOTE_MAX} rows={3} value={v.note} onChange={(e) => set('note', e.target.value)} />}
      </Field>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
