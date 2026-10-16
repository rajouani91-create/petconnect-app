// Gemeinsame Bausteine der Unterseiten „Mehr zu {Tier}“: Tier aus der URL, Zurück-Link, Anzeige von Feldern.
import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { usePets } from '../../pets/PetsProvider';
import { isSpecies } from '../../lib/domain';
import { canEdit, type MemberRole } from '../../lib/sharing';
import type { PetRow } from '../../lib/supabase';
import { telHref } from '../../lib/care';
import { IconBack, IconPhone } from '../Icons';
import { SPECIES_LABEL } from '../SpeciesPicker';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Tierart (eigene Angabe bei „Anderes Tier“) */
export function speciesName(p: { species: string; species_other: string | null }, t: T): string {
  if (!isSpecies(p.species)) return p.species;
  return p.species === 'other' && p.species_other ? p.species_other : t(SPECIES_LABEL[p.species]);
}

/**
 * Rahmen einer Unterseite: lädt das Tier aus `:petId` (nur Tiere, die man betreut), setzt es aktiv,
 * zeigt „Zurück zur Tierakte“. Unbekanntes Tier → zur Tierseite.
 */
export function PetSubpage({ children }: { children: (pet: PetRow, role: MemberRole, editable: boolean) => ReactNode }) {
  const { petId } = useParams();
  const { pets, myRole, setActiveId } = usePets();
  const pet = pets.find((p) => p.id === petId);
  useEffect(() => {
    if (pet) setActiveId(pet.id);
  }, [pet, setActiveId]);
  if (!pet) return <Navigate to="/tier" replace />;
  const role = myRole(pet);
  return <>{children(pet, role, canEdit(role))}</>;
}

export function BackToRecord() {
  const { t } = useI18n();
  return (
    <Link to="/tier" className="link back-link no-print">
      <IconBack size={20} />
      {t('mBack')}
    </Link>
  );
}

/** Wert oder „Nichts eingetragen“ */
export function Val({ v, pre = false }: { v: string | null | undefined; pre?: boolean }) {
  const { t } = useI18n();
  const text = v?.trim();
  return text ? <span className={pre ? 'pre' : undefined}>{text}</span> : <span className="muted">{t('nothingSet')}</span>;
}

/** Telefonnummer als tel:-Link, sonst „Nichts eingetragen“ */
export function Phone({ v, label }: { v: string | null | undefined; label?: string }) {
  const { t } = useI18n();
  const text = v?.trim();
  if (!text) return <span className="muted">{t('nothingSet')}</span>;
  const href = telHref(text);
  return href ? (
    <a className="link tel-link" href={href} aria-label={label ? t('callX', { x: label }) : undefined}>
      <IconPhone size={18} />
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
}
