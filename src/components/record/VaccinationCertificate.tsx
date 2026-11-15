import { useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, formatIsoDateShort } from '../../i18n';
import { LogoMark } from '../Icons';
import { Val, speciesName } from '../more/shared';
import { VACC_STATUS_LABEL, vaccStatus } from '../../lib/record';
import type { CertVaccination, VaccinationCertificateData } from '../../lib/practiceRecord';

type Tab = 'confirmed' | 'own';

/**
 * Digitaler Impfnachweis: dasselbe Dokument für Halter:in und Praxis.
 * „Bestätigt von Praxis“ und „Eigene Einträge“ sind getrennt; eigene Einträge tragen einen deutlichen Warnrahmen.
 * Gedruckt wird der gerade gewählte Reiter.
 */
export function VaccinationCertificate({ data, today }: { data: VaccinationCertificateData; today: string }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [tab, setTab] = useState<Tab>(data.confirmed.length === 0 && data.own.length > 0 ? 'own' : 'confirmed');
  const p = data.pet;
  const d = (iso: string | null) => (iso ? formatIsoDateShort(iso, lang) : '–');
  const sex = p.sex === 'female' ? t('sexF') : p.sex === 'male' ? t('sexM') : null;
  const rows = tab === 'confirmed' ? data.confirmed : data.own;

  const table = (list: CertVaccination[], withPractice: boolean) => (
    <div className="table-wrap">
      <table className="vault-table">
        <caption className="sr-only">{t(tab === 'confirmed' ? 'cfTabConfirmed' : 'cfTabOwn')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('vcName')}</th>
            <th scope="col">{t('vcGivenOn')}</th>
            <th scope="col">{t('vcValidUntil')}</th>
            <th scope="col">{t('vltStatus')}</th>
            {withPractice && <th scope="col">{t('cfColBy')}</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((v) => {
            const st = vaccStatus(v.valid_until, today);
            return (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{d(v.given_on)}</td>
                <td>{d(v.valid_until)}</td>
                <td>{st ? t(VACC_STATUS_LABEL[st]) : '–'}</td>
                {withPractice && <td>{[v.practice_name, v.by_name].filter(Boolean).join(' · ') || '–'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="stack no-print">
        <div className="tabs" role="tablist" aria-label={t('cfTitle')}>
          {(['confirmed', 'own'] as const).map((k) => (
            <button key={k} type="button" role="tab" id={`${uid}-tab-${k}`} aria-selected={tab === k} aria-controls={`${uid}-doc`} className="tab" onClick={() => setTab(k)}>
              {t(k === 'confirmed' ? 'cfTabConfirmed' : 'cfTabOwn')} ({(k === 'confirmed' ? data.confirmed : data.own).length})
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-start" onClick={() => window.print()}>{t('cfPrint')}</button>
      </div>

      <article className={`vault print-a4${tab === 'own' ? ' cert-own' : ''}`} id={`${uid}-doc`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        <header className="vault-head">
          <span className="brand"><LogoMark /><span>PetConnect24</span></span>
          <h2>{t('cfDocTitle', { n: p.name })}</h2>
          <p className="muted small">{t(tab === 'confirmed' ? 'cfTabConfirmed' : 'cfTabOwn')} · {t('cfAsOf', { d: formatIsoDate(today, lang) })}</p>
        </header>

        {tab === 'own' && <p className="cert-warn" role="note">{t('cfOwnWarn')}</p>}

        <section className="vault-section">
          <h3>{t('masterH')}</h3>
          <dl className="kv">
            <dt>{t('petName')}</dt><dd>{p.name}</dd>
            <dt>{t('vltSpecies')}</dt><dd>{p.species ? speciesName({ species: p.species, species_other: p.species_other }, t) : <Val v={null} />}</dd>
            <dt>{t('breed')}</dt><dd><Val v={p.breed} /></dd>
            <dt>{t('sex')}</dt><dd><Val v={sex} /></dd>
            <dt>{t('birth')}</dt><dd><Val v={p.birth_date ? formatIsoDate(p.birth_date, lang) : null} /></dd>
            <dt>{t('chip')}</dt><dd className="mono"><Val v={p.chip_no} /></dd>
            <dt>{t('cOwner')}</dt><dd><Val v={data.owner_name} /></dd>
          </dl>
        </section>

        <section className="vault-section">
          <h3>{t('rcVaccH')}</h3>
          {rows.length === 0 ? <p className="muted">{t(tab === 'confirmed' ? 'cfNoConfirmed' : 'cfNoOwn')}</p> : table(rows, tab === 'confirmed')}
        </section>

        {tab === 'confirmed' && (
          <section className="vault-section">
            <h3>{t('cfIssuedH')}</h3>
            {data.issued.length === 0 ? <p className="muted">{t('cfNotIssued')}</p> : (
              <ul className="cert-issued">
                {data.issued.map((i, n) => (
                  <li key={n}>
                    <strong>{[i.practice_name, i.city].filter(Boolean).join(', ')}</strong>
                    <span>{t('cfIssued', { d: formatIsoDate(i.at.slice(0, 10), lang), who: i.by_name })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <footer className="vault-foot">
          <span>{t('cfDisclaimer')}</span>
        </footer>
      </article>
    </>
  );
}
