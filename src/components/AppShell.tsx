import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { BottomNav } from './BottomNav';
import { IconEmergency, LogoMark } from './Icons';
import { Loading } from './Loading';

/** Rahmen des geschützten Bereichs: Kopfzeile mit Notfall-Button, Inhalt, Navigation. */
export function AppShell() {
  const { t } = useI18n();
  const { loaded, error, pets } = usePets();
  const { pathname } = useLocation();

  const needsFirstPet = loaded && !error && pets.length === 0;
  // Einladungen und der Support-Bereich müssen auch ohne eigenes Tier erreichbar sein (Rolle prüft die Seite selbst).
  const exempt = pathname === '/tier/neu' || pathname === '/mehr' || pathname === '/mehr/benachrichtigungen' || pathname === '/notfall' || pathname === '/admin' || pathname.startsWith('/einladung/');
  if (needsFirstPet && !exempt) {
    return <Navigate to="/tier/neu" replace />;
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t('skipToContent')}
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <LogoMark />
          <span>PetConnect</span>
        </Link>
        <Link to="/notfall" className="btn btn-emergency" aria-label={t('emergencyOpen')}>
          <IconEmergency size={20} />
          <span>{t('nav_notfall')}</span>
        </Link>
      </header>
      <BottomNav />
      <main id="main" className="main" tabIndex={-1}>
        {!loaded ? (
          <Loading />
        ) : error ? (
          <p className="notice notice-crit" role="alert">
            {t('errGeneric')}
          </p>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
