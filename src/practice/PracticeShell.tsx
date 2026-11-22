import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { IconBell, IconCalendar, IconChat, IconHome, IconList, IconPaw, IconPeople, IconReceipt, IconUser, LogoMark } from '../components/Icons';
import { practiceAppointments } from '../lib/practiceAppointments';
import { openCount, practiceInquiries } from '../lib/inquiries';
import { practiceInvoices, viewStatus } from '../lib/billing';
import { zonedNow } from '../lib/time';
import { usePractice } from './PracticeProvider';
import { NotificationBell } from '../components/NotificationBell';

/** Rahmen der Praxissicht (Seitenleiste wie im Prototyp). Ohne Praxis geht es zur Einrichtung bzw. zur Einladung. */
export function PracticeShell() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { me } = usePractice();
  const { pathname } = useLocation();
  const active = me?.practice?.status === 'active';
  const [fresh, setFresh] = useState(0);
  const [asks, setAsks] = useState(0);
  const [bills, setBills] = useState(0);
  // Zähler „neue Online-Buchungen“ und „offene Anfragen“ an den Menüpunkten; bei jedem Seitenwechsel neu
  useEffect(() => {
    if (!active) return;
    let alive = true;
    practiceAppointments().then((r) => { if (alive) setFresh(r.filter((a) => a.status === 'new').length); }).catch(() => undefined);
    practiceInquiries().then((r) => { if (alive) setAsks(openCount(r)); }).catch(() => undefined);
    // Abrechnung: überfällige Rechnungen + Entwürfe (wie im Prototyp)
    practiceInvoices().then((r) => {
      const today = zonedNow(new Date()).date;
      if (alive) setBills(r.filter((x) => x.status === 'draft' || viewStatus(x, today) === 'overdue').length);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [active, pathname]);
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

  // Reihenfolge wie im Prototyp: Tagesplan, Buchungen, Kalender, Patienten, Abrechnung, Erinnerungen, Anfragen, Team, Profil
  const items = [
    { to: '/praxis', key: 'tpNav', Icon: IconHome, end: true, badge: 0, label: 'obNewHint' },
    { to: '/praxis/termine', key: 'nav_bookings', Icon: IconList, end: false, badge: fresh, label: 'obNewHint' },
    { to: '/praxis/kalender', key: 'calTitle', Icon: IconCalendar, end: false, badge: 0, label: 'obNewHint' },
    { to: '/praxis/patienten', key: 'ptTitle', Icon: IconPaw, end: false, badge: 0, label: 'obNewHint' },
    { to: '/praxis/abrechnung', key: 'blNav', Icon: IconReceipt, end: false, badge: bills, label: 'blNavHint' },
    { to: '/praxis/erinnerungen', key: 'rclNav', Icon: IconBell, end: false, badge: 0, label: 'obNewHint' },
    { to: '/praxis/anfragen', key: 'iqNav', Icon: IconChat, end: false, badge: asks, label: 'iqOpenHint' },
    { to: '/praxis/team', key: 'pp_navTeam', Icon: IconPeople, end: false, badge: 0, label: 'obNewHint' },
    { to: '/praxis/profil', key: 'pp_navProfile', Icon: IconUser, end: false, badge: 0, label: 'obNewHint' },
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
        <NotificationBell to="/praxis/mitteilungen" />
      </header>
      <nav className="nav nav-practice" aria-label={t('nav_main')}>
        <div className="nav-brand" aria-hidden="true">
          <LogoMark />
          <span>PetConnect24</span>
        </div>
        <ul>
          {items.map(({ to, key, Icon, end, badge, label }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon />
                <span>{t(key)}</span>
                {badge > 0 && <span className="nav-badge" aria-label={t(label, { n: badge })}>{badge}</span>}
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
