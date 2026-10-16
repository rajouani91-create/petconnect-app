import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang, type Lang } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { updateLanguage } from '../lib/api';
import { Field } from '../components/Field';

export function More() {
  const { t, lang, setLang } = useI18n();
  const { user, refreshProfile, signOut } = useAuth();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeLang(next: Lang) {
    if (!user) return;
    const prev = lang;
    setLang(next);
    setBusy(true);
    try {
      await updateLanguage(user.id, next);
      await refreshProfile();
      setStatus({ ok: true, text: '' });
    } catch (e) {
      console.error(e);
      setLang(prev);
      setStatus({ ok: false, text: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('moreTitle')}</h1>
      </header>

      <section className="card stack" aria-labelledby="lang-h">
        <h2 id="lang-h">{t('langLabel')}</h2>
        <Field id="more-lang" label={t('prefLang')}>
          {(a) => (
            <select {...a} value={lang} disabled={busy} onChange={(e) => isLang(e.target.value) && void changeLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
              ))}
            </select>
          )}
        </Field>
        <p role="status" className={status ? (status.ok ? 'notice notice-ok' : 'notice notice-crit') : 'sr-only'}>
          {status ? t(status.ok ? 'langSaved' : 'errGeneric') : ''}
        </p>
      </section>

      <section className="card stack" aria-labelledby="acc-h">
        <h2 id="acc-h">{t('account')}</h2>
        {user?.email && <p className="muted">{t('signedInAs', { email: user.email })}</p>}
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          {t('logout')}
        </button>
      </section>
    </div>
  );
}
