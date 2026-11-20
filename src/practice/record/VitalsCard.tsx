// Vitalwerte und Gewicht der Akte (Release B): Verlauf mit Uhrzeit, eigene Einträge der Praxis korrigieren oder stornieren.
import { useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf, type Lang } from '../../i18n';
import { formatKg } from '../../lib/record';
import { berlinHHMM } from '../../lib/medication';
import { berlinDay } from '../../lib/monthReport';
import { CONTEXT_LABEL, KIND_LABEL as VITAL_LABEL, isVitalContext, type VitalKind } from '../../lib/vital';
import { entryForm, vitalForm, type RecVital } from '../../lib/practiceRecord';
import type { RecordCtx } from './shared';

type TFn = ReturnType<typeof useI18n>['t'];

/** „38,6 °C“ bzw. „96 pro Min.“ */
export function vitalText(t: TFn, lang: Lang, kind: VitalKind, value: number): string {
  const v = formatKg(Number(value), localeOf(lang));
  return kind === 'temperature' ? t('vtValTemp', { v }) : t('vtValRate', { v });
}

type Filter = 'all' | 'weight' | VitalKind;
const FILTERS: Filter[] = ['all', 'weight', 'temperature', 'heart_rate', 'resp_rate'];

interface Row { key: string; day: string; time: string | null; label: string; value: string; ctx: string | null; by: string | null; fromOwner: boolean; edit?: () => void; voidIt?: () => void }

export function VitalsCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const { rec } = ctx;
  const locale = localeOf(lang);
  const num = (n: number) => formatKg(n, locale);

  const rows: Row[] = [];
  if (filter === 'all' || filter === 'weight') {
    for (const w of rec.weights) {
      const value = t('wkKgValue', { kg: num(Number(w.kg)) });
      const title = `${t('hsKindWeight')} · ${value}`;
      rows.push({
        key: `w-${w.id}`, day: w.measured_on, time: null, label: t('hsKindWeight'), value, ctx: null, by: w.by_name, fromOwner: !w.entry_id,
        ...(w.mine && w.entry_id ? {
          edit: () => ctx.openEdit({ kind: 'weight', entryId: w.entry_id!, title, values: entryForm('weight', { kg: w.kg, measured_on: w.measured_on }, num) }),
          voidIt: () => ctx.openVoid({ entryId: w.entry_id!, title }),
        } : {}),
      });
    }
  }
  for (const v of rec.vitals as RecVital[]) {
    if (filter !== 'all' && filter !== v.kind) continue;
    const value = vitalText(t, lang, v.kind, v.value);
    const title = `${t(VITAL_LABEL[v.kind])} · ${value}`;
    rows.push({
      key: `v-${v.id}`, day: berlinDay(v.measured_at), time: berlinHHMM(v.measured_at), label: t(VITAL_LABEL[v.kind]), value,
      ctx: isVitalContext(v.context) ? t(CONTEXT_LABEL[v.context]) : null, by: v.by_name, fromOwner: v.source === 'owner',
      ...(v.mine && v.entry_id ? {
        edit: () => ctx.openEdit({ kind: 'vital', entryId: v.entry_id!, title, values: vitalForm(v, num) }),
        voidIt: () => ctx.openVoid({ entryId: v.entry_id!, title }),
      } : {}),
    });
  }
  rows.sort((a, b) => b.day.localeCompare(a.day) || (b.time ?? '').localeCompare(a.time ?? ''));

  return (
    <section className="stack" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="sr-only">{t('rcVitalsH')}</h3>
      <div className="chips-wrap" role="group" aria-label={t('rcFilterL')}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t('hsAll') : f === 'weight' ? t('hsKindWeight') : t(VITAL_LABEL[f])}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className="muted">{t('rcVitalsNone')}</p> : (
        <ul className="record-list">
          {rows.slice(0, 80).map((r) => (
            <li key={r.key} className="record-row">
              <div className="record-main">
                <span className="record-title">{r.label} · {r.value}</span>
                <span className="muted small">
                  {[`${formatIsoDateShort(r.day, lang)}${r.time ? ` ${r.time}` : ''}`, r.ctx, r.fromOwner ? t('rcByOwner') : r.by].filter(Boolean).join(' · ')}
                </span>
              </div>
              {r.edit && (
                <div className="row-actions">
                  <button type="button" className="btn btn-ghost" aria-label={t('rcEditL', { n: r.value })} onClick={r.edit}>{t('editBtn')}</button>
                  <button type="button" className="btn btn-ghost" aria-label={t('rcVoidL', { n: r.value })} onClick={r.voidIt}>{t('rcVoid')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t('rcVitalsFoot')}</p>
    </section>
  );
}
