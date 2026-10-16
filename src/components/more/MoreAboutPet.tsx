import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import type { PetRow } from '../../lib/supabase';
import { IconEmergency } from '../Icons';

/** „Mehr zu {Tier}“: Notfallkarte, Versicherung, Betreuung, Gesundheitsakte und Sprung zum Gewicht */
export function MoreAboutPet({ pet }: { pet: PetRow }) {
  const { t } = useI18n();
  const base = `/tier/${encodeURIComponent(pet.id)}`;
  return (
    <section className="card stack" aria-labelledby="more-pet-h">
      <h2 id="more-pet-h">{t('moreTitle', { n: pet.name })}</h2>
      <ul className="more-grid">
        <li>
          <Link to={`${base}/notfallkarte`} className="btn btn-secondary more-btn">
            <IconEmergency size={20} />
            {t('mCard')}
          </Link>
        </li>
        <li><Link to={`${base}/versicherung`} className="btn btn-secondary more-btn">{t('mIns')}</Link></li>
        <li><Link to={`${base}/betreuung`} className="btn btn-secondary more-btn">{t('mSit')}</Link></li>
        <li><Link to={`${base}/gesundheitsakte`} className="btn btn-secondary more-btn">{t('mVault')}</Link></li>
        <li><Link to={{ hash: 'gewicht' }} className="btn btn-ghost more-btn">{t('wkOpen')}</Link></li>
      </ul>
    </section>
  );
}
