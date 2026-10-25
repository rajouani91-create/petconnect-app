import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MAX_REASON, isEmail, reasonError, roleErrorText, setStaffRole, staffTeam, type RoleChange, type StaffRole, type TeamMember } from '../../lib/staff';

const ROLE_LABEL: Record<StaffRole, string> = { admin: 'Admin', support: 'Support' };

/** Nur für Admins: Zugänge zur Admin-Oberfläche vergeben, ändern und entziehen. */
export function Team({ selfId }: { selfId: string }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    staffTeam()
      .then(setTeam)
      .catch(() => setMessage('Das Team konnte nicht geladen werden.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(targetEmail: string, change: RoleChange, why: string) {
    if (reasonError(why)) {
      setMessage(`Bitte einen Grund angeben (höchstens ${MAX_REASON} Zeichen).`);
      return false;
    }
    setBusy(true);
    try {
      await setStaffRole(targetEmail, change, why);
      setMessage(change === 'none' ? 'Zugang entzogen.' : `Zugang gespeichert: ${ROLE_LABEL[change]}.`);
      load();
      return true;
    } catch (e) {
      setMessage(roleErrorText((e as { code?: string }).code));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) {
      setMessage('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (await apply(email, role, reason)) {
      setEmail('');
      setReason('');
    }
  }

  async function onRemove(m: TeamMember) {
    const why = window.prompt(`Grund für den Entzug des Zugangs von ${m.email}:`) ?? '';
    if (!why.trim()) return;
    await apply(m.email, 'none', why);
  }

  return (
    <section aria-labelledby="team-title" className="team">
      <h2 id="team-title">Team und Zugänge</h2>
      <p>Wer hier eingetragen ist, darf die Admin-Oberfläche öffnen. Support sieht Konten und Tickets. Admin darf zusätzlich sperren, Ankündigungen pflegen, das Dashboard sehen und Zugänge vergeben.</p>

      {message && <p role="status">{message}</p>}

      {team && (
        <ul aria-label="Aktuelles Team">
          {team.map((m) => (
            <li key={m.user_id}>
              <strong>{m.display_name ?? m.email}</strong> · {m.email} · {ROLE_LABEL[m.role]}
              {m.user_id === selfId ? (
                <span> (Sie)</span>
              ) : (
                <>
                  {' '}
                  <button type="button" disabled={busy} onClick={() => onRemove(m)}>
                    Zugang entziehen
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} aria-labelledby="team-add-title">
        <h3 id="team-add-title">Zugang vergeben oder Rolle ändern</h3>
        <p>Die Person braucht zuerst ein normales PetConnect-Konto. Eine bestehende Rolle wird überschrieben.</p>
        <label htmlFor="team-email">E-Mail-Adresse des Kontos</label>
        <input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <label htmlFor="team-role">Rolle</label>
        <select id="team-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="support">Support (Konten ansehen, Tickets, Passwort-Link)</option>
          <option value="admin">Admin (voller Zugriff, vergibt auch Zugänge)</option>
        </select>
        <label htmlFor="team-reason">Grund (Pflicht, wird protokolliert)</label>
        <input id="team-reason" value={reason} maxLength={MAX_REASON + 50} onChange={(e) => setReason(e.target.value)} />
        <button type="submit" disabled={busy}>
          Speichern
        </button>
      </form>
    </section>
  );
}
