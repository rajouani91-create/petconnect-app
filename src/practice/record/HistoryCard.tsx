import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../../i18n';
import { isClinical, setHistoryNote, type RecHistory } from '../../lib/practiceRecord';
import type { RecordCtx } from './shared';

const CHOICE: Record<string, MessageKey> = {
  breeder: 'hsOrigBreeder', shelter: 'hsOrigShelter', private: 'hsOrigPrivate', found: 'hsOrigFound', abroad: 'hsOrigAbroad',
  yes: 'hsYes', no: 'hsNo', unknown: 'hsUnknown',
  flat: 'hsHomeFlat', outdoor_access: 'hsHomeOutdoor', house_garden: 'hsHomeGarden', outdoor_stable: 'hsHomeStable',
};
const ROWS: [keyof RecHistory, MessageKey, 'choice' | 'date' | 'text'][] = [
  ['origin', 'hsOrigin', 'choice'], ['with_since', 'hsWithSince', 'date'], ['neutered', 'hsNeutered', 'choice'], ['housing', 'hsHousing', 'choice'],
  ['past_illness', 'hsPastIll', 'text'], ['surgeries', 'hsSurg', 'text'], ['chronic', 'hsChronic', 'text'], ['allergies', 'hsAllergy', 'text'],
  ['past_medication', 'hsPastMed', 'text'], ['travel', 'hsTravel', 'text'], ['previous_practice', 'hsPrevPractice', 'text'], ['other', 'hsOther', 'text'],
];

/** Vorgeschichte der Halter:in (nur lesen) und die Ergänzung der Praxis, die die Halter:in sieht. */
export function HistoryCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { rec } = ctx;
  const h = rec.history;
  const [note, setNote] = useState(rec.history_note?.text ?? '');
  const filled = ROWS.filter(([k]) => (h?.[k] ?? '').toString().trim());
  const show = (k: keyof RecHistory, kind: 'choice' | 'date' | 'text') => {
    const x = String(h?.[k] ?? '');
    return kind === 'date' ? formatIsoDate(x, lang) : kind === 'choice' && CHOICE[x] ? t(CHOICE[x]) : x;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    await ctx.run(() => setHistoryNote(ctx.petId, note), t('rcNoteSaved'));
  }

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('hsTitle')}</h2>
      {filled.length === 0 ? <p className="muted">{t('hsEmpty')}</p> : (
        <>
          <dl className="kv kv-2">
            {filled.map(([k, label, kind]) => (
              <div key={k} className="kv-pair">
                <dt>{t(label)}</dt>
                <dd className="pre-line">{show(k, kind)}</dd>
              </div>
            ))}
          </dl>
          {h?.updated_at && <p className="muted small">{t('hsFilledOn', { date: formatIsoDate(h.updated_at.slice(0, 10), lang) })}</p>}
        </>
      )}
      {isClinical(rec.role) ? (
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor={`${uid}-note`}>{t('rcHistNote')}</label>
            <textarea id={`${uid}-note`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${uid}-hint`} />
            <p className="hint" id={`${uid}-hint`}>{t('rcHistNoteHint')}</p>
          </div>
          <button type="submit" className="btn btn-secondary btn-start" disabled={ctx.busy || note.trim() === (rec.history_note?.text ?? '')}>{t('rcHistNoteSave')}</button>
        </form>
      ) : rec.history_note?.text ? (
        <div>
          <p className="label-text">{t('rcHistNote')}</p>
          <p className="pre-line">{rec.history_note.text}</p>
        </div>
      ) : null}
    </section>
  );
}
