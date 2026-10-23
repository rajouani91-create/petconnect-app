import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { activeAnnouncements, dismissAnnouncement, type Announcement } from '../lib/announcements';

/** Oben in der App: die erste laufende Ankündigung, die dieser Nutzer noch nicht geschlossen hat. */
export function AnnouncementBanner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    activeAnnouncements(user.id)
      .then((list) => alive && setItems(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user]);

  const first = items[0];
  if (!first || !user) return null;

  function close(id: string, userId: string) {
    setItems((list) => list.filter((a) => a.id !== id));
    dismissAnnouncement(id, userId).catch(() => undefined);
  }

  return (
    <aside className="announcement" aria-label={t('annTitle')}>
      <p>{first.body}</p>
      <button type="button" onClick={() => close(first.id, user.id)}>
        {t('annBannerClose')}
      </button>
    </aside>
  );
}
