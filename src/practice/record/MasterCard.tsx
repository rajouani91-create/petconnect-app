import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, formatIsoDateShort, localeOf, type MessageKey } from '../../i18n';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { Phone } from '../../components/more/shared';
import { chartPoints, formatKg } from '../../lib/record';
import { entryForm, reasonError, updateMaster, type MasterInput, type Reason, type RecWeight } from '../../lib/practiceRecord';
import { ReasonFields, type RecordCtx } from './shared';

/** Stammdaten, Halter:in und Gewicht mit Kurve. Bearbeiten nur mit Grund; „geändert“ öffnet den Verlauf. */
export function MasterCard({ ctx }: { ctx: RecordCtx }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const { rec } = ctx;
  const p = rec.pet;
  const dash = <span className="muted">{t('notSet')}</span>;
  const kg = (n: number) => t('wkKgValue', { kg: formatKg(Number(n), locale) });
  const last = rec.weights[0];

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <div className="card-head">
        <h2 id={`${uid}-h`}>{t('masterH')}</h2>
        {rec.master_changed && (
          <button type="button" className="link-btn small" onClick={() => ctx.openLog({ entryId: null, title: `${t('masterH')} · ${p.name}` })}>✎ {t('rcChanged')}</button>
        )}
      </div>
      <dl className="kv kv-2">
        <dt>{t('sex')}</dt>
        <dd>{p.sex === 'female' ? t('sexF') : p.sex === 'male' ? t('sexM') : dash}</dd>
        <dt>{t('birth')}</dt>
        <dd>{p.birth_date ? formatIsoDate(p.birth_date, lang) : dash}</dd>
        <dt>{t('chip')}</dt>
        <dd className="mono">{p.chip_no?.trim() ? p.chip_no : dash}</dd>
        <dt>{t('allergies')}</dt>
        <dd>{p.allergies?.trim() ? p.allergies : dash}</dd>
        <dt>{t('ptOwner')}</dt>
        <dd>{p.owner_name?.trim() ? p.owner_name : dash}</dd>
        <dt>{t('pf_phone')}</dt>
        <dd><Phone v={p.owner_phone} /></dd>
        <dt>{t('ptWeight')}</dt>
        <dd>{last ? t('ptWeightVal', { kg: formatKg(Number(last.kg), locale), d: formatIsoDate(last.measured_on, lang) }) : dash}</dd>
      </dl>
      {rec.weights.length >= 2 && <WeightChart rows={rec.weights} kg={kg} />}
      <div className="actions actions-start">
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>{t('rcMasterEdit')}</button>
        {last?.mine && last.entry_id && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => ctx.openEdit({ kind: 'weight', entryId: last.entry_id!, title: `${t('hsKindWeight')} · ${kg(last.kg)}`, values: entryForm('weight', { kg: last.kg, measured_on: last.measured_on }, (n) => formatKg(n, locale)) })}
          >
            {t('rcWeightFix')}
          </button>
        )}
        {last?.mine && last.entry_id && (
          <button type="button" className="btn btn-ghost" onClick={() => ctx.openVoid({ entryId: last.entry_id!, title: `${t('hsKindWeight')} · ${kg(last.kg)}` })}>{t('rcVoid')}</button>
        )}
      </div>
      {editing && <MasterDialog ctx={ctx} onClose={() => setEditing(false)} />}
    </section>
  );
}

function WeightChart({ rows, kg }: { rows: RecWeight[]; kg: (n: number) => string }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const W = 320;
  const H = 120;
  const shown = rows.slice(0, 24);
  const pts = chartPoints(shown.map((r) => ({ ...r, created_at: '' })), W, H, 12);
  const oldest = shown[shown.length - 1]!;
  const newest = shown[0]!;
  const kgs = shown.map((r) => Number(r.kg));
  return (
    <figure className="weight-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} preserveAspectRatio="none">
        <title id={`${uid}-t`}>{t('wkChartL', { from: kg(oldest.kg), to: kg(newest.kg), d1: formatIsoDateShort(oldest.measured_on, lang), d2: formatIsoDateShort(newest.measured_on, lang) })}</title>
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} className="chart-axis" />
        <polyline points={pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} className="chart-line" fill="none" />
        {pts.map((q, i) => <circle key={shown[shown.length - 1 - i]!.id} cx={q.x} cy={q.y} r="4" className="chart-dot" />)}
      </svg>
      <figcaption className="muted small chart-range">
        <span>{t('wkMin', { kg: kg(Math.min(...kgs)) })}</span>
        <span>{t('wkMax', { kg: kg(Math.max(...kgs)) })}</span>
      </figcaption>
    </figure>
  );
}

function MasterDialog({ ctx, onClose }: { ctx: RecordCtx; onClose: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const p = ctx.rec.pet;
  const [v, setV] = useState<MasterInput>({ name: p.name, breed: p.breed ?? '', sex: p.sex ?? '', birth_date: p.birth_date ?? '', chip_no: p.chip_no ?? '', allergies: p.allergies ?? '' });
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<{ name?: MessageKey; birth?: MessageKey; reason: MessageKey | null }>({ reason: null });
  const set = (k: keyof MasterInput, x: string) => setV((c) => ({ ...c, [k]: x }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: v.name.trim() ? undefined : ('rcErrName' as const),
      birth: v.birth_date && v.birth_date > ctx.today ? ('errFuture' as const) : undefined,
      reason: reasonError(reason, note),
    };
    setErrs(next);
    if (next.name || next.birth || next.reason || !reason) return;
    if (await ctx.run(() => updateMaster(ctx.petId, v, reason, note), t('rcMasterSaved'))) onClose();
  }

  return (
    <Dialog open title={t('rcMasterEdit')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
        <button type="submit" form={`${uid}-form`} className="btn btn-primary" disabled={ctx.busy}>{t('saveBtn')}</button>
      </>
    }>
      <form id={`${uid}-form`} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <Field id={`${uid}-name`} label={t('pp_name')} error={errs.name ? { key: errs.name } : undefined} required>
          {(a) => <input {...a} type="text" maxLength={60} autoComplete="off" value={v.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field id={`${uid}-breed`} label={t('breed')} optional>
          {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={v.breed} onChange={(e) => set('breed', e.target.value)} />}
        </Field>
        <Field id={`${uid}-sex`} label={t('sex')} optional>
          {(a) => (
            <select {...a} value={v.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">{t('notSet')}</option>
              <option value="female">{t('sexF')}</option>
              <option value="male">{t('sexM')}</option>
            </select>
          )}
        </Field>
        <Field id={`${uid}-birth`} label={t('birth')} error={errs.birth ? { key: errs.birth } : undefined} optional>
          {(a) => <input {...a} type="date" max={ctx.today} value={v.birth_date} onChange={(e) => set('birth_date', e.target.value)} />}
        </Field>
        <Field id={`${uid}-chip`} label={t('chip')} optional>
          {(a) => <input {...a} type="text" inputMode="numeric" maxLength={40} autoComplete="off" value={v.chip_no} onChange={(e) => set('chip_no', e.target.value)} />}
        </Field>
        <Field id={`${uid}-all`} label={t('allergies')} optional>
          {(a) => <textarea {...a} rows={2} maxLength={500} value={v.allergies} onChange={(e) => set('allergies', e.target.value)} />}
        </Field>
        <ReasonFields reason={reason} note={note} setReason={setReason} setNote={setNote} error={errs.reason} uid={uid} />
        <p className="muted small">{t('rcMasterNote')}</p>
      </form>
    </Dialog>
  );
}
