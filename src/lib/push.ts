// Push-Benachrichtigungen (Web Push): reine Hilfsfunktionen und der Zugriff auf Service Worker/PushManager.
// Kein geheimer Schlüssel in der App – nur der öffentliche VAPID-Schlüssel, zur Laufzeit per RPC.

/** base64url (ohne Padding) → Bytes für `applicationServerKey` */
export function urlBase64ToUint8Array(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Ungültiger Schlüssel');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes → base64url (für die Schlüssel der Anmeldung, falls `toJSON` fehlt) */
export function uint8ToUrlBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isIOS(ua: string, platform = '', maxTouchPoints = 0): boolean {
  // iPadOS meldet sich als „MacIntel“, hat aber einen Touchscreen
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** Gerätebezeichnung aus dem User-Agent, z. B. „Android · Chrome“ (≤ 80 Zeichen) */
export function deviceLabel(ua: string, platform = '', maxTouchPoints = 0): string {
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPad/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
      ? 'iPad'
      : /iPhone|iPod/.test(ua)
        ? 'iPhone'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  const browser = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg(A|iOS)?\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
  return [os, browser].filter(Boolean).join(' · ').slice(0, 80) || 'Browser';
}

export type PushStatus =
  /** Kein Service Worker, kein PushManager oder keine Notification-API */
  | 'unsupported'
  /** iPhone/iPad im Browser: Push nur nach „Zum Home-Bildschirm“ (iOS 16.4+) */
  | 'ios-home'
  /** Berechtigung verweigert */
  | 'blocked'
  /** Angemeldet und erlaubt */
  | 'active'
  /** Möglich, aber noch nicht aktiviert */
  | 'inactive';

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | 'unknown';
  ios: boolean;
  standalone: boolean;
  subscribed: boolean;
}

export function pushStatus(e: PushEnv): PushStatus {
  if (e.ios && !e.standalone) return 'ios-home';
  if (!e.hasServiceWorker || !e.hasPushManager || !e.hasNotification) return 'unsupported';
  if (e.permission === 'denied') return 'blocked';
  if (e.permission === 'granted' && e.subscribed) return 'active';
  return 'inactive';
}

// ---------- Einstellungen ----------

export interface NotificationPrefs {
  medication: boolean;
  /** Tagesplan (Gassi, Füttern …) */
  routine: boolean;
  reminders: boolean;
  appointments: boolean;
  /** HH:MM */
  reminder_time: string;
}
export const DEFAULT_PREFS: NotificationPrefs = { medication: true, routine: true, reminders: true, appointments: true, reminder_time: '09:00' };

/** Zeile fehlt = alles an → beim ersten Speichern anlegen, danach nur ändern */
export function prefsWrite(stored: boolean, next: NotificationPrefs): { op: 'insert' | 'update'; values: NotificationPrefs } {
  return { op: stored ? 'update' : 'insert', values: { ...next, reminder_time: next.reminder_time.slice(0, 5) } };
}

// ---------- Hinweis „Benachrichtigungen aktivieren“ ----------

const HINT_KEY = 'pc-push-hint-off';
export function hintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}
export function dismissHint(): void {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* Speicher nicht verfügbar – Hinweis kommt dann wieder */
  }
}

// ---------- Browser ----------

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function subscriptionKeys(sub: PushSubscription): SubscriptionKeys | null {
  const j = sub.toJSON?.() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  const endpoint = j?.endpoint ?? sub.endpoint;
  const p256dh = j?.keys?.p256dh ?? uint8ToUrlBase64(sub.getKey?.('p256dh') ?? null);
  const auth = j?.keys?.auth ?? uint8ToUrlBase64(sub.getKey?.('auth') ?? null);
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
}

/** Umgebung dieses Geräts; ohne registrierten Service Worker (z. B. Entwicklungsserver) gibt es kein Push */
export function currentEnv(subscribed: boolean, hasRegistration: boolean): PushEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const standalone =
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  return {
    hasServiceWorker: !!nav && 'serviceWorker' in nav && hasRegistration,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
    permission: typeof Notification === 'undefined' ? 'unknown' : Notification.permission,
    ios: !!nav && isIOS(nav.userAgent, nav.platform, nav.maxTouchPoints),
    standalone,
    subscribed,
  };
}

/** Registrierung des Service Workers (nur im Produktions-Build vorhanden), höchstens 3 s warten */
export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  const ready = navigator.serviceWorker.ready.then((r) => r as ServiceWorkerRegistration | null);
  return Promise.race([ready, new Promise<null>((res) => setTimeout(() => res(null), 3000))]);
}

export async function currentSubscription(reg: ServiceWorkerRegistration | null): Promise<PushSubscription | null> {
  if (!reg?.pushManager) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Beispiel-Benachrichtigung lokal über den Service Worker – kein Serveraufruf */
export async function showTestNotification(reg: ServiceWorkerRegistration, title: string, body: string): Promise<void> {
  await reg.showNotification(title, { body, tag: 'petconnect-test', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/erinnerungen' } });
}
