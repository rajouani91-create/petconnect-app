import { NavLink, Navigate, Outlet } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { IconPeople, IconUser, LogoMark } from '../components/Icons';
import { usePractice } from './PracticeProvider';

/** Rahmen der Praxissicht (Seitenleiste wie im Prototyp). Ohne Praxis geht es zur Einrichtung bzw. zur Einladung. */
export function PracticeShell() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { me } = usePractice();
  if (!me) return null;
  if (!me.practice) return <Navigate to={me.invite ? '/praxis/einladung' : '/praxis/einrichten'} replace />;

  if (me.practice.status === 'suspended') {
    return (
      <div className="shell shell-practice">
        <main id="main" className="main" tabIndex={-1}>
          <div className="card stack">
            <h1>{t('pp_suspendedTitle')}</h1>
            <p>{t('pp_suspended')}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>{t('logout')}</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const items = [
    { to: '/praxis', key: 'pp_navProfile', Icon: IconUser, end: true },
    { to: '/praxis/team', key: 'pp_navTeam', Icon: IconPeople, end: false },
  ] as const;

  return (
    <div className="shell shell-practice">
      <a className="skip-link" href="#main">{t('skipToContent')}</a>
      <header className="topbar">
        <span className="brand">
          <LogoMark />
          <span>PetConnect24</span>
        </span>
        <span className="muted small topbar-practice">{me.practice.name}</span>
      </header>
      <nav className="nav nav-practice" aria-label={t('nav_main')}>
        <div className="nav-brand" aria-hidden="true">
          <LogoMark />
          <span>PetConnect24</span>
        </div>
        <ul style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(({ to, key, Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon />
                <span>{t(key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="main main-wide" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
