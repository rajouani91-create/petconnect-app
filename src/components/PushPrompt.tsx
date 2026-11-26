import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { dismissHint, hintDismissed } from '../lib/push';
import { enablePush, type EnableResult } from '../lib/pushEnable';
import { usePushStatus } from './PushHint';

const RESULT: Record<Exclude<EnableResult, 'on'>, MessageKey> = { denied: 'pnDenied', 'not-now': 'pnNotNow', 'no-sw': 'pnNoSw', 'not-ready': 'pnNotReady' };

/** Karte auf „Heute“: Erinnerungen aufs Handy – nur solange Push auf diesem Gerät möglich, aber nicht aktiv ist. */
export function PushPrompt() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(hintDismissed);
  const st = usePushStatus(dismissed);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<MessageKey | null>(null);
  if (done) return <p className="notice notice-ok" role="status">{t('pnOn')}</p>;
  if (dismissed || (st !== 'inactive' && st !== 'ios-home')) return null;

  async function allow() {
    setBusy(true);
    setErr(null);
    try {
      const r = await enablePush();
      if (r === 'on') setDone(true);
      else setErr(RESULT[r]);
    } catch (e) {
      console.error(e);
      setErr('errGeneric');
    } finally {
      setBusy(false);
    }
  }
  const later = () => { dismissHint(); setDismissed(true); };

  return (
    <section className="card push-prompt stack-sm" aria-labelledby="pp-h">
      <h2 id="pp-h">{t('ppTitle')}</h2>
      <p className="small">{st === 'ios-home' ? t('ppIos') : t('ppText')}</p>
      <div className="row-actions">
        {st === 'ios-home'
          ? <Link to="/mehr/benachrichtigungen" className="btn btn-primary">{t('ppHow')}</Link>
          : <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void allow()}>{t('ppAllow')}</button>}
        <button type="button" className="btn btn-ghost" onClick={later}>{t('ppLater')}</button>
      </div>
      {err && <p className="notice notice-warn small" role="alert">{t(err)}</p>}
    </section>
  );
}
