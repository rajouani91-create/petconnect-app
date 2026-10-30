import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf } from '../../i18n';
import { addWeight, deleteWeight, listWeights, updateWeight, type WeightRow } from '../../lib/api';
import { KG_ERROR, WEIGHT_RANGES, chartPoints, filterWeightsByRange, formatDelta, formatKg, parseKg, pastDateError, recordErrorKey, sortWeightsDesc, weightDeltas, weightTrend, type WeightRange } from '../../lib/record';
import type { MessageKey } from '../../i18n';
import type { FieldError } from '../../lib/validate';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ByLine, ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';

type Mode = { kind: 'add' } | { kind: 'edit'; row: WeightRow } | null;

const RANGE_LABEL: Record<WeightRange, MessageKey> = { '30d': 'wkRange30', '3m': 'wkRange3m', '6m': 'wkRange6m', all: 'wkRangeAll' };

/** Gewicht: aktuelles Gewicht, Verlauf als Diagramm (ab 2 Werten) und Liste, Eintragen/Ändern/Löschen. */
export function WeightSection({ petId, editable, today, myId, names }: { petId: string; editable: boolean; today: string; myId: string | undefined; names: ReadonlyMap<string, string> }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const [rows, setRows] = useState<WeightRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<WeightRow | null>(null);
  const [range, setRange] = useState<WeightRange>('all');
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      setRows(sortWeightsDesc(await listWeights(petId)));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petId]);
  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const kg = (n: number) => t('wkKgValue', { kg: formatKg(Number(n), locale) });
  const date = (iso: string) => formatIsoDateShort(iso, lang);
  const sorted = rows ?? [];
  const deltas = weightDeltas(sorted);
  const current = sorted[0];
  const inRange = filterWeightsByRange(sorted, range, today);
  const trend = weightTrend(inRange);

  async function save(measuredOn: string, value: number) {
    if (mode?.kind === 'edit') {
      const row = await updateWeight(mode.row.id, measuredOn, value);
      setRows((cur) => sortWeightsDesc((cur ?? []).map((r) => (r.id === row.id ? row : r))));
      setMode(null);
      setStatus(t('wkUpdated', { kg: kg(row.kg), d: date(row.measured_on) }));
      focusLater(`edit-${row.id}`);
    } else {
      const row = await addWeight(petId, measuredOn, value);
      setRows((cur) => sortWeightsDesc([...(cur ?? []), row]));
      setMode(null);
      setStatus(t('wkSaved', { kg: kg(row.kg), d: date(row.measured_on) }));
      focusLater('add');
    }
  }

  async function remove(row: WeightRow) {
    setToDelete(null);
    try {
      await deleteWeight(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('wkDeleted', { d: date(row.measured_on) }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  return (
    <div className="stack record-panel">
      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {current ? (
            <div className="weight-now">
              <span className="label">{t('wkNow')}</span>
              <span className="weight-now-value">{kg(current.kg)}</span>
              <span className="muted small">{t('wkMeasuredOn', { d: date(current.measured_on) })}</span>
            </div>
          ) : (
            <p className="muted">{t('wkNone')}</p>
          )}

          {sorted.length >= 2 && (
            <div className="stack">
              <div className="range-chips" role="group" aria-label={t('wkRangeL')}>
                {WEIGHT_RANGES.map((r) => (
                  <button key={r} type="button" className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>
                    {t(RANGE_LABEL[r])}
                  </button>
                ))}
              </div>
              {inRange.length >= 2 ? <WeightChart rows={inRange} /> : <p className="muted">{t('wkRangeFew')}</p>}
              {trend && (
                <p className="muted small" role="status" aria-live="polite">
                  {t('wkTrend', { d: date(trend.from), delta: formatDelta(trend.deltaKg, locale), pct: `${trend.pct > 0 ? '+' : trend.pct < 0 ? '−' : '±'}${Math.abs(trend.pct)}` })}
                </p>
              )}
            </div>
          )}

          {editable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-secondary btn-start" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('wkAdd')}
            </button>
          )}
          {editable && mode && (
            <WeightForm
              key={mode.kind === 'edit' ? mode.row.id : 'add'}
              today={today}
              initial={mode.kind === 'edit' ? { date: mode.row.measured_on, kg: formatKg(Number(mode.row.kg), locale) } : { date: today, kg: '' }}
              title={mode.kind === 'edit' ? t('wkEditTitle') : t('wkAdd')}
              onCancel={() => {
                const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                setMode(null);
                focusLater(back);
              }}
              onSave={save}
            />
          )}

          {sorted.length > 0 && (
            <div className="stack">
              <h3 id={`wk-list-${petId}`}>{t('wkHist')}</h3>
              <ul className="record-list" aria-labelledby={`wk-list-${petId}`}>
                {sorted.map((r, i) => {
                  const d = deltas[i];
                  return (
                    <li key={r.id} className="record-row">
                      <div className="record-main">
                        <span className="record-title">
                          <span className="mono">{date(r.measured_on)}</span> · {kg(r.kg)}
                        </span>
                        {d !== null && d !== undefined && (
                          <span className="muted small">{t('wkDelta', { d: formatDelta(d, locale) })}</span>
                        )}
                        <ByLine ownerId={r.owner_id} myId={myId} names={names} />
                      </div>
                      {editable && (
                        <div className="row-actions">
                          <button type="button" ref={register(`edit-${r.id}`)} className="btn btn-ghost" aria-label={t('wkEditL', { d: date(r.measured_on), kg: kg(r.kg) })} onClick={() => { setMode({ kind: 'edit', row: r }); setStatus(''); }}>
                            {t('editBtn')}
                          </button>
                          <button type="button" className="btn-icon" aria-label={t('wkDelL', { d: date(r.measured_on), kg: kg(r.kg) })} onClick={() => setToDelete(r)}>
                            <IconTrash size={20} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('wkDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('wkDelAsk', { kg: kg(toDelete.kg), d: date(toDelete.measured_on) })}</p>}
      </ConfirmDelete>
    </div>
  );
}

/** Einfaches SVG-Liniendiagramm; die Werte stehen zusätzlich in der Liste darunter (Screenreader). */
function WeightChart({ rows }: { rows: WeightRow[] }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const W = 320;
  const H = 120;
  const pts = chartPoints(rows, W, H, 12);
  const oldest = rows[rows.length - 1]!;
  const newest = rows[0]!;
  const kgs = rows.map((r) => Number(r.kg));
  const label = t('wkChartL', {
    from: t('wkKgValue', { kg: formatKg(Number(oldest.kg), locale) }),
    to: t('wkKgValue', { kg: formatKg(Number(newest.kg), locale) }),
    d1: formatIsoDateShort(oldest.measured_on, lang),
    d2: formatIsoDateShort(newest.measured_on, lang),
  });
  return (
    <figure className="weight-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} preserveAspectRatio="none">
        <title id={`${uid}-t`}>{label}</title>
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} className="chart-axis" />
        <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} className="chart-line" fill="none" />
        {pts.map((p, i) => (
          <circle key={rows[rows.length - 1 - i]!.id} cx={p.x} cy={p.y} r="4" className="chart-dot" />
        ))}
      </svg>
      <figcaption className="muted small chart-range">
        <span>{t('wkMin', { kg: t('wkKgValue', { kg: formatKg(Math.min(...kgs), locale) }) })}</span>
        <span>{t('wkMax', { kg: t('wkKgValue', { kg: formatKg(Math.max(...kgs), locale) }) })}</span>
      </figcaption>
    </figure>
  );
}

function WeightForm({
  initial,
  today,
  title,
  onSave,
  onCancel,
}: {
  initial: { date: string; kg: string };
  today: string;
  title: string;
  onSave: (date: string, kg: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [dateV, setDate] = useState(initial.date);
  const [kgV, setKg] = useState(initial.kg);
  const [errors, setErrors] = useState<{ date?: FieldError; kg?: FieldError }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const kgRef = useRef<HTMLInputElement>(null);

  useEffect(() => kgRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const dErr = pastDateError(dateV, today, true);
    const parsed = parseKg(kgV);
    const next = { date: dErr ? { key: dErr } : undefined, kg: parsed.ok ? undefined : { key: KG_ERROR[parsed.error] } };
    setErrors(next);
    if (next.date) return dateRef.current?.focus();
    if (!parsed.ok) return kgRef.current?.focus();
    setBusy(true);
    try {
      await onSave(dateV, parsed.kg);
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{title}</h3>
      <div className="row-2">
        <Field id={`${uid}-date`} label={t('wkDate')} error={errors.date} required>
          {(a) => <input {...a} ref={dateRef} type="date" max={today} value={dateV} onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: undefined })); }} />}
        </Field>
        <Field id={`${uid}-kg`} label={t('wkKg')} hint={t('wkKgHint')} error={errors.kg} required>
          {(a) => (
            <input {...a} ref={kgRef} type="text" inputMode="decimal" autoComplete="off" value={kgV}
              onChange={(e) => { setKg(e.target.value); setErrors((p) => ({ ...p, kg: undefined })); }} />
          )}
        </Field>
      </div>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
