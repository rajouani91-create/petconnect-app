// Formulare der Patientenakte (Release B: öffnen in der Leiste rechts): Impfung, Medikament, Gewicht und Vitalwerte.
import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { localeOf, type MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import {
  EMPTY_FORM, VALIDITY_YEARS, addEntry, entryData, entryErrors, isHHMM, validUntil, vaccinesFor, type EntryKind, type FormValues,
} from '../../lib/practiceRecord';
import { isIsoDate, parseKg } from '../../lib/record';
import { CONTEXT_LABEL, KIND_CONTEXTS, KIND_EXAMPLE, VITAL_ERROR, parseVital, type VitalKind } from '../../lib/vital';
import { EntryFields, type RecordCtx } from './shared';

const SAVED: Record<EntryKind, MessageKey> = { vaccination: 'rcSavedVacc', finding: 'rcSavedFind', medication: 'rcSavedMed', weight: 'rcSavedWeight', vital: 'rcSavedVital' };
const OTHER = '__other';

function useEntryForm(ctx: RecordCtx, kind: EntryKind) {
  const { t } = useI18n();
  const [v, setV] = useState<FormValues>(() => EMPTY_FORM[kind](ctx.today));
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const set = (k: string, x: string) => setV((c) => ({ ...c, [k]: x }));
  async function save(values: FormValues): Promise<boolean> {
    const errs = entryErrors(kind, values, ctx.today);
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    const ok = await ctx.run(() => addEntry(ctx.petId, kind, entryData(kind, values)), t(SAVED[kind]));
    if (ok) setV(EMPTY_FORM[kind](ctx.today));
    return ok;
  }
  return { v, set, errors, save };
}

/** Medikament eintragen (Leitung und Tierärzt:innen) */
export function MedicationForm({ ctx, onDone }: { ctx: RecordCtx; onDone: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const f = useEntryForm(ctx, 'medication');
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void f.save(f.v).then((ok) => ok && onDone()); }} noValidate>
      <EntryFields kind="medication" v={f.v} set={f.set} errors={f.errors} uid={uid} />
      <p className="muted small">{t('rcOwnerSees')}</p>
      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={ctx.busy}>{t('rcSaveMed')}</button>
      </div>
    </form>
  );
}

/** Impfung: übliche Impfstoffe der Tierart zur Auswahl, Gültigkeit 1 oder 3 Jahre (oder eigenes Datum) */
export function VaccinationForm({ ctx, onSaved, onDone }: { ctx: RecordCtx; onSaved?: ((name: string, day: string) => boolean) | undefined; onDone: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const f = useEntryForm(ctx, 'vaccination');
  const list = vaccinesFor(ctx.rec.pet.species);
  const [pick, setPick] = useState(list[0] ?? OTHER);
  const [years, setYears] = useState<string>('1');
  const name = pick === OTHER ? (f.v.name ?? '') : pick;
  const given = f.v.given_on ?? '';
  const until = years === 'date' ? (f.v.valid_until ?? '') : years === 'none' || !isIsoDate(given) ? '' : validUntil(given, Number(years));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await f.save({ name, given_on: given, valid_until: until })) {
      // Mit Vorschlägen zur Abrechnung geht es direkt weiter zur Behandlung, sonst schließt die Leiste
      if (!onSaved?.(name, given)) onDone();
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
      {list.length > 0 && (
        <Field id={`${uid}-pick`} label={t('rcVaccine')} required>
          {(a) => (
            <select {...a} value={pick} onChange={(e) => setPick(e.target.value)}>
              {list.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OTHER}>{t('rcVaccOther')}</option>
            </select>
          )}
        </Field>
      )}
      {pick === OTHER && (
        <Field id={`${uid}-name`} label={t(list.length ? 'rcVaccOtherName' : 'rcVaccine')} error={f.errors.name ? { key: f.errors.name } : undefined} required>
          {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={f.v.name ?? ''} onChange={(e) => f.set('name', e.target.value)} />}
        </Field>
      )}
      <div className="row-2">
        <Field id={`${uid}-given`} label={t('vcGivenOn')} error={f.errors.given_on ? { key: f.errors.given_on } : undefined} required>
          {(a) => <input {...a} type="date" max={ctx.today} value={given} onChange={(e) => f.set('given_on', e.target.value)} />}
        </Field>
        <Field id={`${uid}-years`} label={t('rcValidity')} hint={t('rcValidityHint')}>
          {(a) => (
            <select {...a} value={years} onChange={(e) => setYears(e.target.value)}>
              {VALIDITY_YEARS.map((y) => <option key={y} value={String(y)}>{t(y === 1 ? 'rcYear1' : 'rcYearN', { n: y })}</option>)}
              <option value="date">{t('rcValidityDate')}</option>
              <option value="none">{t('rcValidityNone')}</option>
            </select>
          )}
        </Field>
      </div>
      {years === 'date' && (
        <Field id={`${uid}-until`} label={t('vcValidUntil')} error={f.errors.valid_until ? { key: f.errors.valid_until } : undefined}>
          {(a) => <input {...a} type="date" value={f.v.valid_until ?? ''} onChange={(e) => f.set('valid_until', e.target.value)} />}
        </Field>
      )}
      {onSaved && <p className="muted small">{t('rcVaccBillHint')}</p>}
      <p className="muted small">{t('rcOwnerSees')}</p>
      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={ctx.busy}>{t('rcSaveVacc')}</button>
      </div>
    </form>
  );
}

export interface VitalValues { kg: string; temperature: string; tempCtx: string; heart_rate: string; resp_rate: string; date: string; time: string }
const RATE_FIELDS: ['heart_rate' | 'resp_rate', MessageKey][] = [['heart_rate', 'vtKindHeart'], ['resp_rate', 'vtKindResp']];

/** Prüft die Messwerte; leere Felder werden übersprungen, mindestens ein Wert ist nötig */
export function vitalFormErrors(v: VitalValues, today: string): Record<string, MessageKey> {
  const e: Record<string, MessageKey> = {};
  if (v.kg.trim()) { const r = parseKg(v.kg); if (!r.ok) e.kg = r.error === 'range' ? 'wkErrRange' : 'wkErrFormat'; }
  for (const k of ['temperature', 'heart_rate', 'resp_rate'] as const) {
    if (v[k].trim()) { const r = parseVital(k, v[k]); if (!r.ok) e[k] = VITAL_ERROR[r.error]; }
  }
  if (!v.kg.trim() && !v.temperature.trim() && !v.heart_rate.trim() && !v.resp_rate.trim()) e.kg = 'rcErrNoValue';
  if (!v.date) e.date = 'errDateRequired';
  else if (!isIsoDate(v.date)) e.date = 'errDate';
  else if (v.date > today) e.date = 'errFuture';
  if (v.time.trim() && !isHHMM(v.time.trim())) e.time = 'rcErrTime';
  return e;
}

/** Messwerte eintragen: Gewicht, Temperatur, Puls, Atmung auf einmal (alle Rollen). Erscheinen sofort bei der Halter:in. */
export function VitalForm({ ctx, onDone }: { ctx: RecordCtx; onDone: () => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const empty = (): VitalValues => ({ kg: '', temperature: '', tempCtx: '', heart_rate: '', resp_rate: '', date: ctx.today, time: '' });
  const [v, setV] = useState<VitalValues>(empty);
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const set = (k: keyof VitalValues, x: string) => setV((c) => ({ ...c, [k]: x }));
  const err = (k: string) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = vitalFormErrors(v, ctx.today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const time = v.time.trim() || null;
    const jobs: { kind: EntryKind; data: Record<string, string | number | null> }[] = [];
    const kg = parseKg(v.kg);
    if (v.kg.trim() && kg.ok) jobs.push({ kind: 'weight', data: { kg: kg.kg, measured_on: v.date } });
    for (const k of ['temperature', 'heart_rate', 'resp_rate'] as const) {
      const r = parseVital(k, v[k]);
      if (v[k].trim() && r.ok) jobs.push({ kind: 'vital', data: { vkind: k, value: r.value, context: k === 'temperature' ? v.tempCtx || null : null, measured_on: v.date, time } });
    }
    const ok = await ctx.run(async () => { for (const j of jobs) await addEntry(ctx.petId, j.kind, j.data); }, t('rcSavedVitals', { n: jobs.length }));
    if (ok) { setV(empty()); onDone(); }
  }

  const num = (k: VitalKind, label: string) => (
    <Field id={`${uid}-${k}`} label={label} error={err(k)} hint={t(KIND_EXAMPLE[k])} optional>
      {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" maxLength={6} value={v[k]} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
      <p className="muted small">{t('rcVitalsLead')}</p>
      <div className="row-2">
        <Field id={`${uid}-kg`} label={t('wkKg')} error={err('kg')} hint={t('rcKgHint', { n: new Intl.NumberFormat(localeOf(lang)).format(28.4) })} optional>
          {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" maxLength={8} value={v.kg} onChange={(e) => set('kg', e.target.value)} />}
        </Field>
        {num('temperature', `${t('vtKindTemp')} (°C)`)}
      </div>
      <Field id={`${uid}-tctx`} label={t('rcVitalContext')} optional>
        {(a) => (
          <select {...a} value={v.tempCtx} onChange={(e) => set('tempCtx', e.target.value)}>
            <option value="">–</option>
            {KIND_CONTEXTS.temperature.map((c) => <option key={c} value={c}>{t(CONTEXT_LABEL[c])}</option>)}
          </select>
        )}
      </Field>
      <div className="row-2">
        {RATE_FIELDS.map(([k, label]) => <div key={k}>{num(k, `${t(label)} (${t('vtUnitRate')})`)}</div>)}
      </div>
      <div className="row-2">
        <Field id={`${uid}-date`} label={t('wkDate')} error={err('date')} required>
          {(a) => <input {...a} type="date" max={ctx.today} value={v.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field id={`${uid}-time`} label={t('rcFTime')} error={err('time')} hint={t('rcTimeNowHint')} optional>
          {(a) => <input {...a} type="time" value={v.time} onChange={(e) => set('time', e.target.value)} />}
        </Field>
      </div>
      <p className="muted small">{t('rcVitalsOwner')}</p>
      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={ctx.busy}>{t('rcSaveVitals')}</button>
      </div>
    </form>
  );
}
