import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listMemberships, listPets } from '../lib/api';
import type { PetRow } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

const ACTIVE_KEY = 'pc-active-pet';

interface PetsValue {
  loaded: boolean;
  error: boolean;
  pets: PetRow[];
  active: PetRow | null;
  /** Anzahl der Betreuer je Tier (mindestens 1 = nur der Besitzer) */
  memberCount: (petId: string) => number;
  /** Bin ich Besitzer dieses Tieres? */
  isOwner: (pet: PetRow) => boolean;
  setActiveId: (id: string) => void;
  /** Tiere neu laden; `activateId` danach aktiv setzen */
  reload: (activateId?: string) => Promise<void>;
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
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [activeId, setActiveIdState] = useState<string | null>(readActive);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, []);

  const reload = useCallback(
    async (activateId?: string) => {
      try {
        const list = await listPets();
        setPets(list);
        setError(false);
        if (activateId) setActiveId(activateId);
        try {
          const rows = await listMemberships(list.map((p) => p.id));
          const next: Record<string, number> = {};
          for (const r of rows) next[r.pet_id] = (next[r.pet_id] ?? 0) + 1;
          setCounts(next);
        } catch (e) {
          // Ohne Betreuer-Zahlen läuft die App weiter, nur ohne „gemeinsam“-Hinweise.
          console.error('Betreuer konnten nicht geladen werden', e);
        }
      } catch (e) {
        console.error('Tiere konnten nicht geladen werden', e);
        setError(true);
      } finally {
        setLoaded(true);
      }
    },
    [setActiveId],
  );

  const uid = user?.id ?? null;
  useEffect(() => {
    setLoaded(false);
    setPets([]);
    setCounts({});
    if (uid) void reload();
  }, [uid, reload]);

  const upsertLocal = useCallback(
    (pet: PetRow) => {
      setPets((prev) => (prev.some((p) => p.id === pet.id) ? prev.map((p) => (p.id === pet.id ? pet : p)) : [...prev, pet]));
      setActiveId(pet.id);
    },
    [setActiveId],
  );

  const memberCount = useCallback((petId: string) => counts[petId] ?? 1, [counts]);
  const isOwner = useCallback((pet: PetRow) => pet.owner_id === uid, [uid]);

  const active = pets.find((p) => p.id === activeId) ?? pets[0] ?? null;

  const value = useMemo<PetsValue>(
    () => ({ loaded, error, pets, active, memberCount, isOwner, setActiveId, reload, upsertLocal }),
    [loaded, error, pets, active, memberCount, isOwner, setActiveId, reload, upsertLocal],
  );
  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets(): PetsValue {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets muss innerhalb von <PetsProvider> verwendet werden.');
  return ctx;
}
