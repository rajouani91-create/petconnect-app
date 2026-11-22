import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Ziel aus einer Benachrichtigung (z. B. ?termin=<ID>): sobald die Liste geladen ist, zum Eintrag mit
 * id="dl-<ID>" scrollen, ihn kurz hervorheben und den Fokus setzen. Fehlt der Eintrag, ist `missing` true
 * (Seite zeigt dann einen Hinweis statt nichts).
 */
export function useDeepLink(param: string, ids: readonly string[] | null): { target: string | null; missing: boolean } {
  const [params] = useSearchParams();
  const raw = params.get(param);
  const target = raw && /^[0-9a-f-]{36}$/i.test(raw) ? raw.toLowerCase() : null;
  const [missing, setMissing] = useState(false);
  const key = ids ? ids.join(',') : null;
  useEffect(() => {
    if (!target || key === null) return;
    if (!key.split(',').includes(target)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const el = document.getElementById(`dl-${target}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('dl-hit');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    const timer = window.setTimeout(() => el.classList.remove('dl-hit'), 4000);
    return () => window.clearTimeout(timer);
  }, [target, key]);
  return { target, missing };
}
