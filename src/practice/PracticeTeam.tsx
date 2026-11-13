import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { isEmail } from '../lib/staff';
import {
  STAFF_ROLES, STAFF_ROLE_HINT, STAFF_ROLE_LABEL, errorCode, inviteStaff, openInvites, practiceErrorKey, practiceTeam, removeMember, resendInvite,
  revokeInvite, setMemberRole, type OpenInvite, type StaffRole, type TeamMember,
} from '../lib/practiceAccount';
import { usePractice } from './PracticeProvider';
import { useNow } from '../lib/useNow';

/** Team der Praxis: alle sehen die Liste; die Praxisleitung lädt ein, ändert Rollen und entfernt Mitglieder. */
export function PracticeTeam() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { me } = usePractice();
  const isLead = me?.role === 'lead';
  const now = useNow();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [invites, setInvites] = useState<OpenInvite[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('vet');
  const [nameErr, setNameErr] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [confirm, setConfirm] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await practiceTeam());
      if (isLead) setInvites(await openInvites());
    } catch {
      setMsg({ ok: false, text: t('pe_generic') });
    }
  }, [isLead, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: t(practiceErrorKey(errorCode(e))) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    const nErr = !name.trim();
    const eErr = !isEmail(email);
    setNameErr(nErr);
    setEmailErr(eErr);
    if (nErr || eErr) return;
    if (await run(() => inviteStaff(email, name, role, lang), t('pt_invited', { email: email.trim() }))) {
      setName('');
      setEmail('');
    }
  }

  const date = (s: string) => new Date(s).toLocaleDateString(lang);
  const leads = team?.filter((m) => m.role === 'lead').length ?? 0;

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <h1>{t('pt_title')}</h1>
        <p className="muted">{t('pt_intro')}</p>
      </div>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      <section className="card stack" aria-labelledby="pt-members">
        <h2 id="pt-members">{t('pt_members')}</h2>
        {!team ? <p className="muted">{t('loading')}</p> : (
          <ul className="member-list">
            {team.map((m) => {
              const self = m.user_id === user?.id;
              const locked = m.role === 'lead' && leads <= 1;
              return (
                <li key={m.user_id} className="member-row team-row">
                  <div className="member-text">
                    <span className="member-name">{m.display_name ?? m.email}{self && <span className="muted"> {t('pt_you')}</span>}</span>
                    <span className="muted small">{m.email} · {t('pt_since', { date: date(m.created_at) })}</span>
                  </div>
                  {isLead ? (
                    <div className="row-actions">
                      <label className="sr-only" htmlFor={`role-${m.user_id}`}>{t('pt_roleOf', { name: m.display_name ?? m.email })}</label>
                      <select id={`role-${m.user_id}`} value={m.role} disabled={busy || locked}
                        onChange={(e) => void run(() => setMemberRole(m.user_id, e.target.value as StaffRole), t('pt_roleSaved'))}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(STAFF_ROLE_LABEL[r])}</option>)}
                      </select>
                      {!self && (
                        <button type="button" className="btn btn-ghost" disabled={busy || locked} onClick={() => setConfirm(m)}>{t('pt_remove')}</button>
                      )}
                    </div>
                  ) : (
                    <span className="pill">{t(STAFF_ROLE_LABEL[m.role])}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {isLead && leads <= 1 && <p className="muted small">{t('pt_lastLeadHint')}</p>}
      </section>

      {isLead && (
        <section className="card stack" aria-labelledby="pt-invite">
          <h2 id="pt-invite">{t('pt_inviteTitle')}</h2>
          <p className="muted">{t('pt_inviteIntro')}</p>
          <form className="stack" onSubmit={onInvite} noValidate>
            <div className="row-2">
              <Field id="pt-name" label={t('pp_name')} error={nameErr ? { key: 'err_required' } : undefined} required>
                {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setNameErr(false); }} />}
              </Field>
              <Field id="pt-email" label={t('email')} error={emailErr ? { key: 'err_email' } : undefined} required>
                {(a) => <input {...a} type="email" inputMode="email" autoComplete="off" maxLength={200} value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(false); }} />}
              </Field>
            </div>
            <fieldset className="field role-choice">
              <legend>{t('pp_role')}</legend>
              <div className="role-options">
                {STAFF_ROLES.map((r) => (
                  <label key={r} className="radio role-option">
                    <input type="radio" name="pt-role" value={r} checked={role === r} onChange={() => setRole(r)} aria-describedby={`pt-role-${r}`} />
                    <span className="role-text">
                      <span className="role-title">{t(STAFF_ROLE_LABEL[r])}</span>
                      <span className="muted small" id={`pt-role-${r}`}>{t(STAFF_ROLE_HINT[r])}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('pt_send')}</button>
          </form>

          <h3>{t('pt_open')}</h3>
          {invites.length === 0 ? <p className="muted">{t('pt_noOpen')}</p> : (
            <ul className="member-list">
              {invites.map((i) => {
                const expired = new Date(i.expires_at) < now;
                return (
                  <li key={i.id} className="member-row team-row">
                    <div className="member-text">
                      <span className="member-name">{i.name} · {t(STAFF_ROLE_LABEL[i.role])}</span>
                      <span className="muted small">{i.email} · {expired ? t('pt_expired') : t('pt_validUntil', { date: date(i.expires_at) })}</span>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(() => resendInvite(i.id, lang), t('pt_resent', { email: i.email }))}>{t('pt_resend')}</button>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => revokeInvite(i.id), t('pt_revoked'))}>{t('pt_revoke')}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <Dialog
        open={confirm !== null}
        title={t('pt_removeTitle')}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{t('pp_cancel')}</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => {
              const m = confirm;
              setConfirm(null);
              if (m) void run(() => removeMember(m.user_id), t('pt_removed'));
            }}>{t('pt_remove')}</button>
          </>
        }
      >
        <p>{confirm ? t('pt_removeText', { name: confirm.display_name ?? confirm.email }) : ''}</p>
      </Dialog>
    </div>
  );
}
