import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate } from '../../i18n';
import type { PetRow } from '../../lib/supabase';
import { ownerPracticeAccess, petPracticeCode, revokePracticeAccess, type OwnerAccessRow, type PracticeCode } from '../../lib/practiceAccess';
import { Dialog } from '../../components/Dialog';
import { BackToRecord, PetSubpage } from '../../components/more/shared';
import { StatusLine, useStatus } from '../../components/record/shared';

/** „Praxen mit Zugriff“: Praxis-Code zum Vorzeigen, Liste der Praxen mit Freigabe, Zugriff entziehen. Nur Haupthalter:in. */
export function PetPractices() {
  return <PetSubpage>{(pet, role) => <PetPracticesView key={pet.id} pet={pet} isOwner={role === 'owner'} />}</PetSubpage>;
}

function PetPracticesView({ pet, isOwner }: { pet: PetRow; isOwner: boolean }) {
  const { t, lang } = useI18n();
  const [code, setCode] = useState<PracticeCode | null>(null);
  const [rows, setRows] = useState<OwnerAccessRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<OwnerAccessRow | null>(null);
  const [status, setStatus] = useStatus();

  const load = useCallback(async () => {
    if (!isOwner) return;
    try {
      const all = await ownerPracticeAccess();
      setRows(all.filter((r) => r.pet_id === pet.id));
    } catch {
      setRows([]);
      setStatus(t('errGeneric'), false);
    }
  }, [isOwner, pet.id, setStatus, t]);
  useEffect(() => {
    void load();
  }, [load]);

  async function showCode(renew: boolean) {
    setBusy(true);
    try {
      setCode(await petPracticeCode(pet.id, renew));
      if (renew) setStatus(t('paCodeRenewed'));
    } catch {
      setStatus(t('errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(r: OwnerAccessRow) {
    setConfirm(null);
    setBusy(true);
    try {
      await revokePracticeAccess(r.pet_id, r.practice_id);
      setStatus(t('paRevoked', { p: r.practice_name }));
      await load();
    } catch {
      setStatus(t('errGeneric'), false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <div className="page-head">
        <h1>{t('paTitle', { n: pet.name })}</h1>
        <p className="muted">{t('paIntro')}</p>
      </div>
      <StatusLine status={status} />
      {!isOwner ? (
        <p className="notice notice-info">{t('paOnlyOwner')}</p>
      ) : (
        <>
          <section className="card stack" aria-labelledby="pa-code">
            <h2 id="pa-code">{t('paCodeTitle')}</h2>
            <p>{t('paCodeIntro')}</p>
            {code ? (
              <>
                <p className="practice-code mono" aria-label={t('paCodeAria', { c: code.code.split('').join(' ') })}>{code.code}</p>
                <p className="muted small">{t('paCodeValid', { d: formatIsoDate(code.expires_at.slice(0, 10), lang) })}</p>
                <div className="row-actions">
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void showCode(true)}>{t('paCodeNew')}</button>
                </div>
              </>
            ) : (
              <div className="row-actions">
                <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void showCode(false)}>{t('paCodeShow')}</button>
              </div>
            )}
          </section>

          <section className="card stack" aria-labelledby="pa-list">
            <h2 id="pa-list">{t('paListTitle')}</h2>
            {rows === null ? <p className="muted">{t('loading')}</p> : rows.length === 0 ? <p className="muted">{t('paNone')}</p> : (
              <ul className="member-list">
                {rows.map((r) => (
                  <li key={r.practice_id} className="member-row team-row">
                    <div className="member-text">
                      <span className="member-name">{r.practice_name}</span>
                      <span className="muted small">
                        {[r.city, t('paSince', { d: formatIsoDate(r.created_at.slice(0, 10), lang) }), t(r.source === 'code' ? 'paViaCode' : r.source === 'invite' ? 'paViaInvite' : 'paViaRequest')].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(r)}>{t('paRevoke')}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">{t('paWhatSee')}</p>
            <p className="muted small">{t('paCanWrite')}</p>
          </section>
        </>
      )}
      <Dialog
        open={confirm !== null}
        title={t('paRevokeTitle')}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{t('pp_cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={() => confirm && void revoke(confirm)}>{t('paRevoke')}</button>
          </>
        }
      >
        <p>{confirm ? t('paRevokeText', { p: confirm.practice_name, n: pet.name }) : ''}</p>
      </Dialog>
    </div>
  );
}
