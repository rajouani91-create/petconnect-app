import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { FamilyCard } from '../../components/FamilyCard';
import { IconBack } from '../../components/Icons';

/** Mehr → Familie und Mitnutzer */
export function Family() {
  const { t } = useI18n();
  return (
    <div className="page stack-lg">
      <Link to="/mehr" className="back-link">
        <IconBack size={20} />
        {t('moreTitle')}
      </Link>
      <header className="page-head">
        <h1>{t('moreFamily')}</h1>
      </header>
      <FamilyCard />
    </div>
  );
}
