import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatTime } from '../i18n';
import { templateFor } from '../lib/templates';
import { zonedNow } from '../lib/time';
import { KIND_LABEL, REPEAT_LABEL } from '../lib/labels';
import { hasErrors, validatePet, type Errors, type PetField, type PetFormValues } from '../lib/validate';
import { Field } from './Field';
import { KindIcon } from './Icons';
import { SpeciesPicker, SPECIES_LABEL } from './SpeciesPicker';
import { Switch } from './Switch';
import type { Species } from '../lib/domain';

interface Props {
  initial: PetFormValues;
  /** Vorlagen-Karte anzeigen (nur beim Anlegen) */
  withTemplate: boolean;
  submitLabel: string;
  onSubmit: (values: PetFormValues, useTemplate: boolean) => Promise<void>;
  onCancel?: () => void;
}

const FIELD_ORDER: PetField[] = ['name', 'speciesOther', 'birthDate', 'chipNo'];

export function PetForm({ initial, withTemplate, submitLabel, onSubmit, onCancel }: Props) {
  const { t, lang } = useI18n();
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [v, setV] = useState<PetFormValues>(initial);
  const [errors, setErrors] = useState<Errors<PetField>>({});
  const [useTemplate, setUseTemplate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = zonedNow(new Date()).date;

  const set = <K extends PetField>(key: K, value: PetFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const template = useMemo(() => templateFor(v.species), [v.species]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validatePet(v, today);
    setErrors(errs);
    if (hasErrors(errs)) {
      const first = FIELD_ORDER.find((f) => errs[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(first))}`)?.focus();
      return;
    }
    setBusy(true);
    setSubmitError(false);
    try {
      await onSubmit(v, withTemplate && useTemplate);
    } catch (err) {
      console.error(err);
      setSubmitError(true);
    } finally {
      setBusy(false);
    }
  }

  const speciesName = t(SPECIES_LABEL[v.species]);

  return (
    <form ref={formRef} className="stack" onSubmit={submit} noValidate>
      <Field id={id('name')} label={t('petName')} error={errors.name} required>
        {(a) => <input {...a} type="text" autoComplete="off" maxLength={60} value={v.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>

      <div className="field">
        <span className="label-text" id={id('species-l')}>
          {t('spQ')}
        </span>
        <SpeciesPicker labelId={id('species-l')} value={v.species} onChange={(s: Species) => set('species', s)} />
      </div>

      {v.species === 'other' && (
        <Field id={id('speciesOther')} label={t('spOther')} error={errors.speciesOther} required>
          {(a) => <input {...a} type="text" maxLength={40} value={v.speciesOther} onChange={(e) => set('speciesOther', e.target.value)} />}
        </Field>
      )}

      {v.species === 'cat' && (
        <fieldset className="field radio-group">
          <legend>{t('spCatQ')}</legend>
          <div className="radio-row">
            {[
              { val: false, key: 'spCatIn' as const },
              { val: true, key: 'spCatOut' as const },
            ].map((o) => (
              <label key={o.key} className="radio">
                <input type="radio" name={id('cat')} checked={v.catOutdoor === o.val} onChange={() => set('catOutdoor', o.val)} />
                <span>{t(o.key)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {v.species === 'horse' && (
        <Field id={id('stable')} label={t('spStall')}>
          {(a) => <input {...a} type="text" value={v.stable} onChange={(e) => set('stable', e.target.value)} />}
        </Field>
      )}

      {withTemplate && (
        <section className="card template-card" aria-labelledby={id('tpl-h')}>
          <h2 id={id('tpl-h')}>{t('tplH', { a: speciesName })}</h2>
          {template.length === 0 ? (
            <p className="muted">{t('tplNone')}</p>
          ) : (
            <>
              <h3 className="label">{t('tplPlan')}</h3>
              <ul className="tpl-list">
                {template.map((e, i) => (
                  <li key={i}>
                    <span className="time mono">{formatTime(e.time, lang)}</span>
                    <KindIcon kind={e.kind} size={20} />
                    <span>{t(KIND_LABEL[e.kind])}</span>
                    {e.repeat !== 'daily' && <span className="pill">{t(REPEAT_LABEL[e.repeat])}</span>}
                  </li>
                ))}
              </ul>
              <Switch checked={useTemplate} onChange={setUseTemplate} label={t('tplUse')} />
            </>
          )}
          <p className="note">{t('tplNoteShort')}</p>
        </section>
      )}

      <fieldset className="fieldset">
        <legend>{t('optionalH')}</legend>
        <Field id={id('breed')} label={t('breed')} optional>
          {(a) => <input {...a} type="text" value={v.breed} onChange={(e) => set('breed', e.target.value)} />}
        </Field>
        <Field id={id('sex')} label={t('sex')} optional>
          {(a) => (
            <select {...a} value={v.sex} onChange={(e) => set('sex', e.target.value === 'female' || e.target.value === 'male' ? e.target.value : '')}>
              <option value="">{t('sexNone')}</option>
              <option value="female">{t('sexF')}</option>
              <option value="male">{t('sexM')}</option>
            </select>
          )}
        </Field>
        <Field id={id('birthDate')} label={t('birth')} error={errors.birthDate} optional>
          {(a) => <input {...a} type="date" max={today} value={v.birthDate} onChange={(e) => set('birthDate', e.target.value)} />}
        </Field>
        <Field id={id('chipNo')} label={t('chipOpt')} error={errors.chipNo}>
          {(a) => (
            <input {...a} type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={v.chipNo} onChange={(e) => set('chipNo', e.target.value)} />
          )}
        </Field>
      </fieldset>

      <fieldset className="fieldset">
        <legend>{t('healthH')}</legend>
        <Field id={id('allergies')} label={t('allergies')} optional>
          {(a) => <textarea {...a} rows={2} value={v.allergies} onChange={(e) => set('allergies', e.target.value)} />}
        </Field>
        <Field id={id('medications')} label={t('medications')} optional>
          {(a) => <textarea {...a} rows={2} value={v.medications} onChange={(e) => set('medications', e.target.value)} />}
        </Field>
        <Field id={id('emergencyContact')} label={t('emergencyContact')} hint={t('emergencyContactHint')} optional>
          {(a) => <textarea {...a} rows={2} value={v.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />}
        </Field>
      </fieldset>

      {hasErrors(errors) && (
        <p className="notice notice-crit" role="alert">
          {t('formHasErrors')}
        </p>
      )}
      {submitError && (
        <p className="notice notice-crit" role="alert">
          {t('errGeneric')}
        </p>
      )}

      <div className="actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('cancelBtn')}
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
