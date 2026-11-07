/* PetConnect24 – Weiterleitung von der Landingpage in die App.
 * Wer schon angemeldet ist, aus der installierten App / Android-App kommt oder über eine alte Adresse
 * (Benachrichtigung, Bestätigungs- oder Passwort-Mail) hier landet, geht direkt nach /app/.
 * Alle anderen sehen die Landingpage. Mit ?keep=1 bleibt die Landingpage auch angemeldet sichtbar.
 * Keine Verbindung nach außen; es wird nur lokal gelesen. Fehler (z. B. gesperrter Speicher) zeigen einfach die Landingpage. */
(function () {
  try {
    var loc = window.location;
    var search = loc.search || '';
    var hash = loc.hash || '';
    if (/[?&]keep=1(&|$)/.test(search)) return;
    var go = false;
    // 1) Alte Benachrichtigungs- und Mail-Adressen: /?gegeben=…, /?erledigt=…, Anmelde-Rücksprung
    if (/[?&](gegeben|erledigt|code|error_code)=/.test(search)) go = true;
    if (/[#&](access_token|refresh_token|error_code|type)=/.test(hash)) go = true;
    // 2) Installierte App (PWA) oder Android-App (Trusted Web Activity)
    if (!go && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) go = true;
    if (!go && typeof document.referrer === 'string' && document.referrer.indexOf('android-app://') === 0) go = true;
    // 3) Angemeldete Browser-Nutzer: Sitzung von Supabase im lokalen Speicher
    if (!go && window.localStorage) {
      for (var i = 0; i < window.localStorage.length && !go; i++) {
        var key = window.localStorage.key(i);
        if (key && /^sb-.+-auth-token$/.test(key)) {
          var value = JSON.parse(window.localStorage.getItem(key) || 'null');
          if (value && (value.refresh_token || value.access_token)) go = true;
        }
      }
    }
    if (go) loc.replace('/app/' + search + hash);
  } catch {
    /* Landingpage anzeigen */
  }
})();
