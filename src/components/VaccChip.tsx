import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import type { VaccStatus } from '../lib/record';

const LABEL: Record<VaccStatus, MessageKey> = { valid: 'vcChipOk', soon: 'vcChipSoon', expired: 'vcChipExp' };
const TONE: Record<VaccStatus, string> = { valid: 'pill-ok', soon: 'pill-warn', expired: 'pill-crit' };

/** Kleiner Status zu den Impfungen; Farbe und Text zusammen (nicht nur Farbe). */
export function VaccChip({ status }: { status: VaccStatus | undefined }) {
  const { t } = useI18n();
  if (!status) return null;
  return <span className={`pill ${TONE[status]}`}>{t(LABEL[status])}</span>;
}
