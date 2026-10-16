import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang, type Lang } from '../i18n';
import { supabase } from '../lib/supabase';
import { DISPLAY_NAME_MAX, emailError, hasErrors, passwordError, requiredMax, type Errors, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';

type F = 'displayName' | 'email' | 'password';
const ORDER: F[] = ['displayName', 'email', 'password'];

export function Register() {
  const { t, lang: uiLang, setLang } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<Lang>(uiLang);
  const [errors, setErrors] = useState<Errors<F>>({});
  const [formError, setFormError] = useState<FieldError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = { displayName: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };

  const clear = (f: F) => setErrors((p) => ({ ...p, [f]: undefined }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors<F> = {
      displayName: requiredMax(displayName, DISPLAY_NAME_MAX),
      email: emailError(email),
      password: passwordError(password),
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
        data: { display_name: displayName.trim(), language },
        emailRedirectTo: window.location.origin,
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
    <AuthLayout title={t('reg_title')} sub={t('reg_sub')} inviteHint>
      <form className="stack" onSubmit={submit} noValidate>
        <Field id="reg-name" label={t('displayName')} hint={t('displayNameHint')} error={errors.displayName} required>
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
        <Field id="reg-pw" label={t('password')} hint={t('pwHint')} error={errors.password} required>
          {(a) => (
            <input {...a} ref={refs.password} type="password" autoComplete="new-password" minLength={8} value={password}
              onChange={(e) => { setPassword(e.target.value); clear('password'); }} />
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
