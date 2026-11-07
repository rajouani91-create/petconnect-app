/* PetConnect Service Worker – bewusst ohne Bibliothek.
 * - App-Shell offline: Startseite der App, index.html und die gebauten Dateien aus index.html beim Installieren,
 *   danach Assets und Icons „stale-while-revalidate“. Nur Adressen der App (siehe APP_BASE) werden bearbeitet.
 * - Antworten von Supabase (andere Origin) werden nie angefasst oder gespeichert.
 * - Push: Nachricht anzeigen; Klick öffnet „Heute“ (gleiche Origin). Medikament/Alltag: Knopf „Gegeben“/„Erledigt“ öffnet „Heute“ mit Bestätigungskarte.
 */
const VERSION = 'pc-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/* Pfad, unter dem die App ausgeliefert wird: '' = Wurzel (heute) oder z. B. '/app' (nach dem Umzug).
 * Muss mit APP_BASE in src/lib/appUrl.ts übereinstimmen (ein Test prüft das).
 * Der Service Worker selbst bleibt unter /sw.js mit Scope „/“, damit bestehende Push-Abos erhalten bleiben. */
const APP_BASE = '';
const APP_HOME = `${APP_BASE}/`;
const SHELL_URL = `${APP_BASE}/index.html`;
const ASSET_PREFIX = `${APP_BASE}/assets/`;

/** Gehört der Pfad zur App? (Ohne APP_BASE: alles. Mit APP_BASE: nur /app und darunter – Landing und Rechtsseiten bleiben unberührt.) */
function inApp(pathname) {
  return APP_BASE === '' || pathname === APP_BASE || pathname.startsWith(`${APP_BASE}/`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(SHELL_URL, { cache: 'no-store' });
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put(SHELL_URL, res.clone());
          await cache.put(APP_HOME, res);
          const assetRe = new RegExp(`(?:src|href)="(${escapeRegExp(ASSET_PREFIX)}[^"]+)"`, 'g');
          const assets = [...html.matchAll(assetRe)].map((m) => m[1]);
          await cache.addAll([...new Set(assets)]);
        }
      } catch {
        // offline beim Installieren: beim nächsten Besuch erneut
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nur eigene Origin; Supabase und alles andere geht immer ins Netz
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  const appPath = inApp(url.pathname);
  if (req.mode === 'navigate') {
    // Seiten außerhalb der App (Landing, Rechtsseiten): nicht anfassen
    if (!appPath) return;
    // Seiten der App: Netz zuerst, offline die App-Shell
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(SHELL_URL)) || (await caches.match(APP_HOME)) || Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith(ASSET_PREFIX) || url.pathname.startsWith('/icons/') || (appPath && /\.(?:svg|png|woff2?|webmanifest)$/.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

/** Beschriftung der Knöpfe in der Benachrichtigung (Sprache des Geräts) */
const ACTION_LABEL = {
  give: { de: 'Gegeben', en: 'Given', fr: 'Donné', es: 'Administrado', nl: 'Gegeven', no: 'Gitt', nb: 'Gitt', sv: 'Givet', da: 'Givet', tr: 'Verildi', ru: 'Дано', ar: 'تم الإعطاء' },
  done: { de: 'Erledigt', en: 'Done', fr: 'Fait', es: 'Hecho', nl: 'Gedaan', no: 'Ferdig', nb: 'Ferdig', sv: 'Klart', da: 'Klaret', tr: 'Tamam', ru: 'Готово', ar: 'تم' },
};
function actionLabel(kind) {
  const lang = String((self.navigator && self.navigator.language) || 'de').slice(0, 2).toLowerCase();
  return ACTION_LABEL[kind][lang] || ACTION_LABEL[kind].de;
}

/** Aus dem Kennzeichen „<Art>-<ID>-<Zeitpunkt>“ die Aktion ableiten (nur Medikament und Alltag) */
function actionFromTag(tag) {
  const m = /^(medication|routine)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/i.exec(typeof tag === 'string' ? tag : '');
  if (!m) return null;
  return { kind: m[1] === 'medication' ? 'give' : 'done', id: m[2].toLowerCase(), slot: m[3] };
}

/** Uhrzeit des Zeitpunkts in Berlin (HH:MM) – so speichert die App die Zeiten der Medikamente */
function berlinTime(slot) {
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = parts.find((x) => x.type === 'hour');
  const mi = parts.find((x) => x.type === 'minute');
  return h && mi ? `${h.value}:${mi.value}` : null;
}

/** Adresse für den Knopf: Heute-Seite mit Bestätigungskarte */
function actionUrl(a) {
  if (a.kind === 'give') {
    const time = berlinTime(a.slot);
    return time ? `${APP_HOME}?gegeben=${a.id}&zeit=${time}` : TODAY_URL;
  }
  return `${APP_HOME}?erledigt=${a.id}`;
}

/** Ziel beim Antippen einer Benachrichtigung: die Heute-Seite */
const TODAY_URL = APP_HOME;

const FALLBACK_TITLE = 'PetConnect – Neue Benachrichtigung';

/** Nachricht lesen; leer oder kaputt → neutrale Meldung */
function readPush(data) {
  let msg = null;
  try {
    msg = data ? data.json() : null;
  } catch {
    msg = null;
  }
  const ok = msg && typeof msg === 'object' && typeof msg.title === 'string' && msg.title.trim();
  if (!ok) return { title: FALLBACK_TITLE, options: { body: '', tag: 'petconnect', data: { url: TODAY_URL } } };
  return {
    title: msg.title.slice(0, 120),
    options: {
      body: typeof msg.body === 'string' ? msg.body.slice(0, 300) : '',
      tag: typeof msg.tag === 'string' ? msg.tag.slice(0, 100) : 'petconnect',
      data: { url: TODAY_URL },
      ...actionOptions(typeof msg.tag === 'string' ? msg.tag : ''),
    },
  };
}

/** Knopf „Gegeben“ bzw. „Erledigt“, wenn die Meldung zu einem Medikament oder Alltagspunkt gehört */
function actionOptions(tag) {
  const a = actionFromTag(tag);
  if (!a) return {};
  return { actions: [{ action: a.kind, title: actionLabel(a.kind) }], data: { url: actionUrl(a) } };
}

/** Nur Pfade der eigenen Origin zulassen. Alte Adressen „/?gegeben=…“ (bereits angezeigte Benachrichtigungen) führen zur Startseite der App. */
function safeUrl(u) {
  try {
    const url = new URL(typeof u === 'string' ? u : '/', self.location.origin);
    if (url.origin !== self.location.origin) return TODAY_URL;
    const path = APP_BASE !== '' && url.pathname === '/' ? APP_HOME : url.pathname;
    return path + url.search + url.hash;
  } catch {
    return TODAY_URL;
  }
}

self.addEventListener('push', (event) => {
  const { title, options } = readPush(event.data);
  event.waitUntil(
    self.registration.showNotification(title, {
      ...options,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      renotify: true,
    }),
  );
});

async function openUrl(path) {
  const target = new URL(safeUrl(path), self.location.origin).href;
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const win = wins.find((c) => {
    const u = new URL(c.url);
    return u.origin === self.location.origin && inApp(u.pathname);
  });
  if (win) {
    const nav = win.url === target ? win : await win.navigate(target).catch(() => win);
    await (nav || win).focus().catch(() => undefined);
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Jede Push-Meldung führt zu „Heute“ – dort werden Medikamente, Erinnerungen und Alltag abgehakt.
  const data = event.notification.data;
  const target = event.action && data && typeof data.url === 'string' ? data.url : TODAY_URL;
  event.waitUntil(openUrl(target));
});
