import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang, type Lang } from '../i18n';
import { supabase } from '../lib/supabase';
import { appUrl } from '../lib/appUrl';
import { localDate } from '../lib/schedule';
import { DISPLAY_NAME_MAX, birthDateError, emailError, hasErrors, passwordError, passwordRepeatError, requiredMax, type Errors, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { GoogleButton } from '../components/GoogleButton';

type F = 'practiceName' | 'displayName' | 'email' | 'birth' | 'password' | 'password2';
const ORDER: F[] = ['practiceName', 'displayName', 'email', 'birth', 'password', 'password2'];
const PRACTICE_NAME_MAX = 120;
type AccountType = 'owner' | 'practice';

export function Register() {
  const { t, lang: uiLang, setLang } = useI18n();
  // „Ich bin: Halter:in / Praxis“ wie im Prototyp; ?praxis öffnet direkt die Praxis-Registrierung
  const [accountType, setAccountType] = useState<AccountType>(() => (new URLSearchParams(window.location.search).has('praxis') ? 'practice' : 'owner'));
  const [practiceName, setPracticeName] = useState('');
  const [today] = useState(() => localDate(new Date()));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [birth, setBirth] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [language, setLanguage] = useState<Lang>(uiLang);
  const [errors, setErrors] = useState<Errors<F>>({});
  const [formError, setFormError] = useState<FieldError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = {
    practiceName: useRef<HTMLInputElement>(null), displayName: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), birth: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null), password2: useRef<HTMLInputElement>(null),
  };

  const clear = (f: F) => setErrors((p) => ({ ...p, [f]: undefined }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isPractice = accountType === 'practice';
    const errs: Errors<F> = {
      practiceName: isPractice ? requiredMax(practiceName, PRACTICE_NAME_MAX) : undefined,
      displayName: requiredMax(displayName, DISPLAY_NAME_MAX),
      email: emailError(email),
      // Mindestalter gilt für private Konten; ein Praxiskonto ist ein beruflicher Zugang
      birth: isPractice ? undefined : birthDateError(birth, localDate(new Date())),
      password: passwordError(password),
      password2: passwordRepeatError(password, password2),
    };
    setErrors(errs);
    setFormError(null);
    if (hasErrors(errs)) {
      const first = ORDER.find((f) => errs[f]);
      if (first) refs[first].current?.focus();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: isPractice
          ? { display_name: displayName.trim(), language, account_type: 'practice', practice_name: practiceName.trim() }
          : { display_name: displayName.trim(), language },
        emailRedirectTo: appUrl(isPractice ? '/praxis/einrichten' : '/'),
      },
    });
    setBusy(false);
    if (error) {
      const key = authErrorKey(error.code);
      if (key === 'err_weakPw') {
        setErrors({ password: { key } });
        refs.password.current?.focus();
      } else if (key === 'err_email') {
        setErrors({ email: { key } });
        refs.email.current?.focus();
      } else {
        setFormError({ key });
      }
      return;
    }
    // Hinweis: Bei bereits registrierter Adresse meldet Supabase aus Datenschutzgründen ebenfalls Erfolg.
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout title={t('regDoneTitle')}>
        <div className="notice notice-ok" role="status">
          <p>
            <strong>{t('regDone')}</strong>
          </p>
          <p>{t('regDoneTo', { email: sentTo })}</p>
        </div>
        <p className="auth-alt">
          <Link to="/login">{t('toLogin')}</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('reg_title')} sub={accountType === 'practice' ? t('pp_step1') : t('reg_sub')} inviteHint>
      <div className="iam" role="radiogroup" aria-label={t('iAm')}>
        <span className="iam-label" aria-hidden="true">{t('iAm')}</span>
        <div className="dash-seg iam-seg">
          {(['owner', 'practice'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={accountType === a} className={accountType === a ? 'on' : undefined}
              onClick={() => { setAccountType(a); setErrors({}); setFormError(null); }}>
              {t(a === 'owner' ? 'iAmOwner' : 'iAmPractice')}
            </button>
          ))}
        </div>
      </div>
      {accountType === 'owner' ? (
        <>
          <GoogleButton onError={(key) => setFormError({ key })} />
          <p className="auth-or" aria-hidden="true">
            <span>{t('orDivider')}</span>
          </p>
        </>
      ) : (
        <p className="notice notice-info">{t('regPracticeHint')}</p>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        {accountType === 'practice' && (
          <Field id="reg-practice" label={t('practiceName')} error={errors.practiceName} required>
            {(a) => (
              <input {...a} ref={refs.practiceName} type="text" autoComplete="organization" maxLength={PRACTICE_NAME_MAX} value={practiceName}
                onChange={(e) => { setPracticeName(e.target.value); clear('practiceName'); }} />
            )}
          </Field>
        )}
        <Field id="reg-name" label={accountType === 'practice' ? t('regYourName') : t('displayName')} hint={accountType === 'practice' ? undefined : t('displayNameHint')} error={errors.displayName} required>
          {(a) => (
            <input {...a} ref={refs.displayName} type="text" autoComplete="nickname" maxLength={DISPLAY_NAME_MAX} value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clear('displayName'); }} />
          )}
        </Field>
        <Field id="reg-email" label={t('email')} error={errors.email} required>
          {(a) => (
            <input {...a} ref={refs.email} type="email" autoComplete="email" inputMode="email" value={email}
              onChange={(e) => { setEmail(e.target.value); clear('email'); }} />
          )}
        </Field>
        {accountType === 'owner' && (
          <Field id="reg-birth" label={t('regBirth')} hint={t('regBirthHint')} error={errors.birth} required>
            {(a) => (
              <input {...a} ref={refs.birth} type="date" autoComplete="bday" max={today} value={birth}
                onChange={(e) => { setBirth(e.target.value); clear('birth'); }} />
            )}
          </Field>
        )}
        <Field id="reg-pw" label={t('password')} hint={t('pwHint')} error={errors.password} required>
          {(a) => (
            <input {...a} ref={refs.password} type="password" autoComplete="new-password" minLength={8} value={password}
              onChange={(e) => { setPassword(e.target.value); clear('password'); }} />
          )}
        </Field>
        <Field id="reg-pw2" label={t('regPw2')} error={errors.password2} required>
          {(a) => (
            <input {...a} ref={refs.password2} type="password" autoComplete="new-password" value={password2}
              onChange={(e) => { setPassword2(e.target.value); clear('password2'); }} />
          )}
        </Field>
        <Field id="reg-lang" label={t('prefLang')}>
          {(a) => (
            <select {...a} value={language} onChange={(e) => {
              if (isLang(e.target.value)) { setLanguage(e.target.value); setLang(e.target.value); }
            }}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
              ))}
            </select>
          )}
        </Field>
        {formError && (
          <p className="notice notice-crit" role="alert">{t(formError.key)}</p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
          {t('regBtn')}
        </button>
      </form>
      <p className="auth-alt">
        {t('haveAccount')} <Link to="/login">{t('toLogin')}</Link>
      </p>
    </AuthLayout>
  );
}
