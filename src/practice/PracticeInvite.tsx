import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { passwordError, passwordRepeatError, type FieldError } from '../lib/validate';
import { authErrorKey } from '../auth/authErrors';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { Loading } from '../components/Loading';
import { STAFF_ROLE_LABEL, acceptPracticeInvite, errorCode, practiceErrorKey } from '../lib/practiceAccount';
import { usePractice } from './PracticeProvider';

/** Ziel des Einladungslinks: Passwort festlegen und der Praxis beitreten. */
export function PracticeInvite() {
  const { t } = useI18n();
  const { ready, session, signOut } = useAuth();
  const { me, refresh } = usePractice();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errs, setErrs] = useState<{ pw?: FieldError; pw2?: FieldError }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  if (!ready) return <Loading />;
  if (!session) {
    return (
      <AuthLayout title={t('pi_title')}>
        <p className="notice notice-warn" role="alert">{t('pi_noSession')}</p>
        <p className="auth-alt"><Link to="/login">{t('toLogin')}</Link></p>
      </AuthLayout>
    );
  }
  if (!me) return <Loading />;
  if (me.practice) return <Navigate to="/praxis" replace />;
  if (!me.invite) {
    return (
      <AuthLayout title={t('pi_title')}>
        <p className="notice notice-warn" role="alert">{t('pe_inviteNotFound')}</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>{t('logout')}</button>
      </AuthLayout>
    );
  }
  const inv = me.invite;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { pw: passwordError(pw), pw2: passwordRepeatError(pw, pw2) };
    setErrs(next);
    setFormError(null);
    if (next.pw || next.pw2) {
      pwRef.current?.focus();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      const key = authErrorKey(error.code);
      // Gleiches Passwort wie zuvor gesetzt (z. B. zweiter Versuch): kein Hindernis
      if (error.code !== 'same_password') {
        if (key === 'err_weakPw') setErrs({ pw: { key } });
        else setFormError(t(key));
        setBusy(false);
        return;
      }
    }
    try {
      await acceptPracticeInvite();
      await refresh();
      navigate('/praxis', { replace: true });
    } catch (err) {
      setFormError(t(practiceErrorKey(errorCode(err))));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t('pi_title')} sub={t('pi_sub', { practice: inv.practice_name, role: t(STAFF_ROLE_LABEL[inv.role]) })}>
      {inv.expired ? (
        <>
          <p className="notice notice-warn" role="alert">{t('pe_inviteExpired')}</p>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>{t('logout')}</button>
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field id="pi-pw" label={t('password')} hint={t('pwHint')} error={errs.pw} required>
            {(a) => <input {...a} ref={pwRef} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErrs((p) => ({ ...p, pw: undefined })); }} />}
          </Field>
          <Field id="pi-pw2" label={t('regPw2')} error={errs.pw2} required>
            {(a) => <input {...a} type="password" autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErrs((p) => ({ ...p, pw2: undefined })); }} />}
          </Field>
          {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>{t('pi_accept')}</button>
        </form>
      )}
    </AuthLayout>
  );
}
