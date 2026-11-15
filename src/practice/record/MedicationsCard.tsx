import { useId } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, localeOf } from '../../i18n';
import { MED_STATUS_LABEL, doseText, lastDay, medStatus } from '../../lib/medication';
import { endMedication, entryForm, isClinical, type RecMedication } from '../../lib/practiceRecord';
import { EnteredBy, type RecordCtx } from './shared';

/** Medikation: laufende zuerst. Einträge der Halter:in sind für die Praxis nur lesbar. */
export function MedicationsCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { rec } = ctx;
  const clinical = isClinical(rec.role);
  const d = (iso: string) => formatIsoDate(iso, lang);
  const status = (m: RecMedication) => medStatus(m, ctx.today);
  const rows = [...rec.medications].sort((a, b) => Number(status(a) === 'ended') - Number(status(b) === 'ended'));

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('mdTitle')}</h2>
      {rows.length === 0 ? <p className="muted">{t('mdNone')}</p> : (
        <ul className="record-list">
          {rows.map((m) => {
            const st = status(m);
            const end = lastDay(m);
            const title = `${t('hsKindMed')} · ${m.name}`;
            const own = m.mine && !!m.entry_id;
            return (
              <li key={m.id} className={`record-row${st === 'ended' ? ' is-closed' : ''}`}>
                <div className="record-main">
                  <span className="record-title">
                    {m.name}
                    <span className={`pill med-${st}`}>{t(MED_STATUS_LABEL[st])}</span>
                  </span>
                  <span className="med-dose">{doseText(m, t, localeOf(lang), !m.dosage_text)}</span>
                  {m.reason && <span className="muted small">{m.reason}</span>}
                  <span className="muted small">{[t('mdSince', { d: d(m.starts_on) }), end && t('mdUntil', { d: d(end) })].filter(Boolean).join(' · ')}</span>
                  {m.source === 'owner' ? (
                    <span className="small owner-note">{t('rcMedByOwner')}</span>
                  ) : (
                    <span className="small practice-note">{t('rcFromPractice', { p: m.practice_name ?? t('vltSrcPractice') })}</span>
                  )}
                  {m.source === 'practice' && <EnteredBy at={m.entered_at} by={m.by_name} changed={m.changed && m.mine} onLog={m.entry_id ? () => ctx.openLog({ entryId: m.entry_id, title }) : undefined} />}
                </div>
                {own && clinical && (
                  <div className="row-actions">
                    {st !== 'ended' && (
                      <button type="button" className="btn btn-ghost" disabled={ctx.busy} aria-label={t('rcEndL', { n: m.name })} onClick={() => void ctx.run(() => endMedication(m.entry_id!), t('rcEnded', { n: m.name }))}>
                        {t('mdStop')}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" aria-label={t('rcEditL', { n: m.name })} onClick={() => ctx.openEdit({ kind: 'medication', entryId: m.entry_id!, title, values: entryForm('medication', { name: m.name, dosage: m.dosage_text, reason: m.reason, starts_on: m.starts_on, ends_on: m.ends_on }, String) })}>
                      {t('editBtn')}
                    </button>
                    <button type="button" className="btn btn-ghost" aria-label={t('rcVoidL', { n: m.name })} onClick={() => ctx.openVoid({ entryId: m.entry_id!, title })}>{t('rcVoid')}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
