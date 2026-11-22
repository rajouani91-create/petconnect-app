import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { NOTIF_CHANGED, unreadCount } from '../lib/notifications';
import { IconBell } from './Icons';

/** Ungelesene Benachrichtigungen: beim Öffnen, jede Minute, beim Zurückkehren ins Fenster und nach Änderungen neu zählen */
export function useUnreadCount(): number | null {
  const [n, setN] = useState<number | null>(null);
  const load = useCallback(() => {
    unreadCount().then(setN).catch(() => setN(null));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onSw = (e: MessageEvent) => { if ((e.data as { type?: unknown } | null)?.type === 'pc-quick-action') load(); };
    window.addEventListener(NOTIF_CHANGED, load);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSw);
      window.clearInterval(timer);
      window.removeEventListener(NOTIF_CHANGED, load);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
  return n;
}

/** Glocke in der Kopfzeile mit Zähler der ungelesenen Benachrichtigungen */
export function NotificationBell({ to }: { to: string }) {
  const { t } = useI18n();
  const n = useUnreadCount();
  const label = n ? t('ncBellUnread', { n }) : t('ncTitle');
  return (
    <Link to={to} className="bell" aria-label={label} title={label}>
      <IconBell size={22} />
      {!!n && <span className="bell-badge" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
