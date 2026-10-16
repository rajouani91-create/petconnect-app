import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { updatePet } from '../lib/api';
import { isSpecies } from '../lib/domain';
import { petToForm } from '../lib/validate';
import type { PetRow } from '../lib/supabase';
import { PetForm } from '../components/PetForm';
import { PetSwitcher } from '../components/PetSwitcher';
import { CareSection } from '../components/CareSection';
import { IconPlus, SpeciesIcon } from '../components/Icons';
import { SPECIES_LABEL } from '../components/SpeciesPicker';

/** Stammdaten ansehen und bearbeiten, weiteres Tier anlegen, Betreuung verwalten. */
export function Pet() {
  const { t } = useI18n();
  const { active, upsertLocal } = usePets();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');

  if (!active) return null;

  return (
    <div className="page stack-lg">
      <header className="page-head page-head-row">
        <div className="pet-ava" aria-hidden="true">
          <SpeciesIcon species={isSpecies(active.species) ? active.species : 'other'} size={34} />
        </div>
        <div>
          <h1>{active.name}</h1>
          <p className="muted">{speciesText(active, t)}</p>
        </div>
      </header>

      <PetSwitcher />

      {editing ? (
        <PetForm
          key={active.id}
          initial={petToForm(active)}
          withTemplate={false}
          submitLabel={t('saveBtn')}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const pet = await updatePet(active.id, values);
            upsertLocal(pet);
            setEditing(false);
            setStatus(t('savedShort'));
          }}
        />
      ) : (
        <>
          <PetDetails pet={active} />
          <div className="actions actions-start">
            <button type="button" className="btn btn-primary" onClick={() => { setEditing(true); setStatus(''); }}>
              {t('editBtn')}
            </button>
            <Link to="/tier/neu" className="btn btn-secondary">
              <IconPlus size={20} />
              {t('addAnother')}
            </Link>
          </div>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">{status}</p>

      <CareSection key={active.id} pet={active} />
    </div>
  );
}

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function speciesText(p: PetRow, t: T): string {
  const sp = isSpecies(p.species) ? (p.species === 'other' && p.species_other ? p.species_other : t(SPECIES_LABEL[p.species])) : p.species;
  return [sp, p.breed].filter(Boolean).join(' · ');
}

function PetDetails({ pet }: { pet: PetRow }) {
  const { t, lang } = useI18n();
  const dash = <span className="muted">{t('notSet')}</span>;
  const val = (v: string | null | undefined) => (v && v.trim() ? v : dash);
  const sex = pet.sex === 'female' ? t('sexF') : pet.sex === 'male' ? t('sexM') : null;

  return (
    <>
      <section className="card" aria-labelledby="master-h">
        <h2 id="master-h">{t('masterH')}</h2>
        <dl className="kv">
          <dt>{t('nav_pet')}</dt>
          <dd>{speciesText(pet, t) || dash}</dd>
          {pet.species === 'cat' && (
            <>
              <dt>{t('keeping')}</dt>
              <dd>{pet.cat_outdoor === null ? dash : t(pet.cat_outdoor ? 'spCatOut' : 'spCatIn')}</dd>
            </>
          )}
          {pet.species === 'horse' && (
            <>
              <dt>{t('stable')}</dt>
              <dd>{val(pet.stable)}</dd>
            </>
          )}
          <dt>{t('sex')}</dt>
          <dd>{sex ?? dash}</dd>
          <dt>{t('birth')}</dt>
          <dd>{pet.birth_date ? formatIsoDate(pet.birth_date, lang) : dash}</dd>
          <dt>{t('chip')}</dt>
          <dd className="mono">{val(pet.chip_no)}</dd>
        </dl>
      </section>
      <section className="card" aria-labelledby="health-h">
        <h2 id="health-h">{t('healthH')}</h2>
        <dl className="kv">
          <dt>{t('allergies')}</dt>
          <dd>{val(pet.allergies)}</dd>
          <dt>{t('medications')}</dt>
          <dd>{val(pet.medications)}</dd>
          <dt>{t('emergencyContact')}</dt>
          <dd className="pre">{val(pet.emergency_contact)}</dd>
        </dl>
      </section>
    </>
  );
}
