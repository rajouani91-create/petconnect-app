import { NavLink, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { IconBell, IconCalendar, IconHome, IconList, IconMore, IconPaw, IconPin, LogoMark } from './Icons';
import type { ComponentType, SVGProps } from 'react';

interface Item {
  to: string;
  key: MessageKey;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
  /** nur in der Seitenleiste (ab 900 px); auf dem Handy über „Mehr“ erreichbar */
  secondary?: boolean;
}

const ITEMS: Item[] = [
  { to: '/', key: 'nav_today', Icon: IconHome, end: true },
  { to: '/termine', key: 'nav_termine', Icon: IconCalendar },
  { to: '/tier', key: 'nav_pet', Icon: IconPaw, end: true },
  { to: '/praxen', key: 'nav_practices', Icon: IconPin },
  { to: '/erinnerungen', key: 'nav_reminders', Icon: IconBell, secondary: true },
  { to: '/alltag', key: 'nav_routine', Icon: IconList, secondary: true },
  { to: '/mehr', key: 'nav_more', Icon: IconMore },
];

/** Bereiche, die auf dem Handy unter „Mehr“ liegen (dort ist „Mehr“ hervorgehoben) */
export const MORE_PATHS = ITEMS.filter((i) => i.secondary).map((i) => i.to);

/** Mobil unten (4 wichtigste Bereiche + „Mehr“), ab 900 px als Seitenleiste links mit allen Bereichen (siehe app.css). */
export function BottomNav() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const underMore = MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <nav className="nav" aria-label={t('nav_main')}>
      <div className="nav-brand" aria-hidden="true">
        <LogoMark />
        <span>PetConnect</span>
      </div>
      <ul>
        {ITEMS.map(({ to, key, Icon, end, secondary }) => (
          <li key={to} className={secondary ? 'nav-secondary' : undefined}>
            <NavLink
              to={to}
              end={end ?? false}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${to === '/mehr' && underMore ? ' parent-active' : ''}`}
            >
              <Icon />
              <span>{t(key)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
