import { useI18n } from '../i18n/I18nProvider';

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{t('loading')}</span>
    </div>
  );
}
