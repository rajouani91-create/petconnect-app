import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { IconPeople } from './Icons';
import { PetAvatar } from './PetAvatar';

/** Tier-Umschalter, erscheint nur bei mehreren Tieren. */
export function PetSwitcher() {
  const { t } = useI18n();
  const { pets, active, setActiveId, memberCount } = usePets();
  if (pets.length < 2 || !active) return null;
  return (
    <div className="pet-switcher" role="group" aria-label={t('choosePet')}>
      {pets.map((p) => (
        <button key={p.id} type="button" className="chip" aria-pressed={p.id === active.id} onClick={() => setActiveId(p.id)}>
          <PetAvatar pet={p} size={28} iconSize={20} className="pet-photo-sm" />
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
