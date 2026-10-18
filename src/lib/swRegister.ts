// Service Worker registrieren (nur im Produktions-Build) und neue Versionen melden.

export const SW_UPDATE_EVENT = 'pc-sw-update';

/** Registriert /sw.js. Kommt später eine neue Version an, gibt es ein Ereignis für den Hinweis „Neu laden“. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Gab es beim Start schon einen Service Worker, ist ein Wechsel ein Update (beim allerersten Besuch nicht)
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.dispatchEvent(new Event(SW_UPDATE_EVENT));
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Beim Zurückkehren in die App nach Updates schauen
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch((e: unknown) => console.warn('Service Worker nicht registriert', e));
  });
}
