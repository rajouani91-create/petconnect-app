import { useId } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, formatIsoDateShort, localeOf } from '../../i18n';
import { formatKg } from '../../lib/record';
import { vitalText } from './VitalsCard';
import { REASON_LABEL, isClinical, recordTimeline, restoreEntry, type RecVoided } from '../../lib/practiceRecord';
import { KIND_LABEL, type RecordCtx } from './shared';
import { KIND_LABEL as VITAL_LABEL, isVitalKind, type VitalKind } from '../../lib/vital';

/** Die letzten 12 Ereignisse der Akte */
export function TimelineCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const items = recordTimeline(ctx.rec, (kg) => t('wkKgValue', { kg: formatKg(kg, localeOf(lang)) }), 15, (v) => vitalText(t, lang, v.kind, v.value));
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('hsTimeline')}</h2>
      {items.length === 0 ? <p className="muted">{t('hsTlEmpty')}</p> : (
        <ol className="record-timeline">
          {items.map((i) => (
            <li key={i.key} className="tl-row">
              <span className="mono muted small tl-when">{formatIsoDateShort(i.date, lang)}{i.time ? ` ${i.time}` : ''}</span>
              <span className={`pill tl-${i.kind}`}>{t(KIND_LABEL[i.kind])}</span>
              <span className="tl-text">{i.title}{i.detail ? <span className="muted"> · {i.detail}</span> : null}</span>
              {i.by && <span className="muted small tl-by">{i.by}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Stornierte Einträge dieser Praxis: durchgestrichen, mit Grund; wiederherstellbar (außer Gewicht) */
export function VoidedCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { rec } = ctx;
  if (rec.voided.length === 0) return null;
  const label = (v: RecVoided) => {
    const d = v.data;
    if (v.kind === 'weight') return t('wkKgValue', { kg: formatKg(Number(d.kg), localeOf(lang)) });
    if (v.kind === 'vital' && isVitalKind(String(d.vkind))) return `${t(VITAL_LABEL[d.vkind as VitalKind])} ${vitalText(t, lang, d.vkind as VitalKind, Number(d.value))}`;
    if (v.kind === 'finding') return String(d.title ?? '');
    if (v.kind === 'medication') return [d.name, d.dosage].filter(Boolean).join(' · ');
    return [d.name, d.given_on && formatIsoDate(String(d.given_on), lang)].filter(Boolean).join(' · ');
  };
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('rcVoidedH', { n: rec.voided.length })}</h2>
      <ul className="record-list">
        {rec.voided.map((v) => (
          <li key={v.id} className="record-row is-closed">
            <div className="record-main">
              <span className="record-title"><span className="pill">{t(KIND_LABEL[v.kind])}</span><s>{label(v)}</s></span>
              <span className="muted small">
                {t('rcVoidedBy', { d: formatIsoDate(v.voided_at.slice(0, 10), lang), n: v.voided_by_name ?? '–', r: t(REASON_LABEL[v.reason]) })}
                {v.note ? ` – ${v.note}` : ''}
              </span>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost" onClick={() => ctx.openLog({ entryId: v.id, title: `${t(KIND_LABEL[v.kind])} · ${label(v)}` })}>{t('rcLog')}</button>
              {v.kind !== 'weight' && isClinical(rec.role) && (
                <button type="button" className="btn btn-secondary" disabled={ctx.busy} onClick={() => void ctx.run(() => restoreEntry(v.id), t('rcRestored'))}>{t('rcRestore')}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">{t('rcNeverDeleted')}</p>
    </section>
  );
}
