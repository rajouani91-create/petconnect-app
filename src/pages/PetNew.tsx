import { useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { createPetWithTemplate } from '../lib/api';
import { templateFor } from '../lib/templates';
import { emptyPetForm } from '../lib/validate';
import { PetForm } from '../components/PetForm';

/** Erstes oder weiteres Tier anlegen, optional mit Tagesplan-Vorlage. */
export function PetNew() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pets, upsertLocal } = usePets();
  const first = pets.length === 0;

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{first ? t('petNewTitle') : t('addAnother')}</h1>
        <p className="muted">{t('petNewSub')}</p>
      </header>
      {first && <p className="notice notice-info">{t('petNewInvite')}</p>}
      <PetForm
        initial={emptyPetForm()}
        withTemplate
        submitLabel={t('savePet')}
        onCancel={first ? undefined : () => navigate('/tier')}
        onSubmit={async (values, useTemplate) => {
          const pet = await createPetWithTemplate(values, useTemplate ? templateFor(values.species) : []);
          upsertLocal(pet);
          navigate('/', { replace: true });
        }}
      />
    </div>
  );
}
