import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { IconBack } from '../components/Icons';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { isClinical, issueCertificate, recordErrorKey, vaccinationCertificate, type VaccinationCertificateData } from '../lib/practiceRecord';
import { VaccinationCertificate } from '../components/record/VaccinationCertificate';
import { usePractice } from './PracticeProvider';

/** Digitaler Impfnachweis in der Praxis: ansehen, drucken und mit Namen und Datum ausstellen. */
export function PracticeCertificate() {
  const { petId } = useParams();
  const { t, lang } = useI18n();
  const { me } = usePractice();
  const today = zonedNow(useNow()).date;
  const [data, setData] = useState<VaccinationCertificateData | null>(null);
  const [loadErr, setLoadErr] = useState<MessageKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!petId) return;
    try {
      setData(await vaccinationCertificate(petId));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(recordErrorKey(e));
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue() {
    if (!petId) return;
    setBusy(true);
    setMsg(null);
    try {
      await issueCertificate(petId);
      await load();
      setMsg({ ok: true, text: t('cfIssuedOk') });
    } catch (e) {
      setMsg({ ok: false, text: t(recordErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  const mine = data?.issued.find((i) => i.mine);

  return (
    <div className="page stack-lg">
      <Link to={`/praxis/patienten/${petId ?? ''}`} className="back-link no-print"><IconBack size={20} />{t('cfBack')}</Link>
      <header className="page-head no-print">
        <h1>{t('cfTitle')}</h1>
      </header>
      {loadErr && !data && <p className="notice notice-warn" role="alert">{t(loadErr)}</p>}
      {!data && !loadErr && <p className="muted">{t('loading')}</p>}
      {data && (
        <>
          <section className="card stack no-print" aria-label={t('cfIssue')}>
            <p>{t('cfIssueIntro')}</p>
            {mine && <p className="practice-note">{t('cfIssued', { d: formatIsoDate(mine.at.slice(0, 10), lang), who: mine.by_name })}</p>}
            {isClinical(me?.role) ? (
              <button type="button" className="btn btn-secondary btn-start" disabled={busy} onClick={() => void issue()}>{t(mine ? 'cfIssueAgain' : 'cfIssue')}</button>
            ) : (
              <p className="muted small">{t('cfTeamNote')}</p>
            )}
            <div role="status" aria-live="polite">{msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}</div>
          </section>
          <VaccinationCertificate data={data} today={today} />
        </>
      )}
    </div>
  );
}
