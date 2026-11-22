/* PetConnect Service Worker – bewusst ohne Bibliothek.
 * - App-Shell offline: Startseite der App, index.html und die gebauten Dateien aus index.html beim Installieren,
 *   danach Assets und Icons „stale-while-revalidate“. Nur Adressen der App (siehe APP_BASE) werden bearbeitet.
 * - Antworten von Supabase (andere Origin) werden nie angefasst oder gespeichert.
 * - Push: Nachricht anzeigen; Antippen öffnet das Ziel der Nachricht (Rechnung, Termin, Tierakte …, gleiche Origin, unter APP_BASE).
 *   Medikament/Alltag: Knopf „Gegeben“/„Erledigt“ öffnet „Heute“ mit Bestätigungskarte.
 */
const VERSION = 'pc-v2';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/* Pfad, unter dem die App ausgeliefert wird: '' = Wurzel (heute) oder z. B. '/app' (nach dem Umzug).
 * Muss mit APP_BASE in src/lib/appUrl.ts übereinstimmen (ein Test prüft das).
 * Der Service Worker selbst bleibt unter /sw.js mit Scope „/“, damit bestehende Push-Abos erhalten bleiben. */
const APP_BASE = '/app';
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

/** Beschriftung der Knöpfe in der Benachrichtigung und der Bestätigung (Sprache des Geräts) */
const ACTION_LABEL = {
  fed: { de: 'Gefüttert', en: 'Fed', fr: 'Nourri', es: 'Alimentado', nl: 'Gevoerd', no: 'Fôret', nb: 'Fôret', sv: 'Utfodrad', da: 'Fodret', tr: 'Beslendi', ru: 'Накормлен', ar: 'تم الإطعام' },
  snooze: { de: 'Später erinnern', en: 'Remind me later', fr: 'Rappeler plus tard', es: 'Recordar más tarde', nl: 'Later herinneren', no: 'Påminn senere', nb: 'Påminn senere', sv: 'Påminn senare', da: 'Påmind senere', tr: 'Sonra hatırlat', ru: 'Напомнить позже', ar: 'ذكّرني لاحقًا' },
  okDone: { de: '✓ Eingetragen.', en: '✓ Saved.', fr: '✓ Enregistré.', es: '✓ Guardado.', nl: '✓ Opgeslagen.', no: '✓ Lagret.', nb: '✓ Lagret.', sv: '✓ Sparat.', da: '✓ Gemt.', tr: '✓ Kaydedildi.', ru: '✓ Сохранено.', ar: '✓ تم الحفظ.' },
  okAlready: { de: '✓ War bereits eingetragen.', en: '✓ Already recorded.', fr: '✓ Déjà enregistré.', es: '✓ Ya estaba registrado.', nl: '✓ Was al opgeslagen.', no: '✓ Var allerede registrert.', nb: '✓ Var allerede registrert.', sv: '✓ Redan registrerat.', da: '✓ Var allerede registreret.', tr: '✓ Zaten kaydedilmişti.', ru: '✓ Уже отмечено.', ar: '✓ مسجل بالفعل.' },
  okSnooze: { de: 'Erinnerung in 30 Minuten.', en: 'Reminder in 30 minutes.', fr: 'Rappel dans 30 minutes.', es: 'Recordatorio en 30 minutos.', nl: 'Herinnering over 30 minuten.', no: 'Påminnelse om 30 minutter.', nb: 'Påminnelse om 30 minutter.', sv: 'Påminnelse om 30 minuter.', da: 'Påmindelse om 30 minutter.', tr: '30 dakika sonra hatırlatma.', ru: 'Напоминание через 30 минут.', ar: 'تذكير بعد 30 دقيقة.' },
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

/** Adresse für den Knopf: Heute-Seite mit Bestätigungskarte (time: geplante Uhrzeit, falls bekannt) */
function actionUrl(a, planned) {
  if (a.kind === 'give') {
    const time = typeof planned === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(planned) ? planned : berlinTime(a.slot);
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
  if (!ok) return { title: FALLBACK_TITLE, options: { body: '', tag: 'petconnect', data: { v: 2, url: TODAY_URL } } };
  const tag = typeof msg.tag === 'string' ? msg.tag : '';
  // Ziel beim Antippen: die Adresse aus der Nachricht (z. B. die Rechnung), sonst „Heute“
  const target = { v: 2, url: typeof msg.url === 'string' && msg.url ? safeUrl(msg.url) : TODAY_URL };
  const a = actionFromTag(tag);
  let actions;
  if (a) {
    target.actionUrl = actionUrl(a, msg.t);
    const quick = quickApi(msg);
    if (quick) {
      // Erledigen direkt aus der Benachrichtigung (ohne die App zu öffnen)
      target.qa = msg.qa;
      target.api = quick;
      actions = a.kind === 'give'
        ? [{ action: 'done', title: actionLabel('give') }, { action: 'snooze', title: actionLabel('snooze') }]
        : [{ action: 'done', title: actionLabel(msg.cat === 'feeding' ? 'fed' : 'done') }];
    } else {
      // ältere Funktion ohne Token: Knopf öffnet „Heute“ mit Bestätigungskarte
      actions = [{ action: a.kind, title: actionLabel(a.kind) }];
    }
  }
  return {
    title: msg.title.slice(0, 120),
    options: {
      body: typeof msg.body === 'string' ? msg.body.slice(0, 300) : '',
      tag: tag ? tag.slice(0, 100) : 'petconnect',
      data: target,
      ...(actions ? { actions } : {}),
    },
  };
}

/** Token und Adresse der Datenbank für Quick Actions prüfen (nur https, Token = 64 Hex-Zeichen) */
function quickApi(msg) {
  if (typeof msg.qa !== 'string' || !/^[0-9a-f]{64}$/.test(msg.qa)) return null;
  const api = msg.api;
  if (!api || typeof api.url !== 'string' || typeof api.key !== 'string' || !api.key) return null;
  try {
    const u = new URL(api.url);
    if (u.protocol !== 'https:') return null;
    return { url: u.origin, key: api.key };
  } catch {
    return null;
  }
}

/** „Erledigt“ / „Später“ ausführen. Klappt es nicht (offline, Token abgelaufen, Fehler), öffnet sich die App. */
async function quickAction(data, action, title, tag) {
  try {
    const res = await fetch(`${data.api.url}/rest/v1/rpc/push_quick_action`, {
      method: 'POST',
      headers: { apikey: data.api.key, Authorization: `Bearer ${data.api.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: data.qa, p_action: action }),
    });
    const r = res.ok ? await res.json() : null;
    const result = r && typeof r === 'object' ? r.result : null;
    if (result === 'done' || result === 'already' || result === 'snoozed') {
      const body = actionLabel(result === 'done' ? 'okDone' : result === 'already' ? 'okAlready' : 'okSnooze');
      await self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', silent: true, data: { v: 2, url: data.url } });
      // offene App-Fenster aktualisieren (Heute, Glocke)
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) w.postMessage({ type: 'pc-quick-action', result });
      // Bestätigung nach kurzer Zeit wieder ausblenden
      await new Promise((ok) => setTimeout(ok, 4000));
      const shown = await self.registration.getNotifications({ tag });
      for (const n of shown) if (n.body === body) n.close();
      return;
    }
  } catch {
    // offline oder Netzfehler: unten die App öffnen
  }
  await openUrl(action === 'done' && typeof data.actionUrl === 'string' ? data.actionUrl : typeof data.url === 'string' ? data.url : TODAY_URL);
}

/** Nur Pfade der eigenen Origin zulassen. Pfade der App ohne APP_BASE (so liefert sie die Datenbank, z. B. „/mehr/rechnungen/…“)
 *  bekommen APP_BASE davor; alte Adressen „/?gegeben=…“ führen zur Startseite der App. */
function safeUrl(u) {
  try {
    const url = new URL(typeof u === 'string' ? u : '/', self.location.origin);
    if (url.origin !== self.location.origin) return TODAY_URL;
    let path = url.pathname;
    if (APP_BASE !== '' && !inApp(path)) path = path === '/' ? APP_HOME : `${APP_BASE}${path}`;
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
  const data = event.notification.data || {};
  if (data.v === 2 && data.qa && data.api && (event.action === 'done' || event.action === 'snooze')) {
    event.waitUntil(quickAction(data, event.action, event.notification.title, event.notification.tag));
    return;
  }
  let target = TODAY_URL;
  if (data.v === 2) {
    // Knopf → „Heute“ mit Bestätigungskarte; Antippen → Ziel der Nachricht
    target = event.action && typeof data.actionUrl === 'string' ? data.actionUrl : typeof data.url === 'string' ? data.url : TODAY_URL;
  } else if (event.action && typeof data.url === 'string') {
    // bereits angezeigte Meldungen aus der Zeit vor Version 2: Knopf wie bisher, Antippen → „Heute“
    target = data.url;
  }
  event.waitUntil(openUrl(target));
});
