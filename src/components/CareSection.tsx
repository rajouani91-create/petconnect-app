import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { createInvite, deletePet, listMembers, listOpenInvites, removeMember, revokeInvite, type Member, type OpenInvite } from '../lib/api';
import { inviteLink } from '../lib/sharing';
import type { PetRow } from '../lib/supabase';
import { Dialog } from './Dialog';
import { IconCopy, IconPlus, IconShare } from './Icons';
import { Loading } from './Loading';

/** Abschnitt „Betreuung“ auf der Tier-Seite: Betreuer, Einladungen, Betreuung beenden, Tier löschen. */
export function CareSection({ pet }: { pet: PetRow }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { isOwner, reload } = usePets();
  const navigate = useNavigate();
  const owner = isOwner(pet);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<OpenInvite[]>([]);
  const [error, setError] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatusState] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });
  const setStatus = (text: string, ok = true) => setStatusState({ text, ok });
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await listMembers(pet.id));
      setInvites(owner ? await listOpenInvites(pet.id) : []);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }, [pet.id, owner]);

  useEffect(() => {
    setMembers(null);
    setLink(null);
    setStatus('');
    void load();
  }, [load]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const until = (iso: string) =>
    formatDate(new Date(iso), lang, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const nameOf = (m: Member) => m.name.trim() || t('unknownPerson');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  const invite = () =>
    run(async () => {
      const { token } = await createInvite(pet.id);
      setLink(inviteLink(window.location.origin, token));
      setInvites(await listOpenInvites(pet.id));
      setStatus(t('invCreated'));
    });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setStatus(t('invCopied'));
    } catch {
      setStatus(t('invCopyFail'), false);
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: 'PetConnect', text: t('invShareText', { pet: pet.name }), url: link });
    } catch (e) {
      // Abbrechen im Teilen-Menü ist kein Fehler.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus(t('errGeneric'), false);
    }
  }

  const revoke = (inv: OpenInvite) =>
    run(async () => {
      await revokeInvite(inv.id);
      setInvites((cur) => cur.filter((i) => i.id !== inv.id));
      setLink(null);
      setStatus(t('invRevoked'));
    });

  const remove = (m: Member) =>
    run(async () => {
      setToRemove(null);
      await removeMember(pet.id, m.userId);
      setMembers((cur) => cur?.filter((x) => x.userId !== m.userId) ?? cur);
      setStatus(t('memberRemoved', { name: nameOf(m), pet: pet.name }));
      await reload();
    });

  const leave = () =>
    run(async () => {
      if (!user) return;
      setConfirmLeave(false);
      await removeMember(pet.id, user.id);
      await reload();
      navigate('/', { replace: true, state: { flash: t('careLeft', { pet: pet.name }) } });
    });

  const removePet = () =>
    run(async () => {
      setConfirmDelete(false);
      await deletePet(pet.id);
      await reload();
      navigate('/', { replace: true, state: { flash: t('petDeleted', { pet: pet.name }) } });
    });

  return (
    <>
      <section className="card stack" aria-labelledby="care-h">
        <h2 id="care-h">{t('careH')}</h2>
        {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
        {!members && !error && <Loading />}
        {members && (
          <ul className="member-list">
            {members.map((m) => {
              const me = m.userId === user?.id;
              return (
                <li key={m.userId} className="member-row">
                  <div className="member-text">
                    <span className="member-name">
                      {nameOf(m)}
                      {me && <span className="muted"> {t('youMark')}</span>}
                    </span>
                    <span className="muted small">{t(m.role === 'owner' ? 'roleOwner' : 'roleCarer')}</span>
                  </div>
                  {owner && m.role === 'carer' && !me && (
                    <button type="button" className="btn btn-ghost" aria-label={t('memberRemoveL', { name: nameOf(m) })} onClick={() => setToRemove(m)} disabled={busy}>
                      {t('memberRemove')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {owner && (
          <div className="stack invite-box">
            <button type="button" className="btn btn-primary" onClick={() => void invite()} disabled={busy} aria-busy={busy}>
              <IconPlus size={20} />
              {t('invCreate')}
            </button>
            {link && (
              <div className="stack">
                <p className="label">{t('invLinkL')}</p>
                <p className="invite-url mono">{link}</p>
                <div className="actions actions-start">
                  {canShare && (
                    <button type="button" className="btn btn-secondary" onClick={() => void share()}>
                      <IconShare size={20} />
                      {t('invShare')}
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
                    <IconCopy size={20} />
                    {t('invCopy')}
                  </button>
                </div>
              </div>
            )}
            <p className="muted small">{t('invHint')}</p>

            {invites.length > 0 && (
              <div className="stack">
                <h3>{t('invOpenH')}</h3>
                <ul className="member-list">
                  {invites.map((inv) => (
                    <li key={inv.id} className="member-row">
                      <span className="member-text">{t('invValidUntil', { d: until(inv.expires_at) })}</span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={t('invRevokeL', { d: until(inv.expires_at) })}
                        onClick={() => void revoke(inv)}
                        disabled={busy}
                      >
                        {t('invRevoke')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!owner && (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmLeave(true)} disabled={busy}>
            {t('careLeave')}
          </button>
        )}
        <p className={status.text ? `notice ${status.ok ? 'notice-ok' : 'notice-crit'}` : 'sr-only'} role="status" aria-live="polite">
          {status.text}
        </p>
      </section>

      {owner && (
        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            {t('petDelete')}
          </button>
        </div>
      )}

      <Dialog
        open={toRemove !== null}
        title={t('memberRemoveTitle')}
        onClose={() => setToRemove(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToRemove(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => toRemove && void remove(toRemove)}>{t('memberRemove')}</button>
          </>
        }
      >
        {toRemove && <p>{t('memberRemoveAsk', { name: nameOf(toRemove), pet: pet.name })}</p>}
      </Dialog>

      <Dialog
        open={confirmLeave}
        title={t('careLeaveTitle')}
        onClose={() => setConfirmLeave(false)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => void leave()}>{t('careLeave')}</button>
          </>
        }
      >
        <p>{t('careLeaveAsk', { pet: pet.name })}</p>
      </Dialog>

      <Dialog
        open={confirmDelete}
        title={t('petDeleteTitle', { pet: pet.name })}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => void removePet()}>{t('petDeleteYes')}</button>
          </>
        }
      >
        <p>{t('petDeleteAsk', { pet: pet.name })}</p>
      </Dialog>
    </>
  );
}
