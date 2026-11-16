import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatIsoDate, type MessageKey } from '../i18n';
import { Switch } from '../components/Switch';
import { useNow } from '../lib/useNow';
import {
  RECALL_FILTERS, RECALL_FILTER_LABEL, canResend, filterRecalls, isSent, practiceRecalls, recallErrorKey, sendAllRecalls, sendRecall, setRecallAuto,
  type RecallData, type RecallFilter, type RecallItem,
} from '../lib/practiceRecall';
import { usePractice } from './PracticeProvider';

/** Fälligkeit als Text: „3 Tage überfällig“, „heute fällig“, „in 12 Tagen“ */
export function dueLabel(days: number): { key: MessageKey; n: number; tone: string } {
  if (days < 0) return { key: days === -1 ? 'rclOverdue1' : 'rclOverdueN', n: -days, tone: 'pill-crit' };
  if (days === 0) return { key: 'rclToday', n: 0, tone: 'pill-crit' };
  return { key: days === 1 ? 'rclIn1' : 'rclInN', n: days, tone: days <= 14 ? 'pill-warn' : '' };
}

/** Recall: fällige Impfungen der Patienten (überfällig oder in 60 Tagen), Erinnerung per Klick, alle oder automatisch. */
export function PracticeRecall() {
  const { t } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const uid = useId();
  const now = useNow();
  const [data, setData] = useState<RecallData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filter, setFilter] = useState<RecallFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await practiceRecalls());
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  useEffect(() => {
    if (!pending) void load();
  }, [load, pending]);

  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    setMsg(null);
    try {
      const text = await fn();
      await load();
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: t(recallErrorKey(e)) });
    } finally {
      setBusy(null);
    }
  };

  const open = useMemo(() => (data ? data.items.filter((r) => !isSent(r)).length : 0), [data]);
  const shown = useMemo(() => (data ? filterRecalls(data.items, filter) : []), [data, filter]);
  const overdue = data ? data.items.filter((r) => r.days < 0).length : 0;

  return (
    <div className="page stack-lg">
      <div className="page-head page-head-row patients-head">
        <div>
          <h1>{t('rclTitle')}</h1>
          <p className="muted">{t('rclSub')}</p>
        </div>
        {data && data.items.length > 0 && (
          <div className="row-actions">
            <button type="button" className="btn btn-primary" disabled={busy !== null || open === 0}
              onClick={() => void run('all', async () => t('rclAllSent', { n: await sendAllRecalls() }))}>
              {open > 0 ? t('rclSendAll', { n: open }) : t('rclAllDone')}
            </button>
          </div>
        )}
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('scPending')}</p>
        </div>
      ) : loadErr && !data ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !data ? <p className="muted">{t('loading')}</p> : (
        <>
          <div className="record-status" role="status" aria-live="polite">
            {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
          </div>
          <section className="card stack" aria-labelledby={`${uid}-auto`}>
            <h2 id={`${uid}-auto`} className="sr-only">{t('rclAuto')}</h2>
            <Switch label={t('rclAuto')} checked={data.auto} disabled={!data.can_edit || busy !== null}
              onChange={(on) => void run('auto', async () => { await setRecallAuto(on); return t(on ? 'rclAutoOn' : 'rclAutoOff'); })} />
            {!data.can_edit && <p className="small muted">{t('rclAutoLead')}</p>}
            <p className="small muted note-line">{t('rclNote')}</p>
          </section>
          {data.items.length === 0 ? (
            <div className="card stack">
              <p>{t('rclNone')}</p>
              <p className="small muted">{t('rclNoneHint')}</p>
            </div>
          ) : (
            <>
              {overdue > 0 && <p className="notice notice-warn">{t('rclOverdueHint', { n: overdue })}</p>}
              <div className="chips-wrap" role="group" aria-label={t('bkFilterL')}>
                {RECALL_FILTERS.map((f) => (
                  <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {t(RECALL_FILTER_LABEL[f])} ({filterRecalls(data.items, f).length})
                  </button>
                ))}
              </div>
              {shown.length === 0 ? <p className="muted">{t('rclNoneFilter')}</p> : (
                <ul className="record-list card">
                  {shown.map((r) => <Row key={r.vaccination_id} r={r} now={now} busy={busy} onSend={() => void run(r.vaccination_id, async () => { await sendRecall(r.vaccination_id); return t('rclSent', { pet: r.pet_name }); })} />)}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r, now, busy, onSend }: { r: RecallItem; now: Date; busy: string | null; onSend: () => void }) {
  const { t, lang } = useI18n();
  const due = dueLabel(r.days);
  const sent = isSent(r);
  return (
    <li className="record-row rc-row">
      <div className="record-main">
        <span className="record-title"><Link to={`/praxis/patienten/${r.pet_id}`} className="link">{r.pet_name}</Link> <span className="muted">· {r.owner_name}</span></span>
      </div>
      <div className="record-main">
        <span>{r.vaccine}</span>
        <span className="small muted">{t('rclDueOn', { d: formatIsoDate(r.due_on, lang) })}</span>
      </div>
      <span className={`pill ${due.tone}`}>{t(due.key, { n: due.n })}</span>
      {sent && (r.sent_at === null || !canResend(r, now)) ? (
        <span className="rc-sent" title={r.sent_at ? t('rclSentBy', { name: r.sent_by_name ?? '–', d: formatDate(new Date(r.sent_at), lang, { day: 'numeric', month: 'short' }) }) : t('rclAutoSent')}>
          ✓ {t('rclSentShort')}
          <span className="sr-only"> {r.sent_at ? t('rclSentBy', { name: r.sent_by_name ?? '–', d: formatDate(new Date(r.sent_at), lang, { day: 'numeric', month: 'short' }) }) : t('rclAutoSent')}</span>
        </span>
      ) : (
        <button type="button" className={`btn ${sent ? 'btn-secondary' : 'btn-primary'}`} disabled={busy !== null} onClick={onSend}>
          {busy === r.vaccination_id ? t('rclSending') : sent ? t('rclResend') : t('rclSend')}
        </button>
      )}
    </li>
  );
}
