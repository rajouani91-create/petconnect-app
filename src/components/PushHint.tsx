import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { currentEnv, currentSubscription, dismissHint, getRegistration, hintDismissed, pushStatus, type PushStatus } from '../lib/push';

/** Push-Status dieses Geräts (null = wird noch ermittelt); `skip` = gar nicht erst prüfen */
export function usePushStatus(skip = false): PushStatus | null {
  const [state, setState] = useState<PushStatus | null>(null);
  useEffect(() => {
    if (skip) return;
    let alive = true;
    void (async () => {
      const reg = await getRegistration().catch(() => null);
      const sub = await currentSubscription(reg);
      if (alive) setState(pushStatus(currentEnv(!!sub, reg !== null)));
    })();
    return () => {
      alive = false;
    };
  }, [skip]);
  return state;
}

/**
 * Dezenter Hinweis „Möchten Sie zur Uhrzeit erinnert werden? Benachrichtigungen aktivieren“.
 * Nur solange auf diesem Gerät nicht aktiv (und möglich); „Nicht mehr anzeigen“ merkt sich das Gerät.
 */
export function PushHint() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(hintDismissed);
  const st = usePushStatus(dismissed);
  const show = !dismissed && (st === 'inactive' || st === 'ios-home');
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
          setDismissed(true);
        }}
      >
        {t('pnHintOff')}
      </button>
    </aside>
  );
}
