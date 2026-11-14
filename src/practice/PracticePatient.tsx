import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import { speciesName, Phone } from '../components/more/shared';
import { IconBack } from '../components/Icons';
import { accessErrorCode, practicePatient, type PatientDetail } from '../lib/practiceAccess';

/** Stammdaten eines Patienten (Etappe P2, nur lesen). Die volle Akte folgt in Etappe P3. */
export function PracticePatient() {
  const { petId } = useParams();
  const { t, lang } = useI18n();
  const [p, setP] = useState<PatientDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flash = (useLocation().state as { flash?: unknown } | null)?.flash;

  useEffect(() => {
    if (!petId) return;
    practicePatient(petId)
      .then(setP)
      .catch((e: unknown) => setErr(accessErrorCode(e) ?? 'db_error'));
  }, [petId]);

  const dash = <span className="muted">{t('notSet')}</span>;
  const val = (v: string | null | undefined) => (v && v.trim() ? v : dash);

  return (
    <div className="page stack-lg">
      <Link to="/praxis/patienten" className="back-link"><IconBack size={20} />{t('ptTitle')}</Link>
      {typeof flash === 'string' && <p className="notice notice-ok" role="status">{flash}</p>}
      {err ? (
        <p className="notice notice-warn" role="alert">{t(err === 'patient_not_found' ? 'ptNotFound' : 'errGeneric')}</p>
      ) : !p ? <p className="muted">{t('loading')}</p> : (
        <>
          <div className="page-head">
            <h1>{p.name}{p.deceased && <span className="muted"> · {t('ptDeceased')}</span>}</h1>
            <p className="muted">{[p.species ? speciesName({ species: p.species, species_other: p.species_other }, t) : '', p.breed].filter(Boolean).join(' · ')}</p>
          </div>
          {p.allergies?.trim() && <p className="notice notice-warn"><strong>{t('allergies')}:</strong> {p.allergies.trim()}</p>}
          <div className="practice-cards">
            <section className="card stack" aria-labelledby="pt-master">
              <h2 id="pt-master">{t('masterH')}</h2>
              <dl className="kv">
                <dt>{t('sex')}</dt>
                <dd>{p.sex === 'female' ? t('sexF') : p.sex === 'male' ? t('sexM') : dash}</dd>
                <dt>{t('birth')}</dt>
                <dd>{p.birth_date ? formatIsoDate(p.birth_date, lang) : dash}</dd>
                <dt>{t('chip')}</dt>
                <dd className="mono">{val(p.chip_no)}</dd>
                <dt>{t('ptWeight')}</dt>
                <dd>{p.weight ? t('ptWeightVal', { kg: new Intl.NumberFormat(lang).format(p.weight.kg), d: formatIsoDate(p.weight.measured_on, lang) }) : dash}</dd>
              </dl>
            </section>
            <section className="card stack" aria-labelledby="pt-owner">
              <h2 id="pt-owner">{t('ptOwner')}</h2>
              <dl className="kv">
                <dt>{t('pp_name')}</dt>
                <dd>{val(p.owner_name)}</dd>
                <dt>{t('pf_phone')}</dt>
                <dd><Phone v={p.owner_phone} /></dd>
                <dt>{t('ptAccess')}</dt>
                <dd>{t(p.source === 'code' ? 'ptViaCode' : 'ptViaRequest', { d: formatIsoDate(p.granted_at.slice(0, 10), lang) })}</dd>
              </dl>
            </section>
          </div>
          <p className="muted small">{t('ptMoreSoon')}</p>
        </>
      )}
    </div>
  );
}
