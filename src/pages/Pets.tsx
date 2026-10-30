import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { useVaccStatus } from '../hooks/useVaccStatus';
import { isSpecies } from '../lib/domain';
import { PetAvatar } from '../components/PetAvatar';
import { SPECIES_LABEL } from '../components/SpeciesPicker';
import { VaccChip } from '../components/VaccChip';
import { IconPeople, IconPlus } from '../components/Icons';

/** Meine Tiere: Karten mit Foto, Art, Rasse und Impfstatus; ein Tipp öffnet das Profil. */
export function Pets() {
  const { t } = useI18n();
  const { pets, setActiveId, memberCount } = usePets();
  const status = useVaccStatus(pets.map((p) => p.id));
  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('myPetsTitle')}</h1>
      </header>
      <ul className="pet-cards">
        {pets.map((p) => {
          const sp = isSpecies(p.species) ? (p.species === 'other' && p.species_other ? p.species_other : t(SPECIES_LABEL[p.species])) : p.species;
          return (
            <li key={p.id}>
              <Link to="/tier" className="card pet-card" onClick={() => setActiveId(p.id)}>
                <PetAvatar pet={p} size={72} iconSize={32} className="pet-card-photo" />
                <span className="pet-card-text">
                  <span className="pet-card-name">{p.name}</span>
                  <span className="muted">{[sp, p.breed].filter(Boolean).join(' · ')}</span>
                  <span className="pet-card-chips">
                    <VaccChip status={status.get(p.id)} />
                    {memberCount(p.id) > 1 && (
                      <span className="pill" role="img" aria-label={t('sharedPet')}>
                        <IconPeople size={16} />
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link to="/tier/neu" className="btn btn-secondary btn-block add-pet-link">
        <IconPlus size={20} />
        {t('addAnother')}
      </Link>
    </div>
  );
}
