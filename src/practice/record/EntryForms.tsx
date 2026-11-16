// Rechte Spalte der Patientenakte: Impfung, Befund, Medikament und Gewicht eintragen.
import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import {
  EMPTY_FORM, VALIDITY_YEARS, addEntry, canWrite, entryData, entryErrors, validUntil, vaccinesFor, type EntryKind, type FormValues,
} from '../../lib/practiceRecord';
import { isIsoDate } from '../../lib/record';
import { addLine, vaccineSuggestions, type ServiceLine } from '../../lib/billing';
import { EntryFields, type RecordCtx } from './shared';
import { TreatmentForm, useTreatmentBilling } from './TreatmentForm';

const TITLE: Record<EntryKind, MessageKey> = { vaccination: 'rcAddVacc', finding: 'rcAddFind', medication: 'rcAddMed', weight: 'wkAdd' };
const SAVED: Record<EntryKind, MessageKey> = { vaccination: 'rcSavedVacc', finding: 'rcSavedFind', medication: 'rcSavedMed', weight: 'rcSavedWeight' };
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

function SimpleForm({ ctx, kind }: { ctx: RecordCtx; kind: Exclude<EntryKind, 'vaccination'> }) {
  const { t } = useI18n();
  const uid = useId();
  const f = useEntryForm(ctx, kind);
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t(TITLE[kind])}</h2>
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void f.save(f.v); }} noValidate>
        <EntryFields kind={kind} v={f.v} set={f.set} errors={f.errors} uid={uid} />
        <button type="submit" className="btn btn-primary btn-start" disabled={ctx.busy}>{t('saveBtn')}</button>
      </form>
    </section>
  );
}

/** Impfung: übliche Impfstoffe der Tierart zur Auswahl, Gültigkeit 1 oder 3 Jahre (oder eigenes Datum) */
function VaccinationForm({ ctx, onSaved }: { ctx: RecordCtx; onSaved?: ((name: string, day: string) => void) | undefined }) {
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
      onSaved?.(name, given);
      setPick(list[0] ?? OTHER);
      setYears('1');
    }
  }

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('rcAddVacc')}</h2>
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
        {years === 'date' && (
          <Field id={`${uid}-until`} label={t('vcValidUntil')} error={f.errors.valid_until ? { key: f.errors.valid_until } : undefined}>
            {(a) => <input {...a} type="date" value={f.v.valid_until ?? ''} onChange={(e) => f.set('valid_until', e.target.value)} />}
          </Field>
        )}
        <button type="submit" className="btn btn-primary btn-start" disabled={ctx.busy}>{t('saveBtn')}</button>
      </form>
    </section>
  );
}

export function EntryForms({ ctx }: { ctx: RecordCtx }) {
  const { t } = useI18n();
  const role = ctx.rec.role;
  const clinical = canWrite(role, 'finding') && !ctx.rec.pet.deceased;
  const bill = useTreatmentBilling(ctx.petId, ctx.today, clinical);
  const [lines, setLines] = useState<ServiceLine[]>([]);
  const [suggested, setSuggested] = useState(false);
  // Nach einer Impfung: Impfleistung und Impfstoff aus dem Katalog als Vorschlag in „Erbrachte Leistungen“
  const onVaccinated = (name: string, day: string) => {
    const items = bill.data?.catalog?.items ?? [];
    const sugg = vaccineSuggestions(name, items, day);
    if (!sugg.length) return;
    setLines((ls) => sugg.reduce((acc, i) => (acc.some((l) => l.catalog_item_id === i.id) ? acc : addLine(acc, i, 1, true)), ls));
    setSuggested(true);
  };
  if (ctx.rec.pet.deceased) return <p className="notice notice-info">{t('rcDeceasedNote')}</p>;
  return (
    <>
      {canWrite(role, 'vaccination') && <VaccinationForm ctx={ctx} onSaved={clinical ? onVaccinated : undefined} />}
      {clinical && <TreatmentForm ctx={ctx} bill={bill} lines={lines} setLines={(fn) => setLines(fn)} suggested={suggested} clearSuggested={() => setSuggested(false)} />}
      {canWrite(role, 'medication') && <SimpleForm ctx={ctx} kind="medication" />}
      <SimpleForm ctx={ctx} kind="weight" />
      {!canWrite(role, 'finding') && <p className="notice notice-info">{t('rcTeamNote')}</p>}
      <p className="muted small">{t('rcOwnerSees')}</p>
    </>
  );
}
