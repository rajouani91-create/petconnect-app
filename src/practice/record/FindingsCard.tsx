import { useId } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate } from '../../i18n';
import { entryForm, isClinical } from '../../lib/practiceRecord';
import { EnteredBy, type RecordCtx } from './shared';

/** Befunde und Behandlungen – nur Praxen tragen sie ein; die Halter:in liest mit. */
export function FindingsCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { rec } = ctx;
  const clinical = isClinical(rec.role);
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('rcFindH')}</h2>
      {rec.findings.length === 0 ? <p className="muted">{t('rcFindNone')}</p> : (
        <ul className="record-list">
          {rec.findings.map((f) => {
            const title = `${t('hsKindDoc')} · ${f.title}`;
            return (
              <li key={f.id} className="record-row">
                <div className="record-main">
                  <span className="record-title">{f.title}</span>
                  <span className="muted small">{formatIsoDate(f.date, lang)}{f.time ? ` · ${f.time}` : ''}{!f.mine && ` · ${f.practice_name}`}</span>
                  {f.text && <span className="pre-line">{f.text}</span>}
                  <EnteredBy at={f.entered_at} by={f.by_name} changed={f.changed && f.mine} onLog={() => ctx.openLog({ entryId: f.id, title })} />
                </div>
                {f.mine && clinical && (
                  <div className="row-actions">
                    <button type="button" className="btn btn-ghost" aria-label={t('rcEditL', { n: f.title })} onClick={() => ctx.openEdit({ kind: 'finding', entryId: f.id, title, values: entryForm('finding', { date: f.date, time: f.time ?? null, title: f.title, text: f.text }, String) })}>
                      {t('editBtn')}
                    </button>
                    <button type="button" className="btn btn-ghost" aria-label={t('rcVoidL', { n: f.title })} onClick={() => ctx.openVoid({ entryId: f.id, title })}>{t('rcVoid')}</button>
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
