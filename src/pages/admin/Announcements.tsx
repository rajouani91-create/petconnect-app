import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
  ANNOUNCEMENT_MAX,
  adminAnnouncements,
  announcementError,
  createAnnouncement,
  deleteAnnouncement,
  type Announcement,
} from '../../lib/announcements';

/** Nur für Admins: Ankündigungen anlegen und löschen. */
export function Announcements({ adminId }: { adminId: string }) {
  const { t, lang } = useI18n();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [body, setBody] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    let alive = true;
    adminAnnouncements()
      .then((data) => alive && setList(data))
      .catch(() => alive && setMessage(t('annFail')));
    return () => {
      alive = false;
    };
  }, [version, t]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const err = announcementError({ body, start, end });
    if (err) {
      setMessage(err === 'required' ? t('annRequired') : err === 'order' ? t('annOrder') : t('annFail'));
      return;
    }
    try {
      await createAnnouncement({ body, start, end }, adminId);
      setBody('');
      setStart('');
      setEnd('');
      setMessage(t('annSaved'));
      setVersion((v) => v + 1);
    } catch {
      setMessage(t('annFail'));
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteAnnouncement(id);
      setMessage(t('annDeleted'));
      setVersion((v) => v + 1);
    } catch {
      setMessage(t('annFail'));
    }
  }

  return (
    <section aria-labelledby="ann-title">
      <h2 id="ann-title">{t('annTitle')}</h2>

      {message && <p role="status">{message}</p>}

      {list && list.length === 0 && <p>{t('annEmpty')}</p>}

      {list && list.length > 0 && (
        <ul>
          {list.map((a) => (
            <li key={a.id}>
              <p>{a.body}</p>
              <p>
                {new Date(a.starts_at).toLocaleString(lang)} – {new Date(a.ends_at).toLocaleString(lang)}
              </p>
              <button type="button" onClick={() => onDelete(a.id)}>
                {t('annDelete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onCreate} aria-labelledby="ann-create-title">
        <h3 id="ann-create-title">{t('annCreateTitle')}</h3>
        <label htmlFor="ann-body">{t('annBody')}</label>
        <textarea id="ann-body" value={body} maxLength={ANNOUNCEMENT_MAX} onChange={(e) => setBody(e.target.value)} />
        <label htmlFor="ann-start">{t('annStart')}</label>
        <input id="ann-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <label htmlFor="ann-end">{t('annEnd')}</label>
        <input id="ann-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="submit">{t('annCreate')}</button>
      </form>
    </section>
  );
}
