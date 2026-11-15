import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate } from '../../i18n';
import { VACC_STATUS_LABEL, vaccStatus } from '../../lib/record';
import { confirmVaccination, entryForm, filterVaccinations, isClinical, isRabies, type VaccFilter } from '../../lib/practiceRecord';
import { EnteredBy, type RecordCtx } from './shared';

const FILTERS: [VaccFilter, 'hsAll' | 'rcFilterOurs' | 'rcFilterOwner'][] = [['all', 'hsAll'], ['ours', 'rcFilterOurs'], ['owner', 'rcFilterOwner']];

/** Impfungen: Einträge der Praxis und der Halter:in. Einträge der Halter:in lassen sich bestätigen (alle Rollen). */
export function VaccinationsCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [filter, setFilter] = useState<VaccFilter>('all');
  const { rec } = ctx;
  const clinical = isClinical(rec.role);
  const rows = filterVaccinations(rec.vaccinations, filter);
  const d = (iso: string) => formatIsoDate(iso, lang);

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <div className="card-head">
        <h2 id={`${uid}-h`}>{t('rcVaccH')}</h2>
        <Link to="impfnachweis" className="btn btn-secondary">{t('cfLink')}</Link>
      </div>
      <div className="chips-wrap" role="group" aria-label={t('rcFilterL')}>
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t(label)}</button>
        ))}
      </div>
      {rows.length === 0 ? <p className="muted">{t('rcVaccNone')}</p> : (
        <ul className="record-list">
          {rows.map((v) => {
            const st = vaccStatus(v.valid_until, ctx.today);
            const title = `${t('hsKindVacc')} · ${v.name}`;
            return (
              <li key={v.id} className="record-row">
                <div className="record-main">
                  <span className="record-title">
                    {v.name}
                    {st && <span className={`pill vacc-${st}`}>{t(VACC_STATUS_LABEL[st])}</span>}
                    {isRabies(v.name) && <span className="pill pill-accent">{t('rcEuTravel')}</span>}
                  </span>
                  <span className="muted small">
                    {[v.given_on && t('vcGivenOnV', { d: d(v.given_on) }), v.valid_until && t('vcValidUntilV', { d: d(v.valid_until) })].filter(Boolean).join(' · ') || t('vcNoDates')}
                  </span>
                  {v.source === 'owner' ? (
                    <span className="small owner-note">{t('rcOwnerUnverified')}</span>
                  ) : (
                    <span className="small practice-note">{v.confirmed ? t('rcConfirmedBy', { p: v.practice_name ?? '' }) : t('rcFromPractice', { p: v.practice_name ?? t('vltSrcPractice') })}</span>
                  )}
                  <EnteredBy at={v.entered_at} by={v.by_name} changed={v.changed && v.mine} onLog={v.entry_id ? () => ctx.openLog({ entryId: v.entry_id, title }) : undefined} />
                </div>
                <div className="row-actions">
                  {v.source === 'owner' && (
                    <button type="button" className="btn btn-secondary" disabled={ctx.busy} aria-label={t('rcConfirmL', { n: v.name })} onClick={() => void ctx.run(() => confirmVaccination(ctx.petId, v.id), t('rcConfirmed', { n: v.name }))}>
                      {t('rcConfirm')}
                    </button>
                  )}
                  {v.mine && v.entry_id && clinical && !v.confirmed && (
                    <button type="button" className="btn btn-ghost" aria-label={t('rcEditL', { n: v.name })} onClick={() => ctx.openEdit({ kind: 'vaccination', entryId: v.entry_id!, title, values: entryForm('vaccination', { name: v.name, given_on: v.given_on, valid_until: v.valid_until }, String) })}>
                      {t('editBtn')}
                    </button>
                  )}
                  {v.mine && v.entry_id && clinical && (
                    <button type="button" className="btn btn-ghost" aria-label={t(v.confirmed ? 'rcUnconfirmL' : 'rcVoidL', { n: v.name })} onClick={() => ctx.openVoid({ entryId: v.entry_id!, title, confirmed: v.confirmed })}>
                      {t(v.confirmed ? 'rcUnconfirm' : 'rcVoid')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
