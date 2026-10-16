import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { usePets } from '../../pets/PetsProvider';
import { Dialog } from '../Dialog';
import { IconEmergency } from '../Icons';
import { PetAvatar } from '../PetAvatar';

const cardUrl = (id: string) => `/tier/${encodeURIComponent(id)}/notfallkarte`;

/** Großer „Notfall“-Knopf auf der Übersicht → Notfallkarte; bei mehreren Tieren erst Tier wählen. */
export function EmergencyButton() {
  const { t } = useI18n();
  const { pets } = usePets();
  const navigate = useNavigate();
  const [choose, setChoose] = useState(false);
  if (pets.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-emergency btn-block emergency-big"
        onClick={() => (pets.length === 1 ? navigate(cardUrl(pets[0]!.id)) : setChoose(true))}
      >
        <IconEmergency size={22} />
        {t('sosBtn')}
      </button>
      <Dialog
        open={choose}
        title={t('sosChoose')}
        onClose={() => setChoose(false)}
        actions={<button type="button" className="btn btn-ghost" onClick={() => setChoose(false)}>{t('cancelBtn')}</button>}
      >
        <ul className="choose-list">
          {pets.map((p) => (
            <li key={p.id}>
              <Link to={cardUrl(p.id)} className="btn btn-secondary btn-block choose-pet" onClick={() => setChoose(false)}>
                <PetAvatar pet={p} size={28} iconSize={20} />
                {t('sosCardFor', { n: p.name })}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
