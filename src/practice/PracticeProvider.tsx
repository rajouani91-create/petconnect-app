import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { OWNER_ME, practiceMe, type PracticeMe } from '../lib/practiceAccount';

interface PracticeValue {
  /** null, solange noch geladen wird */
  me: PracticeMe | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PracticeValue | null>(null);

/** Lädt nach der Anmeldung Kontoart, Praxis und Rolle (eine Abfrage). Bei Fehlern gilt das Konto als Halter-Konto. */
export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<{ uid: string | null; me: PracticeMe | null }>({ uid: null, me: null });

  const load = useCallback(async (id: string) => {
    let me: PracticeMe;
    try {
      me = await practiceMe();
    } catch (e) {
      console.error('Kontoart konnte nicht geladen werden', e);
      me = OWNER_ME;
    }
    setState({ uid: id, me });
  }, []);

  useEffect(() => {
    if (uid) void load(uid);
  }, [uid, load]);

  const refresh = useCallback(async () => {
    if (uid) await load(uid);
  }, [uid, load]);

  const value = useMemo<PracticeValue>(() => ({ me: uid && state.uid === uid ? state.me : null, refresh }), [uid, state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePractice(): PracticeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePractice muss innerhalb von <PracticeProvider> verwendet werden.');
  return v;
}

/** Halter-Bereich: Praxis-Konten werden in die Praxissicht geleitet. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { me } = usePractice();
  if (!me) return <Loading />;
  if (me.kind === 'practice') return <Navigate to="/praxis" replace />;
  return <>{children}</>;
}

/** Praxissicht: Halter-Konten kommen zurück in ihren Bereich. */
export function PracticeOnly({ children }: { children: ReactNode }) {
  const { me } = usePractice();
  if (!me) return <Loading />;
  if (me.kind !== 'practice') return <Navigate to="/" replace />;
  return <>{children}</>;
}
