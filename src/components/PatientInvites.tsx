import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { speciesName } from './more/shared';
import { answerPatientInvite, inviteErrorKey, ownerPatientInvites, type OwnerInvite } from '../lib/patientInvites';

/** Eine Einladung mit Einwilligung: Annehmen legt das Tier im eigenen Konto an und gibt der Praxis die Freigabe. */
export function PatientInviteCard({ invite, code, onDone }: { invite: OwnerInvite; code?: string; onDone: (text: string) => void }) {
  const { t, lang } = useI18n();
  const { reload } = usePets();
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = invite.pet;

  async function answer(accept: boolean) {
    if (accept && !consent) {
      setErr(t('piErrConsent'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const petId = await answerPatientInvite(invite.id, accept, consent, code);
      if (accept && petId) {
        await reload(petId);
        void navigate(`/tier/${petId}/vorgeschichte`);
      } else {
        onDone(t('piDeclined'));
      }
    } catch (e) {
      setErr(t(inviteErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack practice-request" aria-labelledby={`pi-${invite.id}`}>
      <h2 id={`pi-${invite.id}`}>{t('piFrom', { p: invite.practice_name })}</h2>
      <p className="muted small">{[invite.city, formatIsoDate(invite.created_at.slice(0, 10), lang)].filter(Boolean).join(' · ')}</p>
      <p>{t('piOwnerIntro', { p: invite.practice_name, n: p.name })}</p>
      <dl className="kv">
        <dt>{t('petName')}</dt><dd>{p.name}</dd>
        <dt>{t('vltSpecies')}</dt><dd>{speciesName({ species: p.species, species_other: p.species_other }, t)}</dd>
        {p.breed && <><dt>{t('breed')}</dt><dd>{p.breed}</dd></>}
        {p.sex && <><dt>{t('sex')}</dt><dd>{p.sex === 'female' ? t('sexF') : t('sexM')}</dd></>}
        {p.birth_date && <><dt>{t('birth')}</dt><dd>{formatIsoDate(p.birth_date, lang)}</dd></>}
        {p.chip_no && <><dt>{t('chip')}</dt><dd className="mono">{p.chip_no}</dd></>}
      </dl>
      <label className="check-row consent-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('piConsent', { p: invite.practice_name })}</span>
      </label>
      <p className="muted small">{t('piConsentNote')}</p>
      {err && <p className="notice notice-crit" role="alert">{err}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void answer(true)}>{t('piAccept')}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void answer(false)}>{t('prqDecline')}</button>
      </div>
    </section>
  );
}

/** Offene Einladungen von Praxen an die E-Mail-Adresse des Kontos (auf „Heute“). Unsichtbar ohne Einladung. */
export function PatientInvites() {
  const [invites, setInvites] = useState<OwnerInvite[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await ownerPatientInvites());
    } catch {
      setInvites([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (invites.length === 0 && !msg) return null;
  return (
    <div className="stack">
      {msg && <p className="notice notice-ok" role="status">{msg}</p>}
      {invites.map((i) => <PatientInviteCard key={i.id} invite={i} onDone={(text) => { setMsg(text); void load(); }} />)}
    </div>
  );
}
