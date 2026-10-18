import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { currentEnv, currentSubscription, dismissHint, getRegistration, hintDismissed, pushStatus } from '../lib/push';

/**
 * Dezenter Hinweis „Möchten Sie zur Uhrzeit erinnert werden? Benachrichtigungen aktivieren“.
 * Nur solange auf diesem Gerät nicht aktiv (und möglich); „Nicht mehr anzeigen“ merkt sich das Gerät.
 */
export function PushHint() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (hintDismissed()) return;
    let alive = true;
    void (async () => {
      const reg = await getRegistration().catch(() => null);
      const sub = await currentSubscription(reg);
      const st = pushStatus(currentEnv(!!sub, reg !== null));
      if (alive) setShow(st === 'inactive' || st === 'ios-home');
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!show) return null;
  return (
    <aside className="notice notice-info push-hint" aria-label={t('pnHintL')}>
      <p>
        {t('pnHint')} <Link to="/mehr/benachrichtigungen" className="link">{t('pnHintLink')}</Link>
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-start"
        onClick={() => {
          dismissHint();
          setShow(false);
        }}
      >
        {t('pnHintOff')}
      </button>
    </aside>
  );
}
