import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang, type Lang } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { updateLanguage } from '../lib/api';
import { Field } from '../components/Field';
import { FamilyCard } from '../components/FamilyCard';
import { Link } from 'react-router';
import { IconBell, IconEmergency, IconList } from '../components/Icons';

export function More() {
  const { t, lang, setLang } = useI18n();
  const { user, refreshProfile, signOut } = useAuth();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { hash } = useLocation();

  // „Personen verwalten“ auf der Tier-Seite springt zur Familie-Karte
  useEffect(() => {
    if (hash === '#familie') document.getElementById('familie')?.scrollIntoView({ block: 'start' });
  }, [hash]);

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

      <nav className="card stack more-areas" aria-labelledby="more-areas-h">
        <h2 id="more-areas-h">{t('moreAreas')}</h2>
        <ul className="more-grid">
          <li><Link to="/erinnerungen" className="btn btn-secondary more-btn"><IconBell size={20} />{t('nav_reminders')}</Link></li>
          <li><Link to="/alltag" className="btn btn-secondary more-btn"><IconList size={20} />{t('nav_routine')}</Link></li>
          <li><Link to="/notfall" className="btn btn-secondary more-btn"><IconEmergency size={20} />{t('nav_notfall')}</Link></li>
        </ul>
      </nav>

      <FamilyCard />

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
