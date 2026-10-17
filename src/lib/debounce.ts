// Eingaben verzögert auswerten und veraltete Antworten verwerfen (Ort/PLZ, Praxisname).

/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird */
export const INPUT_DELAY_MS = 250;
/** Erst ab so vielen Zeichen suchen */
export const MIN_QUERY = 2;

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/** Ruft `fn` erst auf, wenn `ms` lang kein neuer Aufruf kam; nur der letzte zählt. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const d = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(timer);
  return d;
}

/**
 * Nur die Antwort der jüngsten Anfrage zählt: `start()` gibt eine Prüfung zurück, die `false` liefert,
 * sobald eine neuere Anfrage gestartet oder alles verworfen wurde (ältere Antworten werden ignoriert).
 */
export function latestOnly() {
  let seq = 0;
  return {
    start() {
      const my = ++seq;
      return () => my === seq;
    },
    cancel() {
      seq++;
    },
  };
}

/** Text für eine Suche: nur trimmen; unter MIN_QUERY Zeichen nicht suchen */
export function searchText(raw: string): string {
  const q = raw.trim();
  return q.length >= MIN_QUERY ? q : '';
}
