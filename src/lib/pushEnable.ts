// Push auf diesem Gerät einschalten (gemeinsam für den Hinweis auf „Heute“; dieselben Schritte wie unter Mehr › Benachrichtigungen).
import { deviceLabel, getRegistration, subscriptionKeys, urlBase64ToUint8Array } from './push';
import { registerPush, vapidPublicKey } from './api';

export type EnableResult = 'on' | 'denied' | 'not-now' | 'no-sw' | 'not-ready';

/** Fragt erst nach dem Tippen um Erlaubnis, meldet das Gerät an und speichert es. */
export async function enablePush(): Promise<EnableResult> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'not-now';
  const reg = await getRegistration();
  if (!reg) return 'no-sw';
  const key = await vapidPublicKey();
  if (!key) return 'not-ready';
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const keys = subscriptionKeys(sub);
  if (!keys) throw new Error('Anmeldung ohne Schlüssel');
  await registerPush(keys.endpoint, keys.p256dh, keys.auth, deviceLabel(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
  return 'on';
}
