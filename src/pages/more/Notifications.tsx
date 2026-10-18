import { useCallback, useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, type MessageKey } from '../../i18n';
import {
  getNotificationPrefs,
  listPushDevices,
  registerPush,
  removePushDevice,
  removePushEndpoint,
  saveNotificationPrefs,
  vapidPublicKey,
  type PushDeviceRow,
} from '../../lib/api';
import {
  DEFAULT_PREFS,
  currentEnv,
  currentSubscription,
  deviceLabel,
  getRegistration,
  pushStatus,
  showTestNotification,
  subscriptionKeys,
  urlBase64ToUint8Array,
  type NotificationPrefs,
  type PushStatus,
} from '../../lib/push';
import { useAuth } from '../../auth/AuthProvider';
import { Field } from '../../components/Field';
import { Loading } from '../../components/Loading';
import { Switch } from '../../components/Switch';
import { StatusLine, useFocusAfter, useStatus } from '../../components/record/shared';
import { recordErrorKey } from '../../lib/record';

const STATUS_TEXT: Record<PushStatus, MessageKey> = {
  active: 'pnStActive',
  inactive: 'pnStInactive',
  blocked: 'pnStBlocked',
  unsupported: 'pnStUnsupported',
  'ios-home': 'pnStIos',
};

/** Mehr → Benachrichtigungen: dieses Gerät an-/abmelden, was gemeldet wird, meine Geräte, Testnachricht. */
export function Notifications() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const uid = useId();
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [state, setState] = useState<PushStatus | null>(null);
  const [devices, setDevices] = useState<PushDeviceRow[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsStored, setPrefsStored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();
  const [prefsSaved, setPrefsSaved] = useState('');
  const { register, focusLater } = useFocusAfter();

  const refresh = useCallback(async () => {
    const r = await getRegistration().catch(() => null);
    const sub = await currentSubscription(r);
    let list: PushDeviceRow[] = [];
    try {
      list = await listPushDevices();
    } catch (e) {
      console.error(e);
    }
    setReg(r);
    setDevices(list);
    setEndpoint(sub?.endpoint ?? null);
    // Aktiv nur, wenn das Gerät auch beim Konto angemeldet ist
    setState(pushStatus(currentEnv(!!sub && list.some((d) => d.endpoint === sub.endpoint), r !== null)));
  }, []);

  useEffect(() => {
    void refresh();
    let alive = true;
    getNotificationPrefs()
      .then((p) => {
        if (!alive) return;
        setPrefs(p ?? DEFAULT_PREFS);
        setPrefsStored(p !== null);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setPrefs(DEFAULT_PREFS);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setStatus('');
    try {
      // Erst nach dem Klick fragen – nie automatisch
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(t(perm === 'denied' ? 'pnDenied' : 'pnNotNow'), false);
        await refresh();
        return;
      }
      const r = reg ?? (await getRegistration());
      if (!r) {
        setStatus(t('pnNoSw'), false);
        return;
      }
      const key = await vapidPublicKey();
      if (!key) {
        setStatus(t('pnNotReady'), false);
        return;
      }
      const sub = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const keys = subscriptionKeys(sub);
      if (!keys) throw new Error('Anmeldung ohne Schlüssel');
      await registerPush(keys.endpoint, keys.p256dh, keys.auth, deviceLabel(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
      await refresh();
      setStatus(t('pnOn'));
      focusLater('off');
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await currentSubscription(reg);
      if (sub) {
        await removePushEndpoint(sub.endpoint);
        await sub.unsubscribe().catch(() => false);
      }
      await refresh();
      setStatus(t('pnOff'));
      focusLater('on');
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(d: PushDeviceRow) {
    try {
      await removePushDevice(d.id);
      if (d.endpoint === endpoint) await (await currentSubscription(reg))?.unsubscribe().catch(() => false);
      await refresh();
      setStatus(t('pnRemoved', { n: d.device_label || t('pnUnknownDevice') }));
      focusLater('devices');
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
  }

  async function savePrefs(next: NotificationPrefs) {
    if (!user) return;
    const before = prefs;
    setPrefs(next);
    setPrefsSaved('');
    try {
      await saveNotificationPrefs(user.id, prefsStored, next);
      setPrefsStored(true);
      setPrefsSaved(t('savedShort'));
    } catch (e) {
      console.error(e);
      setPrefs(before);
      setPrefsSaved(t(recordErrorKey(e)));
    }
  }

  async function test() {
    if (!reg) return;
    try {
      await showTestNotification(reg, t('pnTestTitle'), t('pnTestBody'));
      setStatus(t('pnTestShown'));
    } catch (e) {
      console.error(e);
      setStatus(t('pnTestFail'), false);
    }
  }

  const date = (iso: string | null) => (iso ? formatIsoDateShort(iso.slice(0, 10), lang) : t('pnNever'));
  const canTest = !!reg && typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('pnTitle')}</h1>
        <p className="muted">{t('pnSub')}</p>
      </header>

      <section className="card stack" aria-labelledby={`${uid}-dev`}>
        <h2 id={`${uid}-dev`}>{t('pnThisDevice')}</h2>
        {state === null ? (
          <Loading />
        ) : (
          <>
            <p className={`push-state push-state-${state}`}>{t(STATUS_TEXT[state])}</p>
            {state === 'blocked' && (
              <ol className="tip-list">
                <li>{t('pnHelp1')}</li>
                <li>{t('pnHelp2')}</li>
                <li>{t('pnHelp3')}</li>
              </ol>
            )}
            {state === 'ios-home' && <p className="muted">{t('pnIosHow')}</p>}
            <div className="actions actions-start">
              {state === 'inactive' && (
                <button type="button" ref={register('on')} className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void enable()}>
                  {t('pnEnable')}
                </button>
              )}
              {state === 'active' && (
                <button type="button" ref={register('off')} className="btn btn-secondary" disabled={busy} aria-busy={busy} onClick={() => void disable()}>
                  {t('pnDisable')}
                </button>
              )}
              {canTest && (
                <button type="button" className="btn btn-ghost" onClick={() => void test()}>{t('pnTest')}</button>
              )}
            </div>
          </>
        )}
        <p className="muted small">{t('pnPrivacy')}</p>
      </section>

      <section className="card stack" aria-labelledby={`${uid}-what`}>
        <h2 id={`${uid}-what`}>{t('pnWhat')}</h2>
        {!prefs ? (
          <Loading />
        ) : (
          <>
            <Switch label={t('pnMed')} checked={prefs.medication} onChange={(on) => void savePrefs({ ...prefs, medication: on })} />
            <Switch label={t('pnRem')} checked={prefs.reminders} onChange={(on) => void savePrefs({ ...prefs, reminders: on })} />
            <Switch label={t('pnAppt')} checked={prefs.appointments} onChange={(on) => void savePrefs({ ...prefs, appointments: on })} />
            <Field id={`${uid}-time`} label={t('pnRemTime')} hint={t('pnRemTimeHint')}>
              {(a) => (
                <input
                  {...a}
                  type="time"
                  value={prefs.reminder_time}
                  disabled={!prefs.reminders}
                  onChange={(e) => {
                    if (/^\d{2}:\d{2}$/.test(e.target.value)) void savePrefs({ ...prefs, reminder_time: e.target.value });
                  }}
                />
              )}
            </Field>
            <p className="small muted" aria-live="polite">{prefsSaved}</p>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby={`${uid}-list`}>
        <h2 id={`${uid}-list`} ref={register('devices')} tabIndex={-1}>{t('pnDevices')}</h2>
        {!devices ? (
          <Loading />
        ) : devices.length === 0 ? (
          <p className="muted">{t('pnNoDevices')}</p>
        ) : (
          <ul className="record-list">
            {devices.map((d) => (
              <li key={d.id} className="record-row device-row">
                <div className="record-main">
                  <span className="record-title">
                    {d.device_label || t('pnUnknownDevice')}
                    {d.endpoint === endpoint && <span className="pill pill-ok">{t('pnThis')}</span>}
                  </span>
                  <span className="muted small">{t('pnSince', { d: date(d.created_at) })} · {t('pnLastOk', { d: date(d.last_ok_at) })}</span>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-ghost" aria-label={t('pnRemoveL', { n: d.device_label || t('pnUnknownDevice') })} onClick={() => void removeDevice(d)}>
                    {t('pnRemove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <StatusLine status={status} />
    </div>
  );
}
