import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { listInsurances, listVaccinations, listWeights, profileNames, type InsuranceRow, type VaccinationRow, type WeightRow } from '../../lib/api';
import { SUBMISSION_LABEL, formatEuro, isSubmission } from '../../lib/care';
import { VACC_STATUS_LABEL, chartPoints, formatKg, sortVaccinations, sortWeightsDesc, vaccStatus } from '../../lib/record';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { LogoMark } from '../../components/Icons';
import { Loading } from '../../components/Loading';
import { BackToRecord, PetSubpage, Val, speciesName } from '../../components/more/shared';

/** Gesundheitsakte als druckbares Dokument (A4, „Als PDF speichern / drucken“). Ohne Dokumente und Rechnungen. */
export function HealthRecord() {
  return <PetSubpage>{(pet) => <HealthRecordView key={pet.id} pet={pet} />}</PetSubpage>;
}

interface Data {
  vaccs: VaccinationRow[];
  weights: WeightRow[];
  insurances: InsuranceRow[];
  owner: string | null;
}

function HealthRecordView({ pet }: { pet: PetRow }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const { user, profile } = useAuth();
  const today = zonedNow(useNow()).date;
  const uid = useId();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [withIns, setWithIns] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listVaccinations(pet.id),
      listWeights(pet.id),
      listInsurances(pet.id),
      pet.owner_id === user?.id ? Promise.resolve(new Map([[pet.owner_id, profile?.display_name ?? '']])) : profileNames([pet.owner_id]).catch(() => new Map<string, string>()),
    ])
      .then(([vaccs, weights, insurances, names]) => alive && setData({ vaccs: sortVaccinations(vaccs), weights: sortWeightsDesc(weights), insurances, owner: names.get(pet.owner_id) ?? null }))
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [pet.id, pet.owner_id, user?.id, profile?.display_name]);

  const d = (iso: string | null) => (iso ? formatIsoDateShort(iso, lang) : '');
  const sex = pet.sex === 'female' ? t('sexF') : pet.sex === 'male' ? t('sexM') : null;
  const kg = (n: number) => t('wkKgValue', { kg: formatKg(Number(n), locale) });

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <header className="page-head no-print">
        <h1>{t('vltTitle')}</h1>
        <p className="muted">{t('vltSub', { n: pet.name })}</p>
      </header>
      <div className="stack no-print">
        <label className="check-row" htmlFor={`${uid}-ins`}>
          <input id={`${uid}-ins`} type="checkbox" checked={withIns} onChange={(e) => setWithIns(e.target.checked)} />
          <span>{t('vltWithIns')}</span>
        </label>
        <button type="button" className="btn btn-primary btn-start" onClick={() => window.print()} disabled={!data}>
          {t('vltPrint')}
        </button>
      </div>

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!data && !error && <Loading />}

      {data && (
        <article className="vault print-a4" aria-labelledby={`${uid}-doc`}>
          <header className="vault-head">
            <span className="brand"><LogoMark /><span>PetConnect</span></span>
            <h2 id={`${uid}-doc`}>{t('vltDocTitle', { n: pet.name })}</h2>
          </header>

          <section className="vault-section" aria-labelledby={`${uid}-base`}>
            <h3 id={`${uid}-base`}>{t('masterH')}</h3>
            <dl className="kv">
              <dt>{t('petName')}</dt><dd>{pet.name}</dd>
              <dt>{t('vltSpecies')}</dt><dd>{speciesName(pet, t)}</dd>
              <dt>{t('breed')}</dt><dd><Val v={pet.breed} /></dd>
              <dt>{t('sex')}</dt><dd><Val v={sex} /></dd>
              <dt>{t('birth')}</dt><dd><Val v={d(pet.birth_date)} /></dd>
              <dt>{t('chip')}</dt><dd className="mono"><Val v={pet.chip_no} /></dd>
              <dt>{t('cOwner')}</dt><dd><Val v={data.owner} /></dd>
            </dl>
          </section>

          <section className="vault-section page-break" aria-labelledby={`${uid}-vacc`}>
            <h3 id={`${uid}-vacc`}>{t('vltVacc')}</h3>
            {data.vaccs.length === 0 ? (
              <p className="muted">{t('vcNone')}</p>
            ) : (
              <div className="table-wrap">
                <table className="vault-table">
                  <caption className="sr-only">{t('vltVaccCaption', { n: pet.name })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('vcName')}</th>
                      <th scope="col">{t('vcGivenOn')}</th>
                      <th scope="col">{t('vcValidUntil')}</th>
                      <th scope="col">{t('vltStatus')}</th>
                      <th scope="col">{t('vltSource')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vaccs.map((v) => {
                      const st = vaccStatus(v.valid_until, today);
                      return (
                        <tr key={v.id}>
                          <td>{v.name}</td>
                          <td>{d(v.given_on) || '–'}</td>
                          <td>{d(v.valid_until) || '–'}</td>
                          <td>{st ? t(VACC_STATUS_LABEL[st]) : '–'}</td>
                          <td>{v.source === 'practice' ? t('vltSrcPractice') : t('vltSrcOwner')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="vault-section" aria-labelledby={`${uid}-med`}>
            <h3 id={`${uid}-med`}>{t('vltMeds')}</h3>
            <dl className="kv">
              <dt>{t('cAllergies')}</dt><dd><Val v={pet.allergies} pre /></dd>
              <dt>{t('medications')}</dt><dd><Val v={pet.medications} pre /></dd>
            </dl>
          </section>

          <section className="vault-section" aria-labelledby={`${uid}-wt`}>
            <h3 id={`${uid}-wt`}>{t('recWeight')}</h3>
            {data.weights.length === 0 ? (
              <p className="muted">{t('wkNone')}</p>
            ) : (
              <>
                {data.weights.length >= 2 && <MiniChart rows={data.weights} />}
                <div className="table-wrap">
                  <table className="vault-table">
                    <caption className="sr-only">{t('vltWeightCaption', { n: pet.name })}</caption>
                    <thead>
                      <tr><th scope="col">{t('wkDate')}</th><th scope="col">{t('wkKg')}</th></tr>
                    </thead>
                    <tbody>
                      {data.weights.map((w) => (
                        <tr key={w.id}><td>{d(w.measured_on)}</td><td>{kg(w.kg)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="vault-section" aria-labelledby={`${uid}-em`}>
            <h3 id={`${uid}-em`}>{t('vltContacts')}</h3>
            <dl className="kv">
              <dt>{t('emergencyContact')}</dt><dd><Val v={pet.emergency_contact} pre /></dd>
              <dt>{t('cVet')}</dt><dd><Val v={pet.vet_name} /></dd>
              <dt>{t('cVetPhone')}</dt><dd><Val v={pet.vet_phone} /></dd>
              <dt>{t('cOwnerPhone')}</dt><dd><Val v={pet.owner_phone} /></dd>
            </dl>
          </section>

          {withIns && (
            <section className="vault-section" aria-labelledby={`${uid}-ins-h`}>
              <h3 id={`${uid}-ins-h`}>{t('iTitle')}</h3>
              {data.insurances.length === 0 ? (
                <p className="muted">{t('insNone')}</p>
              ) : (
                data.insurances.map((i) => (
                  <dl key={i.id} className="kv">
                    <dt>{t('insInsurer')}</dt><dd>{i.insurer}</dd>
                    <dt>{t('insNo')}</dt><dd className="mono">{i.policy_no}</dd>
                    <dt>{t('insHolder')}</dt><dd><Val v={i.holder_name} /></dd>
                    <dt>{t('insDeductible')}</dt><dd>{i.deductible === null ? <Val v={null} /> : formatEuro(Number(i.deductible), locale)}</dd>
                    <dt>{t('insPct')}</dt><dd>{i.reimbursement_pct === null ? <Val v={null} /> : `${i.reimbursement_pct} %`}</dd>
                    <dt>{t('insSubmission')}</dt><dd>{isSubmission(i.submission) ? t(SUBMISSION_LABEL[i.submission]) : <Val v={null} />}</dd>
                  </dl>
                ))
              )}
            </section>
          )}

          <footer className="vault-foot">
            <p>{t('vltCreated', { d: d(today) })}</p>
            <p>{t('vltSourceNote')}</p>
          </footer>
        </article>
      )}
    </div>
  );
}

function MiniChart({ rows }: { rows: WeightRow[] }) {
  const { t } = useI18n();
  const W = 320;
  const H = 90;
  const pts = chartPoints(rows, W, H, 10);
  return (
    <svg className="vault-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('wkHist')} preserveAspectRatio="none">
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" className="chart-line" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" className="chart-dot" />)}
    </svg>
  );
}
