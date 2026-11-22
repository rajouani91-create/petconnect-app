import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, type Lang, type MessageKey } from '../../i18n';
import {
  DAYPARTS, DAYPART_LABEL, WISH_NOTE_MAX, declineOffer, requestOtherTime, takeInquirySlot, wishDays, wishValid,
  type Daypart, type OwnerInquiry,
} from '../../lib/inquiries';
import { timeOf } from '../../lib/practiceAppointments';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import { Dialog } from '../Dialog';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

/** Terminvorschlag der Praxis: eine Zeit wählen und annehmen, ablehnen oder eine andere Zeit wünschen. */
export function OfferCard({ q, busy, run, compact = false }: { q: OwnerInquiry; busy: boolean; run: Run; compact?: boolean }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const slots = q.offered_slots ?? [];
  const [pick, setPick] = useState(slots[0] ?? '');
  const [wish, setWish] = useState(false);
  const slotKey = slots.join(',');
  useEffect(() => { setPick(slotKey.split(',')[0] ?? ''); }, [slotKey]);

  const when = (iso: string) => `${formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(iso)}`;
  const created = formatDate(new Date(q.created_at), lang, { day: 'numeric', month: 'short' });
  const readOnly = !q.can_edit;

  return (
    <div className={`offer-card${compact ? ' is-compact' : ''}`} id={compact ? undefined : `of-${q.id}`}>
      {!compact && (
        <>
          <span className="pill pill-solid">{t('ofBadge')}</span>
          <p className="record-title">{q.pet_name} · {q.practice_name}</p>
        </>
      )}
      <p className="small muted">
        {[q.offered_type_name && (q.offered_minutes ? t('ofTypeMin', { x: q.offered_type_name, n: q.offered_minutes }) : q.offered_type_name),
          !compact && t('ofForInquiry', { x: q.message.length > 40 ? `${q.message.slice(0, 40)}…` : q.message, d: created })].filter(Boolean).join(' · ')}
      </p>
      <fieldset className="offer-slots" disabled={busy || readOnly}>
        <legend className="sr-only">{t('ofPick')}</legend>
        {slots.map((iso) => (
          <label key={iso} className={`offer-slot${iso === pick ? ' is-picked' : ''}`}>
            <input type="radio" name={`${uid}-slot`} value={iso} checked={iso === pick} onChange={() => setPick(iso)} />
            <span>{when(iso)}</span>
          </label>
        ))}
      </fieldset>
      {readOnly ? <p className="small muted">{t('ofReadOnly')}</p> : (
        <div className="offer-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !pick}
            onClick={() => void run(() => takeInquirySlot(q.id, pick), t('iqTaken', { d: when(pick) }))}>
            ✓ {t('ofAccept', { d: pick ? when(pick) : '' })}
          </button>
          <div className="offer-actions-2">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setWish(true)}>{t('ofOther')}</button>
            <button type="button" className="btn btn-ghost btn-danger-text" disabled={busy}
              onClick={() => void run(() => declineOffer(q.id), t('ofDeclined'))}>{t('ofDecline')}</button>
          </div>
        </div>
      )}
      <p className="small muted">{t('ofHint')}</p>
      <WishSheet q={wish ? q : null} run={run} onClose={() => setWish(false)} />
    </div>
  );
}

/** Andere Zeit wünschen: Tage, Tageszeit, Notiz */
function WishSheet({ q, run, onClose }: { q: OwnerInquiry | null; run: Run; onClose: () => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [days, setDays] = useState<string[]>([]);
  const [nextWeek, setNextWeek] = useState(false);
  const [part, setPart] = useState<Daypart>('any');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const id = q?.id;
  useEffect(() => { setDays([]); setNextWeek(false); setPart('any'); setNote(''); setErr(null); }, [id]);

  const toggle = (d: string) => { setDays((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d].sort())); setErr(null); };
  const label = (d: string) => formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

  async function submit() {
    if (!q) return;
    const e = wishValid(days, nextWeek, note);
    if (e) { setErr(e); return; }
    setBusy(true);
    if (await run(() => requestOtherTime(q.id, days, nextWeek, part, note), t('ofWishSent'))) onClose();
    setBusy(false);
  }

  return (
    <Dialog open={q !== null} sheet title={t('ofOther')} onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void submit()}>{t('ofWishSend')}</button>
        </>
      )}>
      {q && (
        <div className="stack">
          <p className="muted small">{t('ofWishIntro')}</p>
          <fieldset className="field">
            <legend>{t('ofWishDays')}</legend>
            <div className="chips-wrap">
              {wishDays(today).map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={days.includes(d)} onClick={() => toggle(d)}
                  aria-label={formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}>
                  {label(d)}
                </button>
              ))}
              <button type="button" className="chip" aria-pressed={nextWeek} onClick={() => { setNextWeek((v) => !v); setErr(null); }}>{t('ofNextWeek')}</button>
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>{t('ofWishPart')}</legend>
            <div className="chips-wrap">
              {DAYPARTS.map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={part === p} onClick={() => setPart(p)}>{t(DAYPART_LABEL[p])}</button>
              ))}
            </div>
          </fieldset>
          <label className="field" htmlFor={`${uid}-note`}>
            <span className="label-text">{t('obMoveNote')} <span className="muted small">({t('optional')})</span></span>
            <textarea id={`${uid}-note`} rows={3} maxLength={WISH_NOTE_MAX} value={note} placeholder={t('ofWishNotePh')}
              onChange={(e) => { setNote(e.target.value); setErr(null); }} />
          </label>
          {err && <p className="notice notice-crit" role="alert">{t(err)}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** Wunsch der Halter:in als kurzer Text für die Praxis */
export function wishSummary(w: { days: string[]; next_week: boolean; daypart: Daypart; note: string | null }, lang: Lang,
  t: ReturnType<typeof useI18n>['t']): string {
  const days = w.days.map((d) => formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
  if (w.next_week) days.push(t('ofNextWeek'));
  const parts = [days.join(', '), w.daypart !== 'any' ? t(DAYPART_LABEL[w.daypart]) : ''].filter(Boolean).join(' · ');
  return [parts, w.note ? `„${w.note}“` : ''].filter(Boolean).join(' – ');
}

