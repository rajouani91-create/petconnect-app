import { useEffect, useState } from 'react';
import { signedPhotoUrl } from './api';

const TTL_S = 3600;
/** etwas vor Ablauf neu holen, damit kein Bild mitten im Anzeigen ungültig wird */
const MARGIN_MS = 5 * 60 * 1000;

// Signed URLs je Foto-Pfad zwischenspeichern, bis sie (fast) ablaufen. Ein neuer Pfad = neues Foto.
const cache = new Map<string, { url: string; until: number }>();
const inflight = new Map<string, Promise<string>>();

function cached(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
}

export function photoUrl(path: string): Promise<string> {
  const hit = cached(path);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(path);
  if (!p) {
    p = signedPhotoUrl(path, TTL_S)
      .then((url) => {
        cache.set(path, { url, until: Date.now() + TTL_S * 1000 - MARGIN_MS });
        return url;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/** Signed URL zum Foto eines Tieres, oder null (kein Foto, noch nicht geladen, Fehler). */
export function usePetPhoto(pet: { photo_path: string | null } | null | undefined): string | null {
  const path = pet?.photo_path ?? null;
  const [state, setState] = useState<{ path: string | null; url: string | null }>(() => ({
    path,
    url: path ? cached(path) : null,
  }));

  useEffect(() => {
    if (!path) {
      setState({ path: null, url: null });
      return;
    }
    const hit = cached(path);
    setState({ path, url: hit });
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      photoUrl(path)
        .then((url) => {
          if (!alive) return;
          setState({ path, url });
          // Nach Ablauf erneuern, falls die Seite lange offen bleibt
          const until = cache.get(path)?.until;
          if (until) timer = setTimeout(load, Math.max(60_000, until - Date.now()));
        })
        .catch((e: unknown) => {
          console.error('Foto-Link konnte nicht erstellt werden', e);
          if (alive) setState({ path, url: null });
        });
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [path]);

  return state.path === path ? state.url : null;
}
