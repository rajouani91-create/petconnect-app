import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { ApiError, acceptInvite, invitePreview, type InvitePreview } from '../lib/api';
import { isSpecies } from '../lib/domain';
import { clearPendingInvite, inviteErrorKey, inviteStatusKey, isTokenShape } from '../lib/sharing';
import { IconPaw } from '../components/Icons';
import { Loading } from '../components/Loading';
import { SPECIES_LABEL } from '../components/SpeciesPicker';

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
      const petId = await acceptInvite(token);
      await reload(petId);
      navigate('/', { replace: true, state: { flash: t('invAccepted', { pet: preview.pet_name }) } });
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
  const { t } = useI18n();
  const status = inviteStatusKey(preview?.status);

  if (!preview || (status !== 'open' && status !== 'member')) {
    return (
      <section className="card stack" aria-live="polite">
        <p className="notice notice-warn" role="status">{t(preview ? (status as MessageKey) : 'invInvalid')}</p>
        <Link to="/" className="btn btn-secondary">{t('toHome')}</Link>
      </section>
    );
  }

  if (status === 'member') {
    return (
      <section className="card stack">
        <p role="status">{t('invMember', { pet: preview.pet_name })}</p>
        <Link to="/" className="btn btn-primary">{t('toHome')}</Link>
      </section>
    );
  }

  const species = isSpecies(preview.species)
    ? preview.species === 'other' && preview.species_other
      ? preview.species_other
      : t(SPECIES_LABEL[preview.species])
    : preview.species;
  const inviter = preview.inviter_name?.trim() || t('invSomeone');

  return (
    <section className="card stack invite-card">
      <span className="placeholder-icon" aria-hidden="true">
        <IconPaw size={30} />
      </span>
      <p className="invite-text">{t('invText', { name: inviter, pet: preview.pet_name, species })}</p>
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
