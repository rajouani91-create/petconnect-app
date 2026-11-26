import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import {
  CATEGORY_LABEL, NOTIF_CATEGORIES, PAGE_SIZE, completeTask, deleteNotification, doneTaskKeys, groupByDay, listNotifications, markRead, markUnread,
  notifTarget, notifText, taskKey, taskOf, type NotifCategory, type NotificationRow,
} from '../lib/notifications';
import { addDays } from '../lib/booking';
import { dayOf, timeOf } from '../lib/practiceAppointments';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { IconBell, IconCalendar, IconChat, IconList, IconPaw, IconShield, IconTrash, KindIcon } from '../components/Icons';
import { Loading } from '../components/Loading';
import { StatusLine, useStatus } from '../components/record/shared';

const ICON: Record<NotifCategory, ReactNode> = {
  practice: <IconPaw size={20} />, medication: <KindIcon kind="med" size={20} />, feeding: <KindIcon kind="feed" size={20} />,
  care: <IconList size={20} />, vaccination: <IconShield size={20} />, appointment: <IconCalendar size={20} />,
  message: <IconChat size={20} />, system: <IconBell size={20} />,
};

/** Benachrichtigungszentrum (Auftrag 13): alle Benachrichtigungen, nach Tagen, mit Kategorien; Antippen öffnet das Ziel. */
export function NotificationCenter({ practice = false }: { practice?: boolean }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const navigate = useNavigate();
  const today = zonedNow(useNow()).date;
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [cat, setCat] = useState<NotifCategory | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();
  // erledigte Aufgaben hinter Alltags- und Medikamenten-Meldungen (Schlüssel: taskKey)
  const [done, setDone] = useState<Set<string>>(() => new Set());

  // Erledigtes nachladen; Meldungen zu schon erledigten Aufgaben gelten als gelesen
  const syncDone = useCallback(async (rs: NotificationRow[]) => {
    try {
      const keys = await doneTaskKeys(rs);
      setDone((cur) => new Set([...cur, ...keys]));
      const stale = rs.filter((r) => { const tk = taskOf(r); return !r.read_at && tk !== null && keys.has(taskKey(tk)); }).map((r) => r.id);
      if (stale.length > 0) {
        await markRead(stale);
        const at = new Date().toISOString();
        setRows((cur) => (cur ? cur.map((r) => (stale.includes(r.id) ? { ...r, read_at: at } : r)) : cur));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await listNotifications();
      setRows(r);
      setMore(r.length === PAGE_SIZE);
      setLoadErr(false);
      void syncDone(r);
    } catch (e) {
      console.error(e);
      setLoadErr(true);
      setRows((cur) => cur ?? []);
    }
  }, [syncDone]);
  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const r = await listNotifications(last.created_at);
      setRows((cur) => [...(cur ?? []), ...r.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]);
      setMore(r.length === PAGE_SIZE);
      void syncDone(r);
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<void>, ok: string, patch: (rs: NotificationRow[]) => NotificationRow[]) {
    setBusy(true);
    try {
      await fn();
      setRows((cur) => (cur ? patch(cur) : cur));
      setStatus(ok);
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  async function complete(n: NotificationRow) {
    const tk = taskOf(n);
    if (!tk) return;
    const key = taskKey(tk);
    const at = new Date().toISOString();
    await run(() => completeTask(n), t(tk.type === 'medication' ? 'ncGivenDone' : 'ncTaskDone'), (rs) => rs.map((r) => {
      const o = taskOf(r);
      return o && taskKey(o) === key ? { ...r, read_at: r.read_at ?? at } : r;
    }));
    setDone((cur) => new Set([...cur, key]));
  }

  async function open(n: NotificationRow) {
    if (!n.read_at) {
      try { await markRead([n.id]); } catch (e) { console.error(e); }
    }
    navigate(notifTarget(n.url, practice));
  }

  const present = NOTIF_CATEGORIES.filter((c) => (rows ?? []).some((r) => r.category === c));
  const shown = (rows ?? []).filter((r) => (cat === 'all' || r.category === cat) && (!unreadOnly || !r.read_at));
  const unread = (rows ?? []).filter((r) => !r.read_at).length;
  const dayLabel = (d: string) => (d === today ? t('ncToday') : d === addDays(today, -1) ? t('ncYesterday') : formatIsoDate(d, lang));
  const settings = practice ? '/praxis/benachrichtigungen' : '/mehr/benachrichtigungen';

  return (
    <div className="page stack-lg">
      <header className="page-head nc-head">
        <div>
          <h1>{t('ncTitle')}</h1>
          <p className="muted">{t('ncSub')}</p>
        </div>
        <Link to={settings} className="btn btn-ghost btn-sm">{t('ncSettings')}</Link>
      </header>

      {loadErr && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows ? <Loading /> : (
        <>
          <div className="nc-tools">
            <div className="quick-chips" role="group" aria-label={t('ncFilter')}>
              <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>{t('hsAll')}</button>
              {present.map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>{t(CATEGORY_LABEL[c])}</button>
              ))}
              <button type="button" className="chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>{t('ncUnreadOnly')}</button>
            </div>
            {unread > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                onClick={() => void run(() => markRead(null), t('ncAllReadDone'), (rs) => rs.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })))}>
                {t('ncAllRead', { n: unread })}
              </button>
            )}
          </div>

          {shown.length === 0 && !loadErr && (
            <div className="empty-hint stack">
              <p>{t(rows.length === 0 ? 'ncEmpty' : 'ncEmptyFilter')}</p>
              {rows.length === 0 && <p className="muted small">{t('ncEmptyHint')}</p>}
            </div>
          )}

          {groupByDay(shown, dayOf).map((g) => (
            <section key={g.day} className="stack-sm" aria-labelledby={`${uid}-${g.day}`}>
              <h2 id={`${uid}-${g.day}`} className="section-label">{dayLabel(g.day)}</h2>
              <ul className="nc-list">
                {g.rows.map((n) => {
                  const { title, body } = notifText(n, lang);
                  const when = timeOf(n.created_at);
                  const task = taskOf(n);
                  const isDone = task !== null && done.has(taskKey(task));
                  return (
                    <li key={n.id} className={`nc-item${n.read_at ? '' : ' is-unread'}`}>
                      <span className={`nc-icon nc-${n.category}`} aria-hidden="true">{ICON[n.category]}</span>
                      <div className="nc-col">
                        <button type="button" className="nc-main" onClick={() => void open(n)}
                          aria-label={`${n.read_at ? '' : `${t('ncUnread')}: `}${title}. ${body}. ${t(CATEGORY_LABEL[n.category])}, ${when}`}>
                          <span className="nc-title">{title}</span>
                          {body && <span className="nc-body">{body}</span>}
                          <span className="nc-meta">{t(CATEGORY_LABEL[n.category])} · {when}</span>
                        </button>
                        {task && (
                          <div className="nc-task">
                            {isDone ? (
                              <span className="pill pill-ok">✓ {t(task.type === 'medication' ? 'ncGiven' : 'ncDoneState')}</span>
                            ) : (
                              <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                                aria-label={t('ncDoL', { x: title })} onClick={() => void complete(n)}>
                                ✓ {t(task.type === 'medication' ? 'ncGive' : 'ncDo')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="nc-actions">
                        {!n.read_at && <span className="nc-dot" aria-hidden="true" />}
                        {!task && (
                          <button type="button" className="btn-icon btn-sm nc-read" disabled={busy}
                            aria-label={t(n.read_at ? 'ncMarkUnreadL' : 'ncMarkReadL', { x: title })} title={t(n.read_at ? 'ncMarkUnread' : 'ncMarkRead')}
                            onClick={() => void (n.read_at
                              ? run(() => markUnread(n.id), t('ncMarkedUnread'), (rs) => rs.map((r) => (r.id === n.id ? { ...r, read_at: null } : r)))
                              : run(() => markRead([n.id]), t('ncMarkedRead'), (rs) => rs.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r))))}>
                            <span aria-hidden="true">{n.read_at ? '○' : '✓'}</span>
                          </button>
                        )}
                        <button type="button" className="btn-icon btn-sm" disabled={busy} aria-label={t('ncDeleteL', { x: title })} title={t('ncDelete')}
                          onClick={() => void run(() => deleteNotification(n.id), t('ncDeleted'), (rs) => rs.filter((r) => r.id !== n.id))}>
                          <IconTrash size={18} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {more && <button type="button" className="btn btn-ghost btn-start" disabled={busy} onClick={() => void loadMore()}>{t('ncMore')}</button>}
          <p className="muted small">{t('ncKeep')}</p>
        </>
      )}
      <StatusLine status={status} />
    </div>
  );
}
