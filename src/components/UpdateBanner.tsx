import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { SW_UPDATE_EVENT } from '../lib/swRegister';

/** „Neue Version verfügbar – Neu laden“, sobald der Service Worker gewechselt hat */
export function UpdateBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener(SW_UPDATE_EVENT, on);
    return () => window.removeEventListener(SW_UPDATE_EVENT, on);
  }, []);
  return (
    <div className={show ? 'update-banner' : 'sr-only'} aria-live="polite">
      {show && (
        <>
          <span>{t('swUpdate')}</span>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('swReload')}</button>
        </>
      )}
    </div>
  );
}
