import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { staffRoleFor } from '../lib/staff';
import { IconBell, IconChart, IconChevron, IconEmergency, IconList, IconPeople, IconShield, IconSparkle, IconUser } from '../components/Icons';

function Row({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <li>
      <Link to={to} className="menu-row">
        <span className="menu-ic">{icon}</span>
        <span className="menu-label">{label}</span>
        <IconChevron size={18} className="menu-chev" />
      </Link>
    </li>
  );
}

function Group({ id, title, children }: { id: string; title: MessageKey; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={id} className="menu-group">
      <h2 id={id} className="menu-title">{t(title)}</h2>
      <ul className="card menu-list">{children}</ul>
    </section>
  );
}

/** Mehr: ruhiges Menü in Gruppen; Familie und Konto liegen auf eigenen Seiten. */
export function More() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { hash } = useLocation();
  const [isStaff, setIsStaff] = useState(false);

  // Admin-/Support-Zugang nur für Konten mit Rolle anzeigen
  useEffect(() => {
    if (!user) return;
    let alive = true;
    staffRoleFor(user.id)
      .then((role) => { if (alive) setIsStaff(role !== null); })
      .catch(() => { if (alive) setIsStaff(false); });
    return () => { alive = false; };
  }, [user]);

  // Alte Verweise mit #familie führen auf die neue Seite
  if (hash === '#familie') return <Navigate to="/mehr/familie" replace />;

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('moreTitle')}</h1>
      </header>

      <Group id="more-pets-h" title="moreGroupPets">
        <Row to="/erinnerungen" icon={<IconBell size={20} />} label={t('nav_reminders')} />
        <Row to="/alltag" icon={<IconList size={20} />} label={t('nav_routine')} />
        <Row to="/notfall" icon={<IconEmergency size={20} />} label={t('moreEmergencyCard')} />
        <Row to="/mehr/monatsuebersicht" icon={<IconChart size={20} />} label={t('moTitle')} />
        <Row to="/mehr/assistent" icon={<IconSparkle size={20} />} label={t('aiMenu')} />
        {isStaff && <Row to="/admin" icon={<IconShield size={20} />} label={t('adminTitle')} />}
      </Group>

      <Group id="more-account-h" title="moreGroupAccount">
        <Row to="/mehr/familie" icon={<IconPeople size={20} />} label={t('moreFamily')} />
        <Row to="/mehr/benachrichtigungen" icon={<IconBell size={20} />} label={t('pnTitle')} />
        <Row to="/mehr/konto" icon={<IconUser size={20} />} label={t('moreAccount')} />
      </Group>

      <Group id="more-help-h" title="moreGroupHelp">
        <Row to="/datenschutz" icon={<IconShield size={20} />} label={t('legalPrivacy')} />
        <Row to="/impressum" icon={<IconList size={20} />} label={t('legalImprint')} />
      </Group>
    </div>
  );
}
