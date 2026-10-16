import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { ApiError, createInvite, listOpenInvites, profileNames, removeMember, revokeInvite, setMemberRole, type OpenInvite } from '../lib/api';
import {
  INVITEE_NAME_MAX,
  MAX_PEOPLE,
  ROLE_LABEL,
  groupPeople,
  inviteErrorKey,
  inviteLink,
  joinNames,
  type GrantRole,
  type Person,
} from '../lib/sharing';
import type { PetRow } from '../lib/supabase';
import type { FieldError } from '../lib/validate';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { IconCopy, IconPlus, IconShare } from './Icons';
import { Loading } from './Loading';
import { PetAvatar } from './PetAvatar';
import { RoleChoice } from './RoleChoice';

type Status = { text: string; ok: boolean };

/** Karte „Familie & Mithalter:innen“ unter „Mehr“: Personen, Einladungen, Rechte, geteilte Tiere. */
export function FamilyCard() {
  const { t, lang } = useI18n();
  const { user, profile } = useAuth();
  const { pets, memberships, isOwner, myRole, reload } = usePets();
  const uid = user?.id ?? '';

  const myPets = useMemo(() => pets.filter((p) => isOwner(p)), [pets, isOwner]);
  const sharedWithMe = useMemo(() => pets.filter((p) => !isOwner(p)), [pets, isOwner]);

  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [invites, setInvites] = useState<OpenInvite[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatusState] = useState<Status>({ text: '', ok: true });
  const setStatus = (text: string, ok = true) => setStatusState({ text, ok });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ link: string; petNames: string } | null>(null);
  const [toRemove, setToRemove] = useState<Person | null>(null);
  const [toChange, setToChange] = useState<Person | null>(null);
  const [newRole, setNewRole] = useState<GrantRole>('carer');
  const [toLeave, setToLeave] = useState<PetRow | null>(null);

  // Namen aller Personen, mit denen ich Tiere teile (eine Abfrage)
  const userIds = useMemo(
    () => [...new Set([...memberships.map((m) => m.user_id), ...sharedWithMe.map((p) => p.owner_id)])].sort().join(','),
    [memberships, sharedWithMe],
  );
  useEffect(() => {
    if (!userIds) return;
    let alive = true;
    profileNames(userIds.split(','))
      .then((n) => alive && setNames(n))
      .catch((e: unknown) => console.error(e));
    return () => {
      alive = false;
    };
  }, [userIds]);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await listOpenInvites());
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
      setInvites([]);
    }
  }, []);
  const hasOwn = myPets.length > 0;
  useEffect(() => {
    if (hasOwn) void loadInvites();
    else setInvites([]);
  }, [hasOwn, loadInvites]);

  const people = useMemo(() => groupPeople(memberships, uid, myPets, names), [memberships, uid, myPets, names]);
  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? '';
  const until = (iso: string) => formatDate(new Date(iso), lang, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const personName = (p: Person) => p.name || t('unknownPerson');
  const myName = profile?.display_name?.trim() || t('invSomeone');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : e);
      setStatus(t(e instanceof ApiError ? inviteErrorKey(e.message) : 'errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  const shareText = (petNames: string) => t('hhShareText', { me: myName, pets: petNames });

  async function share(link: string, petNames: string) {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'PetConnect', text: shareText(petNames), url: link });
      } catch (e) {
        // Abbrechen im Teilen-Menü ist kein Fehler.
        if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus(t('errGeneric'), false);
      }
    } else {
      await copy(link);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setStatus(t('invCopied'));
    } catch {
      setStatus(t('invCopyFail'), false);
    }
  }

  const revoke = (inv: OpenInvite) =>
    run(async () => {
      await revokeInvite(inv.id);
      setInvites((cur) => cur?.filter((i) => i.id !== inv.id) ?? cur);
      setCreated(null);
      setStatus(t('invRevoked'));
    });

  const remove = (p: Person) =>
    run(async () => {
      setToRemove(null);
      await removeMember(p.pets.map((x) => x.petId), p.userId);
      await reload();
      setStatus(t('hhRemoved', { n: personName(p) }));
    });

  const changeRole = (p: Person, role: GrantRole) =>
    run(async () => {
      setToChange(null);
      await setMemberRole(p.pets.map((x) => x.petId), p.userId, role);
      await reload();
      setStatus(t('hhRoleChanged', { n: personName(p), r: t(ROLE_LABEL[role]) }));
    });

  const leave = (pet: PetRow) =>
    run(async () => {
      setToLeave(null);
      await removeMember([pet.id], uid);
      await reload();
      setStatus(t('careLeft', { pet: pet.name }));
    });

  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="card stack" aria-labelledby="hh-h" id="familie">
      <div>
        <h2 id="hh-h">{t('hhTitle')}</h2>
        <p className="muted">{t('hhSub')}</p>
      </div>

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}

      {hasOwn && (
        <ul className="member-list" aria-label={t('hhPeopleL')}>
          <li className="member-row">
            <div className="member-text">
              <span className="member-name">{t('hhMe')}</span>
              <span className="muted small">{joinNames(myPets.map((p) => p.name))}</span>
            </div>
          </li>
          {people.map((p) => (
            <li key={p.userId} className="member-row">
              <div className="member-text">
                <span className="member-name">{personName(p)}</span>
                <span className="muted small">
                  {p.role
                    ? `${t(ROLE_LABEL[p.role])} · ${joinNames(p.pets.map((x) => x.name))}`
                    : p.pets.map((x) => `${x.name}: ${t(ROLE_LABEL[x.role])}`).join(' · ')}
                </span>
                <span><span className="pill pill-ok">{t('hhActive')}</span></span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={t('hhChangeL', { n: personName(p) })}
                  disabled={busy}
                  onClick={() => {
                    setNewRole(p.role ?? 'carer');
                    setToChange(p);
                  }}
                >
                  {t('hhChange')}
                </button>
                <button type="button" className="btn btn-ghost" aria-label={t('memberRemoveL', { name: personName(p) })} disabled={busy} onClick={() => setToRemove(p)}>
                  {t('memberRemove')}
                </button>
              </div>
            </li>
          ))}
          {invites?.map((inv) => {
            const pn = joinNames(inv.petIds.map(petName).filter(Boolean));
            return (
              <li key={inv.id} className="member-row">
                <div className="member-text">
                  <span className="member-name">{inv.invitee_name}</span>
                  <span className="muted small">{`${t(ROLE_LABEL[inv.role])} · ${pn}`}</span>
                  <span><span className="pill">{t('hhPendingUntil', { d: until(inv.expires_at) })}</span></span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={t('hhShareL', { n: inv.invitee_name })}
                    onClick={() => void share(inviteLink(window.location.origin, inv.token), pn)}
                  >
                    <IconShare size={18} />
                    {shareSupported ? t('invShare') : t('invCopy')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={t('hhRevokeL', { n: inv.invitee_name })}
                    disabled={busy}
                    onClick={() => void revoke(inv)}
                  >
                    {t('invRevoke')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasOwn && invites === null && <Loading />}

      {hasOwn && invites !== null && (
        <InviteForm
          myPets={myPets}
          used={people.length + invites.length}
          openNames={invites.map((i) => i.invitee_name)}
          onCreate={async (name, role, petIds) => {
            const { token } = await createInvite(name, role, petIds);
            const petNames = joinNames(petIds.map(petName));
            setCreated({ link: inviteLink(window.location.origin, token), petNames });
            await loadInvites();
            setStatus(t('hhCreated', { n: name }));
          }}
        />
      )}

      {created && (
        <div className="stack invite-box">
          <p className="label">{t('invLinkL')}</p>
          <p className="invite-url mono">{created.link}</p>
          <div className="actions actions-start">
            {shareSupported && (
              <button type="button" className="btn btn-secondary" onClick={() => void share(created.link, created.petNames)}>
                <IconShare size={20} />
                {t('invShare')}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => void copy(created.link)}>
              <IconCopy size={20} />
              {t('invCopy')}
            </button>
          </div>
          <p className="muted small">{t('invHint')}</p>
        </div>
      )}

      {sharedWithMe.length > 0 && (
        <div className="stack invite-box">
          <h3>{t('hhSharedWithMe')}</h3>
          <ul className="member-list">
            {sharedWithMe.map((pet) => (
              <li key={pet.id} className="member-row">
                <span className="pet-ava-sm" aria-hidden="true">
                  <PetAvatar pet={pet} size={40} iconSize={22} />
                </span>
                <div className="member-text">
                  <span className="member-name">{pet.name}</span>
                  <span className="muted small">
                    {t('hhFrom', { n: names.get(pet.owner_id)?.trim() || t('unknownPerson') })} · {t(ROLE_LABEL[myRole(pet)])}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost" aria-label={t('hhLeaveL', { pet: pet.name })} disabled={busy} onClick={() => setToLeave(pet)}>
                  {t('careLeave')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={status.text ? `notice ${status.ok ? 'notice-ok' : 'notice-crit'}` : 'sr-only'} role="status" aria-live="polite">
        {status.text}
      </p>

      <Dialog
        open={toRemove !== null}
        title={t('memberRemoveTitle')}
        onClose={() => setToRemove(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToRemove(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => toRemove && void remove(toRemove)}>{t('hhRemoveYes')}</button>
          </>
        }
      >
        {toRemove && <p>{t('hhRemoveAsk', { n: personName(toRemove) })}</p>}
      </Dialog>

      <Dialog
        open={toChange !== null}
        title={toChange ? t('hhChangeTitle', { n: personName(toChange) }) : ''}
        onClose={() => setToChange(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToChange(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-primary" onClick={() => toChange && void changeRole(toChange, newRole)}>{t('saveBtn')}</button>
          </>
        }
      >
        {toChange && (
          <div className="stack">
            <RoleChoice name="hh-change-role" legend={t('hhRole')} value={newRole} onChange={setNewRole} />
            <p className="muted small">{t('hhChangeAll', { pets: joinNames(toChange.pets.map((x) => x.name)) })}</p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={toLeave !== null}
        title={t('careLeaveTitle')}
        onClose={() => setToLeave(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToLeave(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => toLeave && void leave(toLeave)}>{t('careLeave')}</button>
          </>
        }
      >
        {toLeave && <p>{t('careLeaveAsk', { pet: toLeave.name })}</p>}
      </Dialog>
    </section>
  );
}

function InviteForm({
  myPets,
  used,
  openNames,
  onCreate,
}: {
  myPets: PetRow[];
  /** Personen + offene Einladungen */
  used: number;
  openNames: string[];
  onCreate: (name: string, role: GrantRole, petIds: string[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [name, setName] = useState('');
  const [role, setRole] = useState<GrantRole>('carer');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(myPets.map((p) => p.id)));
  const [nameError, setNameError] = useState<FieldError | undefined>();
  const [petsError, setPetsError] = useState<MessageKey | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const petsRef = useRef<HTMLDivElement>(null);

  // Neue eigene Tiere vorauswählen, gelöschte entfernen
  const petKey = myPets.map((p) => p.id).join(',');
  useEffect(() => {
    setSelected(new Set(petKey.split(',').filter(Boolean)));
  }, [petKey]);

  function toggle(id: string) {
    setSelected((cur) => {
      const s = new Set(cur);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
    setPetsError(null);
  }

  function showError(key: MessageKey) {
    if (key === 'hhErrName' || key === 'hhErrDup') {
      setNameError({ key });
      nameRef.current?.focus();
    } else if (key === 'hhErrPets') {
      setPetsError(key);
      petsRef.current?.querySelector('button')?.focus();
    } else {
      setFormError(key);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNameError(undefined);
    setPetsError(null);
    setFormError(null);
    const n = name.trim();
    const petIds = myPets.map((p) => p.id).filter((id) => selected.has(id));
    if (!n) return showError('hhErrName');
    if (petIds.length === 0) return showError('hhErrPets');
    if (openNames.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return showError('hhErrDup');
    if (used >= MAX_PEOPLE) return showError('hhErrMax');
    setBusy(true);
    try {
      await onCreate(n, role, petIds);
      setName('');
      setRole('carer');
    } catch (err) {
      if (!(err instanceof ApiError)) console.error(err);
      showError(err instanceof ApiError ? inviteErrorKey(err.message) : 'errGeneric');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{t('invCreate')}</h3>
      <Field id={`${uid}-name`} label={t('hhName')} error={nameError} required>
        {(a) => (
          <input
            {...a}
            ref={nameRef}
            type="text"
            autoComplete="off"
            maxLength={INVITEE_NAME_MAX}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(undefined);
            }}
          />
        )}
      </Field>
      <RoleChoice name={`${uid}-role`} legend={t('hhRole')} value={role} onChange={setRole} />
      <div className={`field${petsError ? ' has-error' : ''}`} role="group" aria-labelledby={`${uid}-pets`} aria-describedby={petsError ? `${uid}-pets-err` : undefined}>
        <span className="label-text" id={`${uid}-pets`}>{t('hhPets')}</span>
        <div className="species-grid" ref={petsRef}>
          {myPets.map((p) => (
            <button key={p.id} type="button" className="species-tile" aria-pressed={selected.has(p.id)} onClick={() => toggle(p.id)}>
              <PetAvatar pet={p} size={36} iconSize={28} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        {petsError && <p className="error" id={`${uid}-pets-err`}>{t(petsError)}</p>}
      </div>
      {formError && <p className="notice notice-crit" role="alert">{t(formError)}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
        <IconPlus size={20} />
        {t('hhCreate')}
      </button>
    </form>
  );
}
