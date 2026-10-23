import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { supabase } from '../lib/supabase';
import { emailError, hasErrors, type Errors, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { readPendingInvite } from '../lib/sharing';
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
  const [showPw, setShowPw] = useState(false);
  // Die Einführung zeigt sich nur ohne wartende Einladung; mit Einladung geht es direkt zur Anmeldung.
  const [intro, setIntro] = useState(() => readPendingInvite() === null);
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

  if (mode === 'login' && intro) {
    return (
      <AuthLayout title={t('intro_title')} sub={t('intro_sub')}>
        <ul className="intro-list">
          <li>{t('intro_f1')}</li>
          <li>{t('intro_f2')}</li>
          <li>{t('intro_f3')}</li>
        </ul>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setIntro(false)}>
          {t('intro_cta')}
        </button>
        <p className="auth-alt">
          {t('noAccount')} <Link to="/registrieren">{t('toRegister')}</Link>
        </p>
      </AuthLayout>
    );
  }

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
    <AuthLayout title={t('login_title')} sub={t('login_sub')} inviteHint>
      <form className="stack" onSubmit={login} noValidate>
        {emailField}
        <Field id="login-pw" label={t('password')} error={errors.password} required>
          {(a) => (
            <div className="pw-wrap">
              <input
                {...a}
                ref={pwRef}
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: undefined }));
                }}
              />
              <button
                type="button"
                className="pw-toggle"
                aria-label={t(showPw ? 'hidePw' : 'showPw')}
                title={t(showPw ? 'hidePw' : 'showPw')}
                onClick={() => setShowPw((v) => !v)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPw && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>
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
