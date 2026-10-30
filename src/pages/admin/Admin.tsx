import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Loading } from '../../components/Loading';
import { Tickets } from './Tickets';
import { Announcements } from './Announcements';
import { Dashboard } from './Dashboard';
import { Team } from './Team';
import { useI18n } from '../../i18n/I18nProvider';
import {
  MAX_REASON,
  MIN_QUERY,
  isSearchable,
  reasonError,
  searchAccounts,
  sendResetLink,
  setAccountStatus,
  staffRoleFor,
  type AccountStatus,
  type SearchHit,
  type StaffRole,
} from '../../lib/staff';

/** Bereich für Support und Admin: Konto suchen, Status ansehen, sperren oder freigeben. */
export function Admin() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [role, setRole] = useState<StaffRole | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    staffRoleFor(user.id)
      .then((r) => {
        if (!alive) return;
        setRole(r);
      })
      .catch(() => alive && setRole(null));
    return () => {
      alive = false;
    };
  }, [user]);

  if (role === undefined) return <Loading />;
  // Ohne Rolle keine Fehlermeldung mit Details, nur Weiterleitung
  if (role === null) return <Navigate to="/" replace />;

  const statusLabel = (s: AccountStatus) => (s === 'locked' ? t('adminLocked') : t('adminActive'));

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setSelected(null);
    if (!isSearchable(query)) {
      setMessage(t('adminQueryShort', { n: MIN_QUERY }));
      setHits(null);
      return;
    }
    setBusy(true);
    try {
      setHits(await searchAccounts(query));
    } catch {
      setMessage(t('adminSearchFail'));
    } finally {
      setBusy(false);
    }
  }

  function choose(hit: SearchHit) {
    setSelected(hit);
    setReason('');
    setPending(null);
    setMessage('');
  }

  async function confirmChange() {
    if (!selected || !pending) return;
    const err = reasonError(reason);
    if (err) {
      setMessage(err === 'required' ? t('adminReasonRequired') : t('adminReasonTooLong', { max: MAX_REASON }));
      return;
    }
    setBusy(true);
    try {
      await setAccountStatus(selected.user_id, pending, reason);
      setSelected({ ...selected, status: pending });
      setHits((list) => list?.map((h) => (h.user_id === selected.user_id ? { ...h, status: pending } : h)) ?? null);
      setPending(null);
      setReason('');
      setMessage(pending === 'locked' ? t('adminLockedDone') : t('adminUnlockedDone'));
    } catch {
      setMessage(t('adminSaveFail'));
    } finally {
      setBusy(false);
    }
  }

  async function onResetLink() {
    if (!selected) return;
    setBusy(true);
    try {
      await sendResetLink(selected.user_id);
      setMessage(t('adminResetDone'));
    } catch {
      setMessage(t('adminResetFail'));
    } finally {
      setBusy(false);
    }
  }

  const canChangeStatus = role === 'admin';

  return (
    <main className="page" aria-labelledby="admin-title">
      <h1 id="admin-title">{t('adminTitle')}</h1>
      <p>{t('adminIntro')}</p>

      {role === 'admin' && (
        <p>
          <Link className="btn btn-secondary" to="/admin/agenten">Agenten ansehen</Link>
        </p>
      )}

      {role === 'admin' && <Dashboard />}

      <form onSubmit={onSearch} role="search">
        <label htmlFor="admin-query">{t('adminQueryLabel')}</label>
        <input id="admin-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        <button type="submit" disabled={busy}>
          {t('adminSearch')}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      {hits && hits.length === 0 && <p>{t('adminNoHits')}</p>}

      {hits && hits.length > 0 && (
        <ul aria-label={t('adminHits')}>
          {hits.map((h) => (
            <li key={h.user_id}>
              <button type="button" onClick={() => choose(h)}>
                {h.display_name ?? h.email} · {h.email} · {statusLabel(h.status)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <section aria-labelledby="admin-account">
          <h2 id="admin-account">{t('adminAccount')}</h2>
          <dl>
            <dt>{t('adminEmail')}</dt>
            <dd>{selected.email}</dd>
            <dt>{t('adminDisplayName')}</dt>
            <dd>{selected.display_name ?? '–'}</dd>
            <dt>{t('adminRegistered')}</dt>
            <dd>{new Date(selected.created_at).toLocaleDateString(lang)}</dd>
            <dt>{t('adminStatus')}</dt>
            <dd>{statusLabel(selected.status)}</dd>
            <dt>{t('adminPets')}</dt>
            <dd>{selected.pets.length === 0 ? '–' : selected.pets.map((p) => `${p.name} (${p.species})`).join(', ')}</dd>
          </dl>

          {canChangeStatus ? (
            pending === null ? (
              <button type="button" onClick={() => setPending(selected.status === 'locked' ? 'active' : 'locked')}>
                {selected.status === 'locked' ? t('adminUnlock') : t('adminLock')}
              </button>
            ) : (
              <div role="group" aria-label={t('adminConfirmGroup')}>
                <label htmlFor="admin-reason">{t('adminReasonLabel', { max: MAX_REASON })}</label>
                <textarea id="admin-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_REASON + 50} />
                <button type="button" onClick={confirmChange} disabled={busy}>
                  {pending === 'locked' ? t('adminConfirmLock') : t('adminConfirmUnlock')}
                </button>
                <button type="button" onClick={() => setPending(null)}>
                  {t('adminCancel')}
                </button>
              </div>
            )
          ) : (
            <p>{t('adminOnlyAdmin')}</p>
          )}
          <button type="button" onClick={onResetLink} disabled={busy}>
            {t('adminResetSend')}
          </button>
        </section>
      )}
      {user && <Tickets staffId={user.id} />}
      {user && role === 'admin' && <Announcements adminId={user.id} />}
      {user && role === 'admin' && <Team selfId={user.id} />}
    </main>
  );
}
