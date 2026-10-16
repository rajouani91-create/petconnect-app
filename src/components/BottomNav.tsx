import { NavLink } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { IconBell, IconCalendar, IconHome, IconList, IconMore, IconPaw, LogoMark } from './Icons';
import type { ComponentType, SVGProps } from 'react';

const ITEMS: { to: string; key: MessageKey; Icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean }[] = [
  { to: '/', key: 'nav_today', Icon: IconHome, end: true },
  { to: '/termine', key: 'nav_termine', Icon: IconCalendar },
  { to: '/tier', key: 'nav_pet', Icon: IconPaw, end: true },
  { to: '/erinnerungen', key: 'nav_reminders', Icon: IconBell },
  { to: '/alltag', key: 'nav_routine', Icon: IconList },
  { to: '/mehr', key: 'nav_more', Icon: IconMore },
];

/** Mobil unten, ab 900 px als Seitenleiste links (siehe app.css). */
export function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="nav" aria-label={t('nav_main')}>
      <div className="nav-brand" aria-hidden="true">
        <LogoMark />
        <span>PetConnect</span>
      </div>
      <ul>
        {ITEMS.map(({ to, key, Icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end ?? false} className="nav-link">
              <Icon />
              <span>{t(key)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
