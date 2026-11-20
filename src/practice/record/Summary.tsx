// Patientenakte, Variante B (Release B): Kopf mit Tier, Allergie und heutigem Termin; Übersicht in kompakten Karten.
// Jeder Knopf öffnet das passende Formular oder die ganze Liste in der Leiste rechts.
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, formatIsoDateShort, localeOf } from '../../i18n';
import { speciesName, Phone } from '../../components/more/shared';
import { VACC_STATUS_LABEL, formatKg, vaccStatus } from '../../lib/record';
import { berlinHHMM } from '../../lib/medication';
import { berlinDay } from '../../lib/monthReport';
import { KIND_LABEL as VITAL_LABEL, VITAL_KINDS } from '../../lib/vital';
import { STATUS_LABEL, STATUS_TONE, money, viewStatus } from '../../lib/billing';
import { timeOf } from '../../lib/practiceAppointments';
import { canWrite, filterVaccinations, isClinical } from '../../lib/practiceRecord';
import type { RecordCtx } from './shared';
import type { TreatmentBilling } from './TreatmentForm';
import { vitalText } from './VitalsCard';

export type Panel = 'treat' | 'vacc' | 'vital' | 'med' | 'findings' | 'vaccList' | 'medList' | 'vitalList' | 'master';

export function PatientHead({ ctx, bill, open }: { ctx: RecordCtx; bill: TreatmentBilling; open: (p: Panel) => void }) {
  const { t, lang } = useI18n();
  const p = ctx.rec.pet;
  const last = ctx.rec.weights[0];
  const meta = [
    p.species ? speciesName({ species: p.species, species_other: p.species_other }, t) : '', p.breed,
    p.sex === 'female' ? t('sexF') : p.sex === 'male' ? t('sexM') : '',
    last ? t('wkKgValue', { kg: formatKg(Number(last.kg), localeOf(lang)) }) : '',
  ].filter(Boolean).join(' · ');
  const appt = bill.appt;
  return (
    <section className="card pt-head" aria-label={p.name}>
      <div className="pt-avatar" aria-hidden="true">{p.name.trim().charAt(0).toUpperCase() || '?'}</div>
      <div className="pt-head-main">
        <div className="pt-head-name">
          <h1>{p.name}{p.deceased && <span className="muted"> · {t('ptDeceased')}</span>}</h1>
          {meta && <span className="muted">{meta}</span>}
        </div>
        <div className="muted small pt-head-owner">
          {p.owner_name && <span>{p.owner_name}</span>}
          {p.owner_phone && <Phone v={p.owner_phone} />}
          {p.chip_no?.trim() && <span>{t('chip')} <span className="mono">{p.chip_no}</span></span>}
        </div>
        <div className="chips-wrap">
          {p.allergies?.trim() && <span className="pill pill-warn">{t('allergies')}: {p.allergies.trim()}</span>}
          {appt && <span className="pill pill-ok">{t('rcApptToday', { t: timeOf(appt.starts_at), type: appt.type_name })}</span>}
        </div>
      </div>
      <div className="row-actions pt-head-actions">
        {isClinical(ctx.rec.role) && !p.deceased && (
          <button type="button" className="btn btn-primary" onClick={() => open('treat')}>+ {t('blTrTitle')}</button>
        )}
        <Link to="impfnachweis" className="btn btn-secondary">{t('cfLink')}</Link>
      </div>
    </section>
  );
}

function SumCard({ title, action, children, more }: { title: string; action?: ReactNode; children: ReactNode; more?: ReactNode }) {
  const uid = useId();
  return (
    <section className="card stack pt-card" aria-labelledby={`${uid}-h`}>
      <div className="card-head">
        <h2 id={`${uid}-h`}>{title}</h2>
        {action}
      </div>
      <div className="stack-sm pt-card-body">{children}</div>
      {more}
    </section>
  );
}

export function SummaryGrid({ ctx, bill, open }: { ctx: RecordCtx; bill: TreatmentBilling; open: (p: Panel) => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const { rec } = ctx;
  const alive = !rec.pet.deceased;
  const clinical = isClinical(rec.role) && alive;
  const add = (label: string, p: Panel) => <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(p)}>+ {label}</button>;
  const moreBtn = (label: string, p: Panel) => <button type="button" className="link-btn pt-more" onClick={() => open(p)}>{label}</button>;

  const vaccs = filterVaccinations(rec.vaccinations, 'all');
  const unverified = rec.vaccinations.filter((v) => v.source === 'owner').length;
  const activeMeds = rec.medications.filter((m) => !m.stopped_on && (!m.ends_on || m.ends_on >= ctx.today));
  const lastVital = (k: (typeof VITAL_KINDS)[number]) => rec.vitals.find((v) => v.kind === k);
  const w = rec.weights[0];

  return (
    <div className="pt-grid">
      <SumCard title={t('rcFindH')} action={clinical ? add(t('rcTreatShort'), 'treat') : undefined}
        more={rec.findings.length > 0 ? moreBtn(t('rcShowAll', { n: rec.findings.length }), 'findings') : undefined}>
        {rec.findings.length === 0 ? <p className="muted small">{t('rcFindNone')}</p> : rec.findings.slice(0, 2).map((f) => (
          <div key={f.id} className="pt-item">
            <span className="mono muted small">{formatIsoDateShort(f.date, lang)}{f.time ? ` ${f.time}` : ''}</span>
            <strong>{f.title}</strong>
            <span className="muted small">{f.by_name}{!f.mine ? ` · ${f.practice_name}` : ''}</span>
          </div>
        ))}
      </SumCard>

      <SumCard title={t('rcVaccH')} action={clinical ? add(t('rcVaccShort'), 'vacc') : undefined}
        more={moreBtn(unverified ? t('rcShowAllConfirm', { n: unverified }) : t('rcShowAll', { n: rec.vaccinations.length }), 'vaccList')}>
        {vaccs.length === 0 ? <p className="muted small">{t('rcVaccNone')}</p> : vaccs.slice(0, 4).map((v) => {
          const st = vaccStatus(v.valid_until, ctx.today);
          return (
            <div key={v.id} className="pt-line">
              <span>{v.name}{v.source === 'owner' && <span className="muted small"> · {t('rcByOwner')}</span>}</span>
              {st ? <span className={`pill vacc-${st}`}>{t(VACC_STATUS_LABEL[st])}{v.valid_until && st !== 'expired' ? ` · ${formatIsoDateShort(v.valid_until, lang)}` : ''}</span> : <span className="muted small">–</span>}
            </div>
          );
        })}
      </SumCard>

      <SumCard title={t('rcVitalsH')} action={alive && canWrite(rec.role, 'vital') ? add(t('rcVitalShort'), 'vital') : undefined}
        more={moreBtn(t('rcVitalsHistory'), 'vitalList')}>
        <div className="pt-tiles">
          <div className="pt-tile">
            <span className="small muted">{t('hsKindWeight')}</span>
            <strong>{w ? t('wkKgValue', { kg: formatKg(Number(w.kg), locale) }) : '–'}</strong>
            <span className="small muted">{w ? formatIsoDateShort(w.measured_on, lang) : ''}</span>
          </div>
          {VITAL_KINDS.map((k) => {
            const v = lastVital(k);
            return (
              <div key={k} className="pt-tile">
                <span className="small muted">{t(VITAL_LABEL[k])}</span>
                <strong>{v ? vitalText(t, lang, k, v.value) : '–'}</strong>
                <span className="small muted">{v ? `${formatIsoDateShort(berlinDay(v.measured_at), lang)} ${berlinHHMM(v.measured_at)}` : ''}</span>
              </div>
            );
          })}
        </div>
      </SumCard>

      <SumCard title={t('mdTitle')} action={clinical ? add(t('rcMedShort'), 'med') : undefined}
        more={rec.medications.length > 0 ? moreBtn(t('rcShowAll', { n: rec.medications.length }), 'medList') : undefined}>
        {activeMeds.length === 0 ? <p className="muted small">{t('rcMedNoneActive')}</p> : activeMeds.slice(0, 3).map((m) => (
          <div key={m.id} className="pt-item">
            <strong>{m.name}</strong>
            <span className="small">{m.dosage_text ?? ''}</span>
            <span className="muted small">{[m.ends_on ? t('rcMedUntil', { d: formatIsoDate(m.ends_on, lang) }) : t('rcMedOngoing'), m.reason, m.source === 'owner' ? t('rcByOwner') : null].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </SumCard>

      <SumCard title={t('blOwnTitle')} action={alive ? <Link to={`/praxis/abrechnung/neu?tier=${ctx.petId}`} className="btn btn-secondary btn-sm">+ {t('rcInvoiceShort')}</Link> : undefined}
        more={bill.invoices.length > 3 ? <Link to="/praxis/abrechnung" className="link pt-more">{t('rcShowAll', { n: bill.invoices.length })}</Link> : undefined}>
        {bill.invoices.length === 0 ? <p className="muted small">{t('rcInvoicesNone')}</p> : bill.invoices.slice(0, 3).map((r) => {
          const vs = viewStatus(r, ctx.today);
          return (
            <div key={r.id} className="pt-line">
              <Link to={`/praxis/abrechnung/${r.id}`} className="link">{r.number ?? t('blStDraft')} · {money(Number(r.gross), r.currency, locale)}</Link>
              <span className={`pill ${STATUS_TONE[vs]}`}>{t(STATUS_LABEL[vs])}</span>
            </div>
          );
        })}
      </SumCard>

      <SumCard title={t('rcMasterHistH')} action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => open('master')}>{t('rcOpen')}</button>}>
        <div className="pt-line"><span className="muted small">{t('birth')}</span><span>{rec.pet.birth_date ? formatIsoDate(rec.pet.birth_date, lang) : '–'}</span></div>
        <div className="pt-line"><span className="muted small">{t('chip')}</span><span className="mono">{rec.pet.chip_no?.trim() || '–'}</span></div>
        <div className="pt-line"><span className="muted small">{t('hsTitle')}</span><span>{rec.history?.updated_at ? t('rcHistFilled', { d: formatIsoDate(rec.history.updated_at.slice(0, 10), lang) }) : t('rcHistEmpty')}</span></div>
      </SumCard>
    </div>
  );
}
