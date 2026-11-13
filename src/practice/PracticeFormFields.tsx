import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { Field } from '../components/Field';
import { FORM_MAX, formErrors, type FormField, type PracticeForm } from '../lib/practiceAccount';

/** Felder des Praxisprofils wie im Prototyp (Name, Straße+Nr., PLZ+Ort, Telefon, Sprechzeiten) plus E-Mail und Website.
    Die Schwerpunkte des Prototyps ersetzt der Angebots-Fragebogen (OfferQuestionnaire). */
export function PracticeFormFields({ idPrefix, initial, submitLabel, busy, error, onSubmit, children }: {
  idPrefix: string;
  initial: PracticeForm;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (f: PracticeForm) => void;
  /** weitere Knöpfe unter „Speichern“ */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [f, setF] = useState<PracticeForm>(initial);
  const [errs, setErrs] = useState<Partial<Record<FormField, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof PracticeForm>(k: K, v: PracticeForm[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k === 'name' || k === 'email') setErrs((p) => ({ ...p, [k]: undefined }));
  };
  const id = (s: string) => `${idPrefix}-${s}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = formErrors(f);
    setErrs(found);
    if (found.name) return nameRef.current?.focus();
    if (found.email) return emailRef.current?.focus();
    onSubmit(f);
  }

  const err = (k: FormField) => (errs[k] ? { key: errs[k] as never } : undefined);

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field id={id('name')} label={t('practiceName')} error={err('name')} required>
        {(a) => <input {...a} ref={nameRef} type="text" autoComplete="organization" maxLength={FORM_MAX.name} value={f.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <Field id={id('street')} label={t('pf_address')}>
        {(a) => <input {...a} type="text" autoComplete="street-address" maxLength={FORM_MAX.streetLine} value={f.streetLine} onChange={(e) => set('streetLine', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={id('zip')} label={t('pf_zipCity')}>
          {(a) => <input {...a} type="text" maxLength={FORM_MAX.zipCity} value={f.zipCity} onChange={(e) => set('zipCity', e.target.value)} />}
        </Field>
        <Field id={id('phone')} label={t('pf_phone')}>
          {(a) => <input {...a} type="tel" autoComplete="tel" maxLength={FORM_MAX.phone} value={f.phone} onChange={(e) => set('phone', e.target.value)} />}
        </Field>
      </div>
      <div className="row-2">
        <Field id={id('email')} label={t('pf_email')} error={err('email')} optional>
          {(a) => <input {...a} ref={emailRef} type="email" autoComplete="email" inputMode="email" maxLength={FORM_MAX.email} value={f.email} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field id={id('web')} label={t('pf_website')} optional>
          {(a) => <input {...a} type="url" inputMode="url" maxLength={FORM_MAX.website} value={f.website} onChange={(e) => set('website', e.target.value)} />}
        </Field>
      </div>
      <Field id={id('hours')} label={t('pf_hours')}>
        {(a) => <input {...a} type="text" maxLength={FORM_MAX.hours} placeholder={t('pf_hoursPh')} value={f.hours} onChange={(e) => set('hours', e.target.value)} />}
      </Field>
      {error && <p className="notice notice-crit" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>{submitLabel}</button>
      {children}
    </form>
  );
}
