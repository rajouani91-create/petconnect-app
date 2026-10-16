import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { ApiError, acceptInvite, invitePreview } from '../lib/api';
import { ROLE_HINT, ROLE_LABEL, clearPendingInvite, inviteErrorKey, inviteStatusKey, isTokenShape, joinNames, type InvitePreview } from '../lib/sharing';
import { IconPaw } from '../components/Icons';
import { Loading } from '../components/Loading';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; preview: InvitePreview | null };

/** Einladung ansehen und annehmen. Erreichbar auch ohne eigenes Tier. Der Code wird nie protokolliert. */
export function Invite() {
  const { t } = useI18n();
  const { token } = useParams();
  const navigate = useNavigate();
  const { reload } = usePets();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<MessageKey | null>(null);

  useEffect(() => {
    // Gemerkte Einladung ist angekommen → Eintrag löschen.
    clearPendingInvite();
    if (!isTokenShape(token)) {
      setState({ kind: 'done', preview: null });
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    invitePreview(token)
      .then((preview) => alive && setState({ kind: 'done', preview }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, [token]);

  async function accept(preview: InvitePreview) {
    if (!isTokenShape(token)) return;
    setBusy(true);
    setAcceptError(null);
    try {
      const petIds = await acceptInvite(token);
      await reload(petIds[0]);
      navigate('/', { replace: true, state: { flash: t('invAccepted', { pet: joinNames(preview.pets.map((p) => p.name)) }) } });
    } catch (e) {
      setAcceptError(e instanceof ApiError ? inviteErrorKey(e.message) : 'errGeneric');
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('invTitle')}</h1>
      </header>
      {state.kind === 'loading' && <Loading />}
      {state.kind === 'error' && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {state.kind === 'done' && <Body preview={state.preview} busy={busy} acceptError={acceptError} onAccept={accept} />}
    </div>
  );
}

function Body({
  preview,
  busy,
  acceptError,
  onAccept,
}: {
  preview: InvitePreview | null;
  busy: boolean;
  acceptError: MessageKey | null;
  onAccept: (p: InvitePreview) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  // „empty“ (Tiere gelöscht) und unbekannte Werte gelten als ungültig
  const status = preview && preview.pets.length > 0 ? inviteStatusKey(preview.status) : 'invInvalid';
  const petNames = preview ? joinNames(preview.pets.map((p) => p.name)) : '';

  if (!preview || (status !== 'open' && status !== 'member')) {
    return (
      <section className="card stack">
        <p className="notice notice-warn" role="status">{t(status as MessageKey)}</p>
        <Link to="/" className="btn btn-secondary">{t('toHome')}</Link>
      </section>
    );
  }

  if (status === 'member') {
    return (
      <section className="card stack">
        <p role="status">{t('invMember', { pet: petNames })}</p>
        <Link to="/" className="btn btn-primary">{t('toHome')}</Link>
      </section>
    );
  }

  const inviter = preview.inviter_name?.trim() || t('invSomeone');
  const expires = preview.expires_at
    ? formatDate(new Date(preview.expires_at), lang, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <section className="card stack invite-card">
      <span className="placeholder-icon" aria-hidden="true">
        <IconPaw size={30} />
      </span>
      <p className="invite-text">{t('invText', { name: inviter, pet: petNames })}</p>
      <div className="role-summary">
        <p className="role-title">{t('invRoleIs', { r: t(ROLE_LABEL[preview.role]) })}</p>
        <p className="muted small">{t(ROLE_HINT[preview.role])}</p>
      </div>
      {expires && <p className="muted small">{t('invValidUntil', { d: expires })}</p>}
      {acceptError && <p className="notice notice-crit" role="alert">{t(acceptError)}</p>}
      <div className="actions actions-start">
        <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void onAccept(preview)}>
          {t('invAccept')}
        </button>
        <Link to="/" className="btn btn-ghost">{t('invDecline')}</Link>
      </div>
    </section>
  );
}
