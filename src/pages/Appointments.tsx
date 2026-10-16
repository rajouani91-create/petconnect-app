import { useI18n } from '../i18n/I18nProvider';
import { IconCalendar } from '../components/Icons';

export function Appointments() {
  const { t } = useI18n();
  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('nav_termine')}</h1>
      </header>
      <section className="card placeholder">
        <span className="placeholder-icon">
          <IconCalendar size={32} />
        </span>
        <p>{t('apptsSoon')}</p>
      </section>
    </div>
  );
}
