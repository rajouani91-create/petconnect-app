import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import { speciesName } from '../components/more/shared';
import { INVITE_STATUS_LABEL, inviteErrorKey, practicePatientInvites, resendPatientInvite, revokePatientInvite, type InviteStatus, type PracticeInviteRow } from '../lib/patientInvites';

const TONE: Record<InviteStatus, string> = { pending: 'pill-warn', accepted: 'pill-ok', declined: 'pill-crit', expired: '' };

/** Einladungen aus „Patient aufnehmen“: offen, angenommen, abgelehnt, abgelaufen. Unsichtbar, wenn es keine gibt. */
export function PatientInviteList() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<PracticeInviteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await practicePatientInvites());
    } catch {
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: t(inviteErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0 && !msg) return null;
  const d = (s: string) => formatIsoDate(s.slice(0, 10), lang);

  return (
    <section className="stack" aria-labelledby="pi-list-h">
      <h2 id="pi-list-h">{t('piListTitle')}</h2>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <ul className="patient-list">
        {rows.map((r) => (
          <li key={r.id} className="card patient-row">
            <div className="patient-text">
              <span className="patient-name">{r.pet_name} <span className={`pill ${TONE[r.status]}`}>{t(INVITE_STATUS_LABEL[r.status])}</span></span>
              <span className="muted small">{[speciesName({ species: r.species, species_other: r.species_other }, t), r.owner_name, r.email].filter(Boolean).join(' · ')}</span>
              <span className="muted small">
                {t('piSentOn', { d: d(r.created_at), n: r.by_name })}
                {r.status === 'pending' && r.code && <> · {t('piCode')}: <span className="mono">{r.code}</span> · {t('piValidUntil', { d: d(r.expires_at) })}</>}
              </span>
            </div>
            <div className="row-actions">
              {r.status === 'accepted' && r.pet_id && <Link to={`/praxis/patienten/${r.pet_id}`} className="btn btn-secondary">{t('ptRecord')}</Link>}
              {r.status === 'pending' && (
                <>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(async () => {
                    const res = await resendPatientInvite(r.id, lang);
                    if (!res.mailed) throw new Error('mail_failed');
                  }, t('pt_resent', { email: r.email }))}>{t('pt_resend')}</button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => revokePatientInvite(r.id), t('pt_revoked'))}>{t('pt_revoke')}</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
