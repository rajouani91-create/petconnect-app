import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { listMembers, type Member } from '../lib/api';
import { ROLE_LABEL } from '../lib/sharing';
import type { PetRow } from '../lib/supabase';

/** „Geteilt mit: Kyra · Mithalter:in, …“ und bei Mitbetreuenden die eigenen Rechte. Verwalten unter „Mehr“. */
export function PetSharedWith({ pet }: { pet: PetRow }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { myRole, memberships } = usePets();
  const [members, setMembers] = useState<Member[] | null>(null);
  const key = memberships.filter((m) => m.pet_id === pet.id).map((m) => `${m.user_id}:${m.role}`).sort().join(',');

  useEffect(() => {
    let alive = true;
    setMembers(null);
    listMembers(pet.id)
      .then((m) => alive && setMembers(m))
      .catch((e: unknown) => console.error(e));
    return () => {
      alive = false;
    };
    // key: nach Rechte-Änderung oder Entfernen neu laden
  }, [pet.id, key]);

  const role = myRole(pet);
  const name = (m: Member) => m.name.trim() || t('unknownPerson');
  const others = members?.filter((m) => m.userId !== user?.id && m.role !== 'owner') ?? [];
  const owner = members?.find((m) => m.role === 'owner');

  if (!members || (role === 'owner' && others.length === 0)) {
    return (
      <p className="shared-line">
        <Link to="/mehr#familie" className="link">{t('hhManage')}</Link>
      </p>
    );
  }

  return (
    <div className="shared-line stack">
      {role !== 'owner' && (
        <p>
          {t('hhMainOwner', { n: owner ? name(owner) : t('unknownPerson') })} · {t('hhYourRights', { r: t(ROLE_LABEL[role]) })}
        </p>
      )}
      {others.length > 0 && (
        <p>
          <span className="muted">{t('hhShared')}: </span>
          {others.map((m) => `${name(m)} · ${t(ROLE_LABEL[m.role])}`).join(', ')}
        </p>
      )}
      <p>
        <Link to="/mehr#familie" className="link">{t('hhManage')}</Link>
      </p>
    </div>
  );
}
