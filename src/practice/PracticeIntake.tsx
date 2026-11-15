import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { Field } from '../components/Field';
import { IconBack } from '../components/Icons';
import { SPECIES_LABEL } from '../components/SpeciesPicker';
import { SPECIES } from '../lib/domain';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { EMPTY_INTAKE, createPatientInvite, intakeErrors, inviteErrorKey, type InviteResult, type IntakeForm } from '../lib/patientInvites';

/** Patient aufnehmen: Tier und Halter:in anlegen. Die Halter:in bekommt eine Einladung und übernimmt nach ihrer Einwilligung. */
export function PracticeIntake() {
  const { t, lang } = useI18n();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [v, setV] = useState<IntakeForm>(EMPTY_INTAKE);
  const [errors, setErrors] = useState<Partial<Record<keyof IntakeForm, MessageKey>>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<InviteResult | null>(null);
  const set = (k: keyof IntakeForm, x: string) => setV((c) => ({ ...c, [k]: x }));
  const err = (k: keyof IntakeForm) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = intakeErrors(v, today);
    setErrors(errs);
    setFail(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      setDone(await createPatientInvite(v, lang));
      setV(EMPTY_INTAKE);
    } catch (x) {
      setFail(inviteErrorKey(x));
    } finally {
      setBusy(false);
    }
  }

  const back = <Link to="/praxis/patienten" className="back-link"><IconBack size={20} />{t('ptTitle')}</Link>;

  if (done) {
    return (
      <div className="page stack-lg">
        {back}
        <div className="page-head"><h1>{t('piDoneTitle')}</h1></div>
        <section className="card stack" aria-live="polite">
          <p>{t(done.mailed ? 'piDoneMailed' : 'piDoneNoMail', { n: done.invite.pet_name, email: done.invite.email })}</p>
          <p className="label-text">{t('piCode')}</p>
          <p className="practice-code mono" aria-label={t('paCodeAria', { c: done.invite.code.split('').join(' ') })}>{done.invite.code}</p>
          <p className="muted small">{t('piCodeHint', { d: formatIsoDate(done.invite.expires_at.slice(0, 10), lang) })}</p>
          <p className="notice notice-info">{t('piUntilAccepted')}</p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => setDone(null)}>{t('piAnother')}</button>
            <Link to="/praxis/patienten" className="btn btn-secondary">{t('piToList')}</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page stack-lg">
      {back}
      <div className="page-head">
        <h1>{t('piTitle')}</h1>
        <p className="muted">{t('piIntro')}</p>
      </div>
      <form className="stack-lg" onSubmit={(e) => void submit(e)} noValidate>
        <section className="card stack" aria-labelledby={`${uid}-o`}>
          <h2 id={`${uid}-o`}>{t('ptOwner')}</h2>
          <Field id={`${uid}-on`} label={t('pp_name')} error={err('ownerName')} required>
            {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={v.ownerName} onChange={(e) => set('ownerName', e.target.value)} />}
          </Field>
          <Field id={`${uid}-em`} label={t('email')} error={err('email')} hint={t('piEmailHint')} required>
            {(a) => <input {...a} type="email" maxLength={200} autoComplete="off" value={v.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field id={`${uid}-ph`} label={t('pf_phone')} optional>
            {(a) => <input {...a} type="tel" maxLength={40} autoComplete="off" value={v.phone} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
        </section>
        <section className="card stack" aria-labelledby={`${uid}-p`}>
          <h2 id={`${uid}-p`}>{t('piPet')}</h2>
          <Field id={`${uid}-pn`} label={t('petName')} error={err('petName')} required>
            {(a) => <input {...a} type="text" maxLength={60} autoComplete="off" value={v.petName} onChange={(e) => set('petName', e.target.value)} />}
          </Field>
          <div className="row-2">
            <Field id={`${uid}-sp`} label={t('vltSpecies')} error={err('species')} required>
              {(a) => (
                <select {...a} value={v.species} onChange={(e) => set('species', e.target.value)}>
                  {SPECIES.map((s) => <option key={s} value={s}>{t(SPECIES_LABEL[s])}</option>)}
                </select>
              )}
            </Field>
            <Field id={`${uid}-sx`} label={t('sex')} optional>
              {(a) => (
                <select {...a} value={v.sex} onChange={(e) => set('sex', e.target.value)}>
                  <option value="">{t('notSet')}</option>
                  <option value="female">{t('sexF')}</option>
                  <option value="male">{t('sexM')}</option>
                </select>
              )}
            </Field>
          </div>
          {v.species === 'other' && (
            <Field id={`${uid}-so`} label={t('piSpeciesOther')} error={err('speciesOther')} required>
              {(a) => <input {...a} type="text" maxLength={40} autoComplete="off" value={v.speciesOther} onChange={(e) => set('speciesOther', e.target.value)} />}
            </Field>
          )}
          <Field id={`${uid}-br`} label={t('breed')} optional>
            {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={v.breed} onChange={(e) => set('breed', e.target.value)} />}
          </Field>
          <div className="row-2">
            <Field id={`${uid}-bd`} label={t('birth')} error={err('birthDate')} optional>
              {(a) => <input {...a} type="date" max={today} value={v.birthDate} onChange={(e) => set('birthDate', e.target.value)} />}
            </Field>
            <Field id={`${uid}-kg`} label={t('wkKg')} error={err('kg')} optional>
              {(a) => <input {...a} type="text" inputMode="decimal" maxLength={8} autoComplete="off" value={v.kg} onChange={(e) => set('kg', e.target.value)} />}
            </Field>
          </div>
          <Field id={`${uid}-ch`} label={t('chip')} optional>
            {(a) => <input {...a} type="text" inputMode="numeric" maxLength={40} autoComplete="off" value={v.chipNo} onChange={(e) => set('chipNo', e.target.value)} />}
          </Field>
        </section>
        <p className="muted small">{t('piPrivacy')}</p>
        {fail && <p className="notice notice-crit" role="alert">{t(fail)}</p>}
        <button type="submit" className="btn btn-primary btn-start" disabled={busy}>{t('piSubmit')}</button>
      </form>
    </div>
  );
}
