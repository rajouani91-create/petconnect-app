import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n';
import { timeOf, type PracticeAppointment } from '../lib/practiceAppointments';

/** Hinweis für die Praxis, wenn die Halter:in den Termin verschoben hat (alte Zeit, Notiz) – Release C */
export function OwnerChangeNote({ a, as: Tag = 'span' }: { a: Pick<PracticeAppointment, 'moved_from' | 'owner_note' | 'status'>; as?: 'span' | 'p' }) {
  const { t, lang } = useI18n();
  const open = a.status === 'new' || a.status === 'confirmed';
  if (!open || (!a.moved_from && !a.owner_note)) return null;
  const when = (iso: string) => `${formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(iso)}`;
  return (
    <Tag className="small owner-note pre-line">
      {a.moved_from && t('bkMovedByOwner', { d: when(a.moved_from) })}
      {a.moved_from && a.owner_note && ' '}
      {a.owner_note && `${t('bkOwnerMsg')}: ${a.owner_note}`}
    </Tag>
  );
}
