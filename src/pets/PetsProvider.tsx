import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listPets } from '../lib/api';
import type { PetRow } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

const ACTIVE_KEY = 'pc-active-pet';

interface PetsValue {
  loaded: boolean;
  error: boolean;
  pets: PetRow[];
  active: PetRow | null;
  setActiveId: (id: string) => void;
  reload: () => Promise<void>;
  /** Neues oder geändertes Tier in den Zustand übernehmen und aktiv setzen */
  upsertLocal: (pet: PetRow) => void;
}

const PetsContext = createContext<PetsValue | null>(null);

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function PetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [activeId, setActiveIdState] = useState<string | null>(readActive);

  const reload = useCallback(async () => {
    try {
      setPets(await listPets());
      setError(false);
    } catch (e) {
      console.error('Tiere konnten nicht geladen werden', e);
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  const uid = user?.id ?? null;
  useEffect(() => {
    setLoaded(false);
    setPets([]);
    if (uid) void reload();
  }, [uid, reload]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, []);

  const upsertLocal = useCallback(
    (pet: PetRow) => {
      setPets((prev) => (prev.some((p) => p.id === pet.id) ? prev.map((p) => (p.id === pet.id ? pet : p)) : [...prev, pet]));
      setActiveId(pet.id);
    },
    [setActiveId],
  );

  const active = pets.find((p) => p.id === activeId) ?? pets[0] ?? null;

  const value = useMemo<PetsValue>(
    () => ({ loaded, error, pets, active, setActiveId, reload, upsertLocal }),
    [loaded, error, pets, active, setActiveId, reload, upsertLocal],
  );
  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets(): PetsValue {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets muss innerhalb von <PetsProvider> verwendet werden.');
  return ctx;
}
