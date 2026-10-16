// Gemeinsame Bausteine für Termine und Erinnerungen: Tier-Filter, lokales „heute“, Rechte je Tier.
import { useId, useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePets } from '../../pets/PetsProvider';
import { canEdit } from '../../lib/sharing';
import { localDate } from '../../lib/schedule';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';

/** „heute“ nach der Uhr des Geräts (YYYY-MM-DD), aktualisiert sich zum Minutenwechsel */
export function useLocalToday(): string {
  return localDate(useNow());
}

/** Tiere, Namen, Schreibrecht je Tier */
export function usePetAccess() {
  const { pets, myRole } = usePets();
  return useMemo(() => {
    const names = new Map(pets.map((p) => [p.id, p.name]));
    const editable = new Set(pets.filter((p) => canEdit(myRole(p))).map((p) => p.id));
    return { pets, names, editable, editablePets: pets.filter((p) => editable.has(p.id)) };
  }, [pets, myRole]);
}

export const ALL_PETS = 'all';

/** Auswahl „Alle Tiere“ / einzelnes Tier; erscheint nur bei mehr als einem Tier */
export function PetFilter({ pets, value, onChange }: { pets: PetRow[]; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const uid = useId();
  if (pets.length < 2) return null;
  return (
    <div className="field pet-filter">
      <label htmlFor={`${uid}-pf`}>{t('schedFilter')}</label>
      <select id={`${uid}-pf`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL_PETS}>{t('schedAllPets')}</option>
        {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

/** Tier-Auswahl im Formular (nur Tiere mit Schreibrecht) */
export function PetSelect({ pets, value, onChange, disabled, a }: {
  pets: readonly { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  a: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined; 'aria-required'?: boolean };
}) {
  const { t } = useI18n();
  return (
    <select {...a} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {pets.length > 1 && !value && <option value="">{t('schedPickPet')}</option>}
      {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
