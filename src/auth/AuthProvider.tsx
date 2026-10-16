import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getProfile } from '../lib/api';
import { supabase, type ProfileRow } from '../lib/supabase';
import { isLang } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';

interface AuthValue {
  /** false, solange die gespeicherte Sitzung noch geladen wird */
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  /** zuletzt eingetretenes Ereignis, z. B. PASSWORD_RECOVERY */
  lastEvent: AuthChangeEvent | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [lastEvent, setLastEvent] = useState<AuthChangeEvent | null>(null);

  useEffect(() => {
    // onAuthStateChange meldet sofort INITIAL_SESSION und danach jede Änderung.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLastEvent(event);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    try {
      const p = await getProfile(id);
      setProfile(p);
      if (p && isLang(p.language)) setLang(p.language);
    } catch (e) {
      console.error('Profil konnte nicht geladen werden', e);
    }
  }, [setLang]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    // Supabase empfiehlt, im Auth-Callback keine weiteren Abfragen zu starten – daher hier.
    void loadProfile(userId);
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ ready, session, user: session?.user ?? null, profile, lastEvent, refreshProfile, signOut }),
    [ready, session, profile, lastEvent, refreshProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}
