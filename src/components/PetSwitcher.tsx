import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { isSpecies } from '../lib/domain';
import { IconPeople, SpeciesIcon } from './Icons';

/** Tier-Umschalter, erscheint nur bei mehreren Tieren. */
export function PetSwitcher() {
  const { t } = useI18n();
  const { pets, active, setActiveId, memberCount } = usePets();
  if (pets.length < 2 || !active) return null;
  return (
    <div className="pet-switcher" role="group" aria-label={t('choosePet')}>
      {pets.map((p) => (
        <button key={p.id} type="button" className="chip" aria-pressed={p.id === active.id} onClick={() => setActiveId(p.id)}>
          <SpeciesIcon species={isSpecies(p.species) ? p.species : 'other'} size={20} />
          <span>{p.name}</span>
          {memberCount(p.id) > 1 && (
            <span className="chip-shared" role="img" aria-label={t('sharedPet')}>
              <IconPeople size={18} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
