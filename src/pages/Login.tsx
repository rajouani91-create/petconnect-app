import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { supabase } from '../lib/supabase';
import { emailError, hasErrors, type Errors, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';

type F = 'email' | 'password';

export function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors<F>>({});
  const [formError, setFormError] = useState<FieldError | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  async function login(e: FormEvent) {
    e.preventDefault();
    const errs: Errors<F> = { email: emailError(email), password: password ? undefined : { key: 'err_required' } };
    setErrors(errs);
    setFormError(null);
    if (hasErrors(errs)) {
      (errs.email ? emailRef : pwRef).current?.focus();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const key = authErrorKey(error.code);
      if (key === 'err_login') {
        // Fehler direkt an den Feldern zeigen, ohne zu verraten, welches falsch ist.
        setErrors({ password: { key } });
        pwRef.current?.focus();
      } else {
        setFormError({ key });
      }
    }
    // Erfolg: onAuthStateChange setzt die Sitzung, RedirectIfAuthed leitet weiter.
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    const err = emailError(email);
    setErrors({ email: err });
    setFormError(null);
    if (err) {
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/passwort-neu`,
    });
    setBusy(false);
    if (error) setFormError({ key: authErrorKey(error.code) });
    else setResetSent(true);
  }

  const emailField = (
    <Field id="login-email" label={t('email')} error={errors.email} required>
      {(a) => (
        <input
          {...a}
          ref={emailRef}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((p) => ({ ...p, email: undefined }));
          }}
        />
      )}
    </Field>
  );

  if (mode === 'reset') {
    return (
      <AuthLayout title={t('resetTitle')} sub={t('resetHint')}>
        {resetSent ? (
          <p className="notice notice-ok" role="status">
            {t('resetSent')}
          </p>
        ) : (
          <form className="stack" onSubmit={reset} noValidate>
            {emailField}
            {formError && (
              <p className="notice notice-crit" role="alert">
                {t(formError.key)}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
              {t('resetSend')}
            </button>
          </form>
        )}
        <p className="auth-alt">
          <button type="button" className="link" onClick={() => { setMode('login'); setResetSent(false); setFormError(null); }}>
            {t('toLogin')}
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('login_title')} sub={t('login_sub')}>
      <form className="stack" onSubmit={login} noValidate>
        {emailField}
        <Field id="login-pw" label={t('password')} error={errors.password} required>
          {(a) => (
            <input
              {...a}
              ref={pwRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: undefined }));
              }}
            />
          )}
        </Field>
        <button type="button" className="link link-end" onClick={() => { setMode('reset'); setErrors({}); setFormError(null); }}>
          {t('forgotPw')}
        </button>
        {formError && (
          <p className="notice notice-crit" role="alert">
            {t(formError.key)}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
          {t('loginBtn')}
        </button>
      </form>
      <p className="auth-alt">
        {t('noAccount')} <Link to="/registrieren">{t('toRegister')}</Link>
      </p>
    </AuthLayout>
  );
}
