import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { speciesName } from '../components/more/shared';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { accessErrorCode, dueState, filterPatients, practicePatients, type DueState, type PatientRow } from '../lib/practiceAccess';
import { usePractice } from './PracticeProvider';

const DUE_TONE: Record<DueState, string> = { overdue: 'pill-crit', soon: 'pill-warn', ok: '' };
const DUE_TEXT: Record<DueState, MessageKey> = { overdue: 'ptOverdue', soon: 'ptSoon', ok: 'ptDueOn' };

/** Patientenliste der Praxis wie im Prototyp: Suche, je Tier nächste Fälligkeit, „Tierakte“. */
export function PracticePatients() {
  const { t, lang } = useI18n();
  const { me } = usePractice();
  const today = zonedNow(useNow()).date;
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const pending = me?.practice?.status === 'pending';

  useEffect(() => {
    if (pending) return;
    practicePatients()
      .then(setRows)
      .catch((e: unknown) => setErr(accessErrorCode(e) ?? 'db_error'));
  }, [pending]);

  const sp = useCallback((r: PatientRow) => (r.species ? speciesName({ species: r.species, species_other: r.species_other }, t) : ''), [t]);
  const shown = useMemo(() => (rows ? filterPatients(rows, q, sp) : []), [rows, q, sp]);

  return (
    <div className="page stack-lg">
      <div className="page-head page-head-row patients-head">
        <h1>{t('ptTitle')}</h1>
        {!pending && <Link to="/praxis/patienten/zugriff" className="btn btn-secondary">{t('ptCodeOrRequest')}</Link>}
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('ptPending')}</p>
        </div>
      ) : err ? (
        <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="pt-q" className="sr-only">{t('ptSearch')}</label>
            <input id="pt-q" className="practice-search" type="search" placeholder={t('ptSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {rows === null ? <p className="muted">{t('loading')}</p> : rows.length === 0 ? (
            <div className="card stack">
              <p>{t('ptEmpty')}</p>
              <p><Link to="/praxis/patienten/zugriff" className="link">{t('ptCodeOrRequest')}</Link></p>
            </div>
          ) : shown.length === 0 ? <p className="muted" role="status">{t('ptNoHits')}</p> : (
            <ul className="patient-list" aria-label={t('ptTitle')}>
              {shown.map((r) => {
                const due = r.next_vacc_due ? dueState(r.next_vacc_due, today) : null;
                return (
                  <li key={r.pet_id} className="card patient-row">
                    <span className="patient-ava" aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span>
                    <div className="patient-text">
                      <span className="patient-name">{r.name}{r.deceased && <span className="muted"> · {t('ptDeceased')}</span>}</span>
                      <span className="muted small">{[sp(r), r.breed, r.owner_name].filter(Boolean).join(' · ')}</span>
                      {r.next_vacc_name && r.next_vacc_due && due && (
                        <span className="small">
                          {t('ptNext', { x: r.next_vacc_name })}{' '}
                          <span className={`pill ${DUE_TONE[due]}`}>{t(DUE_TEXT[due], { d: formatIsoDate(r.next_vacc_due, lang) })}</span>
                        </span>
                      )}
                    </div>
                    <Link to={`/praxis/patienten/${r.pet_id}`} className="btn btn-secondary">{t('ptRecord')}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
