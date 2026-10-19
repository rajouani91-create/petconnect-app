// Gemeinsamer Stand der heutigen Gaben (Medikamente + abgehakte Gaben) für alle Ansichten:
// „Heute: Medikamente“, Übersicht, Tagesplan und Tierakte zeigen nach jeder Änderung sofort dasselbe.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { listDoses, listMedications, profileNames, type DoseRow, type MedicationRow } from '../../lib/api';
import { doseKey, dosesForDay, type PlannedDose } from '../../lib/medication';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import { usePetAccess } from './shared';

export interface DosesData {
  meds: MedicationRow[];
  doses: Map<string, DoseRow>;
  names: Map<string, string>;
}

interface Store {
  data: DosesData | null;
  setData: Dispatch<SetStateAction<DosesData | null>>;
  loadError: boolean;
  reload: () => Promise<DosesData | null>;
  /** Erst laden, wenn eine Ansicht die Gaben braucht */
  want: () => void;
}

const Ctx = createContext<Store | null>(null);

/** Heutige Gaben aller betreuten Tiere (Kalendertag in Europe/Berlin), mit abgehakten Gaben und Namen */
export function DosesProvider({ children }: { children: ReactNode }) {
  const { pets } = usePetAccess();
  const day = zonedNow(useNow()).date;
  const [data, setData] = useState<DosesData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [wanted, setWanted] = useState(false);
  const petKey = pets.map((p) => p.id).join(',');

  const reload = useCallback(async (): Promise<DosesData | null> => {
    const ids = petKey ? petKey.split(',') : [];
    try {
      const [meds, doses] = await Promise.all([listMedications(ids), listDoses(ids, day)]);
      const names = await profileNames(doses.map((d) => d.given_by)).catch(() => new Map<string, string>());
      const d: DosesData = { meds, doses: new Map(doses.map((x) => [doseKey(x.medication_id, x.scheduled_on, x.scheduled_time), x])), names };
      setData(d);
      setLoadError(false);
      return d;
    } catch (e) {
      console.error(e);
      setLoadError(true);
      return null;
    }
  }, [petKey, day]);

  useEffect(() => {
    if (wanted) void reload();
  }, [wanted, reload]);

  // Andere Betreuer haken auch ab: beim Zurückkehren ins Fenster still neu laden
  const latest = useRef({ reload, wanted });
  useEffect(() => {
    latest.current = { reload, wanted };
  }, [reload, wanted]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && latest.current.wanted) void latest.current.reload();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const want = useCallback(() => setWanted(true), []);
  const value = useMemo(() => ({ data, setData, loadError, reload, want }), [data, loadError, reload, want]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('DosesProvider fehlt');
  return s;
}

/** Heutige Gaben lesen (lädt beim ersten Gebrauch) */
export function useTodayDoses() {
  const s = useStore();
  const { names: petNames, editable } = usePetAccess();
  const now = useNow();
  const day = zonedNow(now).date;
  const { want } = s;
  useEffect(want, [want]);
  const planned: PlannedDose<MedicationRow>[] = useMemo(() => (s.data ? dosesForDay(s.data.meds, day, (id) => petNames.get(id) ?? '') : []), [s.data, day, petNames]);
  return { data: s.data, setData: s.setData, planned, day, now, loadError: s.loadError, reload: s.reload, petNames, editable };
}

/** Änderungen an Medikamenten (Tierakte, Tagesplan) sofort in alle Ansichten übernehmen */
export function useMedsSync() {
  const { setData } = useStore();
  return useMemo(
    () => ({
      put: (row: MedicationRow) =>
        setData((cur) => (cur ? { ...cur, meds: cur.meds.some((m) => m.id === row.id) ? cur.meds.map((m) => (m.id === row.id ? row : m)) : [...cur.meds, row] } : cur)),
      drop: (id: string) =>
        setData((cur) => (cur ? { ...cur, meds: cur.meds.filter((m) => m.id !== id), doses: new Map([...cur.doses].filter(([, d]) => d.medication_id !== id)) } : cur)),
    }),
    [setData],
  );
}
