import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { addVital, deleteVital, listVitals, updateVital, type VitalRow } from '../../lib/api';
import { WEIGHT_RANGES, chartPoints, filterWeightsByRange, formatKg, pastDateError, recordErrorKey, type WeightRange } from '../../lib/record';
import { localDate } from '../../lib/schedule';
import {
  CONTEXT_LABEL, KIND_CONTEXTS, KIND_EXAMPLE, KIND_LABEL, VITAL_ERROR, VITAL_KINDS, isVitalContext, measuredAtFor, normalRange, parseVital, sortVitalsDesc, toChartRows,
  type VitalContext, type VitalKind,
} from '../../lib/vital';
import type { FieldError } from '../../lib/validate';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';

type Mode = { kind: 'add' } | { kind: 'edit'; row: VitalRow } | null;

const RANGE_LABEL: Record<WeightRange, MessageKey> = { '30d': 'wkRange30', '3m': 'wkRange3m', '6m': 'wkRange6m', all: 'wkRangeAll' };

/** Vitalwerte, vom Halter eingetragen: je Art aktueller Wert, Verlauf und Liste. Keine Bewertung, keine Grenzwerte. */
export function VitalSection({ petId, editable, today, species }: { petId: string; editable: boolean; today: string; species: string; myId?: string | undefined; names?: ReadonlyMap<string, string> }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const [kind, setKind] = useState<VitalKind>('temperature');
  const [rows, setRows] = useState<VitalRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<VitalRow | null>(null);
  const [range, setRange] = useState<WeightRange>('all');
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      setRows(sortVitalsDesc(await listVitals(petId, kind)));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petId, kind]);
  useEffect(() => {
    setRows(null);
    setMode(null);
    setStatus('');
    void load();
  }, [load, setStatus]);

  const val = (n: number) => (kind === 'temperature' ? t('vtValTemp', { v: formatKg(Number(n), locale) }) : t('vtValRate', { v: formatKg(Number(n), locale) }));
  const date = (iso: string) => formatIsoDateShort(localDate(new Date(iso)), lang);
  const nr = normalRange(species, kind);
  const unit = kind === 'temperature' ? '°C' : t('vtUnitRate');
  const normalText = nr
    ? t('vtNormal', { sp: t(species as MessageKey), a: formatKg(nr.min, locale), b: formatKg(nr.max, locale), u: unit })
    : t('vtNormalNone');
  const sorted = rows ?? [];
  const current = sorted[0];
  const inRange = filterWeightsByRange(toChartRows(sorted), range, today);

  async function save(dateV: string, value: number, context: VitalContext | null) {
    if (mode?.kind === 'edit') {
      const old = mode.row;
      const keepTime = localDate(new Date(old.measured_at)) === dateV;
      const row = await updateVital(old.id, { value, context, measured_at: keepTime ? old.measured_at : measuredAtFor(dateV, today, new Date()) });
      setRows((cur) => sortVitalsDesc((cur ?? []).map((r) => (r.id === row.id ? row : r))));
      setMode(null);
      setStatus(t('vtUpdated', { v: val(row.value), d: date(row.measured_at) }));
      focusLater(`edit-${row.id}`);
    } else {
      const row = await addVital(petId, { kind, value, context, measured_at: measuredAtFor(dateV, today, new Date()) });
      setRows((cur) => sortVitalsDesc([...(cur ?? []), row]));
      setMode(null);
      setStatus(t('vtSaved', { v: val(row.value), d: date(row.measured_at) }));
      focusLater('add');
    }
  }

  async function remove(row: VitalRow) {
    setToDelete(null);
    try {
      await deleteVital(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('vtDeleted', { d: date(row.measured_at) }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  const ctxText = (c: string | null) => (isVitalContext(c) ? t(CONTEXT_LABEL[c]) : null);

  return (
    <div className="stack record-panel">
      <div className="range-chips" role="group" aria-label={t('vtKindL')}>
        {VITAL_KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(KIND_LABEL[k])}
          </button>
        ))}
      </div>

      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {current ? (
            <div className="weight-now">
              <span className="label">{t('wkNow')}</span>
              <span className="weight-now-value">{val(current.value)}</span>
              <span className="muted small">
                {t('wkMeasuredOn', { d: date(current.measured_at) })}
                {ctxText(current.context) ? ` · ${ctxText(current.context)}` : ''} · <span className="pill">{t('vtSource')}</span>
              </span>
            </div>
          ) : (
            <p className="muted">{t('vtNone')}</p>
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
              {inRange.length >= 2 ? <VitalChart rows={inRange} fmt={val} /> : <p className="muted">{t('wkRangeFew')}</p>}
            </div>
          )}

          {editable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-secondary btn-start" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('vtAdd')}
            </button>
          )}
          {editable && mode && (
            <VitalForm
              key={`${kind}-${mode.kind === 'edit' ? mode.row.id : 'add'}`}
              kind={kind}
              today={today}
              normalText={nr ? normalText : ''}
              initial={
                mode.kind === 'edit'
                  ? { date: localDate(new Date(mode.row.measured_at)), value: formatKg(Number(mode.row.value), locale), context: isVitalContext(mode.row.context) ? mode.row.context : '' }
                  : { date: today, value: '', context: '' }
              }
              title={mode.kind === 'edit' ? t('vtEditTitle') : t('vtAdd')}
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
              <h3 id={`vt-list-${petId}`}>{t('wkHist')}</h3>
              <ul className="record-list" aria-labelledby={`vt-list-${petId}`}>
                {sorted.map((r) => (
                  <li key={r.id} className="record-row">
                    <div className="record-main">
                      <span className="record-title">
                        <span className="mono">{date(r.measured_at)}</span> · {val(r.value)}
                      </span>
                      {ctxText(r.context) && <span className="muted small">{ctxText(r.context)}</span>}
                    </div>
                    {editable && (
                      <div className="row-actions">
                        <button type="button" ref={register(`edit-${r.id}`)} className="btn btn-ghost" aria-label={t('vtEditL', { d: date(r.measured_at), v: val(r.value) })} onClick={() => { setMode({ kind: 'edit', row: r }); setStatus(''); }}>
                          {t('editBtn')}
                        </button>
                        <button type="button" className="btn-icon" aria-label={t('vtDelL', { d: date(r.measured_at), v: val(r.value) })} onClick={() => setToDelete(r)}>
                          <IconTrash size={20} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted small">{normalText}</p>
          <p className="muted small">{t('vtHint')}</p>
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('vtDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('vtDelAsk', { v: val(toDelete.value), d: date(toDelete.measured_at) })}</p>}
      </ConfirmDelete>
    </div>
  );
}

function VitalChart({ rows, fmt }: { rows: { id: string; measured_on: string; kg: number; created_at: string }[]; fmt: (n: number) => string }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const W = 320;
  const H = 120;
  const pts = chartPoints(rows, W, H, 12);
  const oldest = rows[rows.length - 1]!;
  const newest = rows[0]!;
  const vals = rows.map((r) => Number(r.kg));
  const label = t('vtChartL', { from: fmt(oldest.kg), to: fmt(newest.kg), d1: formatIsoDateShort(oldest.measured_on, lang), d2: formatIsoDateShort(newest.measured_on, lang) });
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
        <span>{t('wkMin', { kg: fmt(Math.min(...vals)) })}</span>
        <span>{t('wkMax', { kg: fmt(Math.max(...vals)) })}</span>
      </figcaption>
    </figure>
  );
}

function VitalForm({
  kind, initial, today, title, normalText, onSave, onCancel,
}: {
  kind: VitalKind;
  normalText: string;
  initial: { date: string; value: string; context: VitalContext | '' };
  today: string;
  title: string;
  onSave: (date: string, value: number, context: VitalContext | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [dateV, setDate] = useState(initial.date);
  const [valueV, setValue] = useState(initial.value);
  const [ctx, setCtx] = useState<VitalContext | ''>(initial.context);
  const [errors, setErrors] = useState<{ date?: FieldError; value?: FieldError }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => valueRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const dErr = pastDateError(dateV, today, true);
    const parsed = parseVital(kind, valueV);
    const next = { date: dErr ? { key: dErr } : undefined, value: parsed.ok ? undefined : { key: VITAL_ERROR[parsed.error] } };
    setErrors(next);
    if (next.date) return dateRef.current?.focus();
    if (!parsed.ok) return valueRef.current?.focus();
    setBusy(true);
    try {
      await onSave(dateV, parsed.value, ctx === '' ? null : ctx);
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
        <Field id={`${uid}-v`} label={`${t('vtValue')} (${t(KIND_LABEL[kind])})`} hint={normalText ? `${t(KIND_EXAMPLE[kind])} · ${normalText}` : t(KIND_EXAMPLE[kind])} error={errors.value} required>
          {(a) => (
            <input {...a} ref={valueRef} type="text" inputMode="decimal" autoComplete="off" value={valueV}
              onChange={(e) => { setValue(e.target.value); setErrors((p) => ({ ...p, value: undefined })); }} />
          )}
        </Field>
      </div>
      <Field id={`${uid}-c`} label={t('vtContext')} optional>
        {(a) => (
          <select {...a} value={ctx} onChange={(e) => setCtx(e.target.value as VitalContext | '')}>
            <option value="">{t('vtCtxNone')}</option>
            {KIND_CONTEXTS[kind].map((c) => (
              <option key={c} value={c}>{t(CONTEXT_LABEL[c])}</option>
            ))}
          </select>
        )}
      </Field>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
