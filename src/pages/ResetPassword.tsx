import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { passwordError, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { Loading } from '../components/Loading';

/** Ziel des Links aus „Passwort vergessen“: neues Passwort setzen. */
export function ResetPassword() {
  const { t } = useI18n();
  const { ready, session } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<FieldError | undefined>();
  const [formError, setFormError] = useState<FieldError | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  if (!ready) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = passwordError(pw);
    setError(err);
    setFormError(null);
    if (err) {
      ref.current?.focus();
      return;
    }
    setBusy(true);
    const { error: apiErr } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (apiErr) {
      const key = authErrorKey(apiErr.code);
      if (key === 'err_weakPw') setError({ key });
      else setFormError({ key });
      return;
    }
    setDone(true);
  }

  return (
    <AuthLayout title={t('newPwTitle')}>
      {!session ? (
        <>
          <p className="notice notice-warn" role="alert">{t('newPwNoSession')}</p>
          <p className="auth-alt"><Link to="/login">{t('toLogin')}</Link></p>
        </>
      ) : done ? (
        <>
          <p className="notice notice-ok" role="status">{t('newPwSaved')}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/', { replace: true })}>
            {t('nav_today')}
          </button>
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field id="new-pw" label={t('newPw')} hint={t('pwHint')} error={error} required>
            {(a) => (
              <input {...a} ref={ref} type="password" autoComplete="new-password" value={pw}
                onChange={(e) => { setPw(e.target.value); setError(undefined); }} />
            )}
          </Field>
          {formError && <p className="notice notice-crit" role="alert">{t(formError.key)}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
            {t('newPwSave')}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
