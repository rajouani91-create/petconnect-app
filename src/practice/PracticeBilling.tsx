import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, localeOf, type MessageKey } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Switch } from '../components/Switch';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import {
  FILTER_LABEL, INVOICE_FILTERS, PAY_LABEL, PAY_METHODS, SAMPLE_KEYS, SAMPLE_LABEL, STATUS_LABEL, STATUS_TONE, billingErrorKey, kpis, matchesFilter,
  money, payInvoice, practiceBilling, practiceInvoices, publishCatalog, samplePayload, saveBillingSettings, viewStatus, unpayInvoice,
  type BillingData, type BillingSettings, type CatalogItem, type InvoiceFilter, type InvoiceRow, type PayMethod, type SampleKey,
} from '../lib/billing';
import { usePractice } from './PracticeProvider';
import { ImportCard, PackagesCard } from './CatalogImport';

type Tab = 'invoices' | 'catalog' | 'settings';
const TABS: Tab[] = ['invoices', 'catalog', 'settings'];
const TAB_LABEL: Record<Tab, MessageKey> = { invoices: 'blTabInvoices', catalog: 'blTabCatalog', settings: 'blTabSettings' };
type Run = (fn: () => Promise<unknown>, ok: string, undo?: () => Promise<unknown>) => Promise<boolean>;

/** Abrechnung: Rechnungen mit Kennzahlen und Filtern, Leistungskatalog mit Versionen, Rechnungsdaten der Praxis. */
export function PracticeBilling() {
  const { t } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const uid = useId();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'invoices';
  const [data, setData] = useState<BillingData | null>(null);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; undo?: () => Promise<unknown> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([practiceBilling(), practiceInvoices()]);
      setData(b);
      setRows(r);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  useEffect(() => {
    if (!pending) void load();
  }, [load, pending]);

  const run: Run = useCallback(async (fn, ok, undo) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ ok: true, text: ok, ...(undo ? { undo } : {}) });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: t(billingErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const doUndo = async (u: () => Promise<unknown>) => {
    setBusy(true);
    try { await u(); await load(); setMsg({ ok: true, text: t('blUndone') }); } catch (e) { setMsg({ ok: false, text: t(billingErrorKey(e)) }); } finally { setBusy(false); }
  };

  return (
    <div className="page stack-lg">
      <div className="page-head page-head-row patients-head">
        <div>
          <h1>{t('blTitle')}</h1>
          <p className="muted">{t('blSub')}</p>
        </div>
        {!pending && (
          <div className="row-actions">
            <Link to="/praxis/abrechnung/neu" className={`btn btn-primary${data && !data.catalog ? ' is-disabled' : ''}`} aria-disabled={!!data && !data.catalog}
              onClick={(e) => { if (data && !data.catalog) { e.preventDefault(); setParams({ tab: 'catalog' }); } }}>{t('blNew')}</Link>
          </div>
        )}
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status"><p><strong>{t('pp_pendingTitle')}</strong></p><p>{t('scPending')}</p></div>
      ) : loadErr && !data ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !data || !rows ? <p className="muted">{t('loading')}</p> : (
        <>
          <div className="tabs" role="tablist" aria-label={t('blTitle')}>
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" id={`${uid}-${k}`} aria-selected={tab === k} aria-controls={`${uid}-panel`} className="tab"
                onClick={() => setParams(k === 'invoices' ? {} : { tab: k }, { replace: true })}>{t(TAB_LABEL[k])}</button>
            ))}
          </div>
          <div className="record-status" role="status" aria-live="polite">
            {msg && (
              <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>
                {msg.text}
                {msg.undo && <>{' '}<button type="button" className="link-btn" disabled={busy} onClick={() => void doUndo(msg.undo!)}>{t('blUndo')}</button></>}
              </p>
            )}
          </div>
          <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`} className="stack-lg">
            {tab === 'invoices' && <Invoices rows={rows} data={data} busy={busy} run={run} onCatalog={() => setParams({ tab: 'catalog' })} />}
            {tab === 'catalog' && <CatalogTab data={data} busy={busy} run={run} />}
            {tab === 'settings' && <SettingsTab data={data} busy={busy} run={run} />}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Rechnungen ----------

function Invoices({ rows, data, busy, run, onCatalog }: { rows: InvoiceRow[]; data: BillingData; busy: boolean; run: Run; onCatalog: () => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const now = useNow();
  const today = zonedNow(now).date;
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const k = useMemo(() => kpis(rows, today), [rows, today]);
  const cur = data.catalog?.currency ?? rows[0]?.currency ?? 'EUR';
  const shown = rows.filter((r) => matchesFilter(r, filter, today));
  const incomplete = !data.settings.tax_id && !data.settings.tax_number;
  return (
    <>
      {!data.catalog && (
        <div className="notice notice-info"><p>{t('blNoCatalog')}</p><p><button type="button" className="btn btn-secondary" onClick={onCatalog}>{t('blToCatalog')}</button></p></div>
      )}
      {incomplete && <p className="notice notice-warn">{t('blSettingsMissing')}{' '}<Link to="/praxis/abrechnung?tab=settings" className="link">{t('blTabSettings')}</Link></p>}
      <div className="tp-kpis">
        <section className="card tp-kpi"><h2 className="small muted">{t('blKOpen')}</h2><p className="tp-num">{money(k.open.sum, cur, locale)}</p><p className="small muted">{t('blKCount', { n: k.open.n })}</p></section>
        <section className="card tp-kpi"><h2 className="small muted">{t('blKOverdue')}</h2><p className={`tp-num${k.overdue.n ? ' tone-crit' : ''}`}>{money(k.overdue.sum, cur, locale)}</p><p className="small muted">{t('blKCount', { n: k.overdue.n })}</p></section>
        <section className="card tp-kpi"><h2 className="small muted">{t('blKPaid')}</h2><p className="tp-num">{money(k.paid.sum, cur, locale)}</p><p className="small muted">{t('blKCount', { n: k.paid.n })}</p></section>
        <section className="card tp-kpi"><h2 className="small muted">{t('blKDrafts')}</h2><p className="tp-num">{k.drafts}</p><p className="small muted">{t('blKDraftsSub')}</p></section>
      </div>
      <div className="chips-wrap" role="group" aria-label={t('blFilterL')}>
        {INVOICE_FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(FILTER_LABEL[f])} ({rows.filter((r) => matchesFilter(r, f, today)).length})
          </button>
        ))}
      </div>
      {shown.length === 0 ? <div className="card"><p className="muted">{t('blNone')}</p></div> : (
        <ul className="record-list card">
          {shown.map((r) => {
            const v = viewStatus(r, today);
            return (
              <li key={r.id} className="record-row bl-row">
                <div className="record-main">
                  <span className="record-title"><span className="mono">{r.number ?? t('blStDraft')}</span> <span className="muted">· {r.pet_label}{r.recipient_name ? ` · ${r.recipient_name}` : ''}</span></span>
                  <span className="small">
                    {r.kind === 'cancellation' ? t('blCancelsRef', { no: r.cancels_number ?? '–' }) : r.first_item ? (r.item_count > 1 ? t('blFirstMore', { a: r.first_item, n: r.item_count - 1 }) : r.first_item) : '–'}
                  </span>
                  <span className="small muted">
                    {t('blTreatOn', { d: formatIsoDate(r.treatment_date, lang) })}
                    {r.status === 'paid' && r.paid_on ? ` · ${t('blPaidOn', { d: formatIsoDate(r.paid_on, lang), m: t(PAY_LABEL[r.pay_method ?? 'transfer']) })}` : r.due_date && r.kind === 'invoice' && r.status === 'open' ? ` · ${t('blDueOn', { d: formatIsoDate(r.due_date, lang) })}` : ''}
                    {r.cancelled_by_number ? ` · ${t('blCancelledBy', { no: r.cancelled_by_number })}` : ''}
                  </span>
                </div>
                <span className="bl-amount mono">{money(Number(r.gross), r.currency, locale)}</span>
                <span className={`pill ${STATUS_TONE[v]}`}>{t(STATUS_LABEL[v])}</span>
                <div className="row-actions">
                  <Link to={`/praxis/abrechnung/${r.id}`} className="btn btn-secondary">{t(r.status === 'draft' ? 'blEditDraft' : 'blView')}</Link>
                  {r.status === 'open' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setPaying(r)}>{t('blPayBtn')}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <section className="card stack bl-later">
        <h2 className="h-sub">{t('blLaterTitle')}</h2>
        <ul className="small muted">{t('blLaterList').split('|').map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      {paying && <PayDialog row={paying} busy={busy} onClose={() => setPaying(null)}
        onSave={async (date, method) => {
          if (await run(() => payInvoice(paying.id, date, method), t('blPaid', { no: paying.number ?? '' }), () => unpayInvoice(paying.id))) setPaying(null);
        }} />}
    </>
  );
}

export function PayDialog({ row, busy, onClose, onSave }: { row: { number: string | null; gross: number; currency: string; invoice_date: string | null }; busy: boolean; onClose: () => void; onSave: (date: string, method: PayMethod) => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PayMethod>('transfer');
  const submit = (e: FormEvent) => { e.preventDefault(); if (date) onSave(date, method); };
  return (
    <Dialog open title={t('blPayTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy || !date}>{t('blPaySave')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={submit} noValidate>
        <p><span className="mono">{row.number}</span> · <strong>{money(Number(row.gross), row.currency, localeOf(lang))}</strong></p>
        <Field id={`${uid}-d`} label={t('blPayDate')} required>
          {(a) => <input {...a} type="date" max={today} min={row.invoice_date ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <fieldset className="field">
          <legend>{t('blPayMethod')}</legend>
          <div className="chips-wrap">
            {PAY_METHODS.map((m) => <button key={m} type="button" className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>{t(PAY_LABEL[m])}</button>)}
          </div>
        </fieldset>
        <p className="small muted note-line">{t('blPayNote')}</p>
      </form>
    </Dialog>
  );
}

// ---------- Leistungskatalog ----------

function CatalogTab({ data, busy, run }: { data: BillingData; busy: boolean; run: Run }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const c = data.catalog;
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [sample, setSample] = useState<SampleKey | null>(null);
  const [q, setQ] = useState('');
  const items = (c?.items ?? []).filter((i) => !q.trim() || `${i.code} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const num = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(x);
  return (
    <>
      {c ? (
        <section className="card stack" aria-labelledby="cat-h">
          <div className="tp-list-head">
            <h2 id="cat-h">{t('blCatActive')}</h2>
            {data.can_edit && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAdding(true)}>{t('blCatAdd')}</button>}
          </div>
          <p><strong>{c.name}</strong> · {t('blCatVersion', { v: c.version })} · {c.currency} · {t('blCatFrom', { d: formatIsoDate(c.valid_from, lang) })} · {t('blCatItems', { n: c.items.length })}</p>
          <p className="small muted">{t('blCatOwn', { p: data.practice.name })} {t('blCatNet')}</p>
          <input type="search" className="input" placeholder={t('blSearch')} aria-label={t('blSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="table-scroll">
            <table className="vault-table bl-cat">
              <thead><tr><th scope="col">{t('blColNo')}</th><th scope="col">{t('blColItem')}</th><th scope="col" className="num">{t('blColPrice')}</th><th scope="col">{t('blColFactor')}</th><th scope="col" className="num">{t('blColTax')}</th><th scope="col">{t('blColValid')}</th>{data.can_edit && <th scope="col"><span className="sr-only">{t('blCatEdit')}</span></th>}</tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.code}</td>
                    <td>{i.name}{i.description && <span className="small muted"><br />{i.description}</span>}</td>
                    <td className="num">{money(Number(i.price), c.currency, locale)}</td>
                    <td>{Number(i.factor_max) > Number(i.factor_min) ? `${num(i.factor_min)}–${num(i.factor_max)}` : num(i.factor)}</td>
                    <td className="num">{num(i.tax_rate)} %</td>
                    <td className="small">{i.valid_from || i.valid_to ? `${i.valid_from ? formatIsoDate(i.valid_from, lang) : '…'} – ${i.valid_to ? formatIsoDate(i.valid_to, lang) : '…'}` : t('blValidAlways')}</td>
                    {data.can_edit && <td><button type="button" className="btn btn-ghost" disabled={busy} aria-label={t('blCatEditL', { n: i.name })} onClick={() => setEditing(i)}>{t('blCatEdit')}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="card stack">
          <h2>{t('blNoCatalogTitle')}</h2>
          <p>{t('blNoCatalog')}</p>
        </div>
      )}
      {data.can_edit ? (
        <section className="card stack" aria-labelledby="cat-sample">
          <h2 id="cat-sample">{t('blSampleTitle')}</h2>
          <p className="muted">{t('blSampleSub')}</p>
          <div className="chips-wrap">
            {SAMPLE_KEYS.map((k) => <button key={k} type="button" className="chip" disabled={busy} onClick={() => setSample(k)}>{t(SAMPLE_LABEL[k])}</button>)}
          </div>
          <p className="small muted note-line">{t('blSampleNote')}</p>
        </section>
      ) : <p className="small muted">{t('blLeadOnly')}</p>}
      {data.can_edit && <ImportCard data={data} busy={busy} run={run} />}
      {c && <PackagesCard data={data} busy={busy} run={run} />}
      {data.versions.length > 0 && (
        <section className="card stack" aria-labelledby="cat-ver">
          <h2 id="cat-ver">{t('blVersions')}</h2>
          <ul className="record-list">
            {data.versions.map((v) => (
              <li key={v.id} className="record-row">
                <div className="record-main">
                  <span className="record-title"><span className="mono">{v.version}</span> · {v.name}</span>
                  <span className="small muted">{t('blVerMeta', { d: formatIsoDate(v.valid_from, lang), n: v.items, by: v.created_by_name ?? '–' })}</span>
                </div>
                <span className="small">{t('blVerUsed', { n: v.used })}</span>
                <span className={`pill ${v.active ? 'pill-ok' : ''}`}>{t(v.active ? 'blVerActive' : 'blVerOld')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && c && <ItemDialog item={editing} currency={c.currency} busy={busy} onClose={() => setEditing(null)}
        onSave={async (it) => { if (await run(() => publishCatalog({ mode: 'merge', items: [it] }), t('blCatSaved'))) setEditing(null); }} />}
      {adding && c && <ItemDialog item={null} currency={c.currency} busy={busy} onClose={() => setAdding(false)} taken={c.items.map((i) => i.code)}
        onSave={async (it) => { if (await run(() => publishCatalog({ mode: 'merge', items: [it] }), t('blCatSaved'))) setAdding(false); }} />}
      {sample && (
        <Dialog open title={t('blSampleConfirmTitle')} onClose={() => setSample(null)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSample(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={async () => { if (await run(() => publishCatalog(samplePayload(sample)), t('blSampleDone'))) setSample(null); }}>{t('blSampleConfirm')}</button>
          </>
        }>
          <p>{t(c ? 'blSampleReplace' : 'blSampleFirst', { s: t(SAMPLE_LABEL[sample]) })}</p>
        </Dialog>
      )}
    </>
  );
}

interface ItemForm { code: string; name: string; description: string; price: string; factor_min: string; factor_max: string; tax_rate: string; valid_from: string; valid_to: string }
const toNum = (s: string) => Number(s.replace(',', '.').trim());

function ItemDialog({ item, currency, busy, onClose, onSave, taken = [] }: {
  item: CatalogItem | null; currency: string; busy: boolean; onClose: () => void; taken?: string[];
  onSave: (it: { code: string; name: string; description: string | null; price: number; factor: number; factor_min: number; factor_max: number; tax_rate: number; valid_from: string | null; valid_to: string | null }) => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<ItemForm>(() => ({
    code: item?.code ?? '', name: item?.name ?? '', description: item?.description ?? '', price: item ? String(item.price) : '',
    factor_min: String(item?.factor_min ?? 1), factor_max: String(item?.factor_max ?? 1), tax_rate: String(item?.tax_rate ?? 19),
    valid_from: item?.valid_from ?? '', valid_to: item?.valid_to ?? '',
  }));
  const [err, setErr] = useState<Partial<Record<keyof ItemForm, MessageKey>>>({});
  const set = (k: keyof ItemForm, x: string) => { setV((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: undefined })); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Partial<Record<keyof ItemForm, MessageKey>> = {};
    const code = v.code.trim().toUpperCase();
    if (!item && (!code || code.length > 20)) er.code = 'blErrCode';
    else if (!item && taken.includes(code)) er.code = 'blErrCodeTaken';
    if (!v.name.trim()) er.name = 'blErrName';
    const price = toNum(v.price), fmin = toNum(v.factor_min), fmax = toNum(v.factor_max), tax = toNum(v.tax_rate);
    if (!Number.isFinite(price) || price < 0 || price > 100000) er.price = 'blErrPrice';
    if (!(fmin > 0 && fmax >= fmin && fmax <= 10)) er.factor_max = 'blErrFactor';
    if (!Number.isFinite(tax) || tax < 0 || tax > 30) er.tax_rate = 'blErrTaxRate';
    if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) er.valid_to = 'blErrDate';
    setErr(er);
    if (Object.keys(er).length) return;
    onSave({ code: item?.code ?? code, name: v.name.trim(), description: v.description.trim() || null, price, factor: fmin, factor_min: fmin, factor_max: fmax, tax_rate: tax, valid_from: v.valid_from || null, valid_to: v.valid_to || null });
  };
  const e = (k: keyof ItemForm) => (err[k] ? { key: err[k]! } : undefined);
  return (
    <Dialog open title={item ? t('blCatEditTitle', { c: item.code }) : t('blCatAdd')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy}>{t('blCatSaveVersion')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={submit} noValidate>
        <p className="small muted">{t('blCatVersionHint')}</p>
        {!item && (
          <Field id={`${uid}-c`} label={t('blColNo')} error={e('code')} required>
            {(a) => <input {...a} type="text" maxLength={20} autoComplete="off" value={v.code} onChange={(x) => set('code', x.target.value)} />}
          </Field>
        )}
        <Field id={`${uid}-n`} label={t('blColItem')} error={e('name')} required>
          {(a) => <input {...a} type="text" maxLength={120} value={v.name} onChange={(x) => set('name', x.target.value)} />}
        </Field>
        <Field id={`${uid}-ds`} label={t('blColDesc')} optional>
          {(a) => <input {...a} type="text" maxLength={200} value={v.description} onChange={(x) => set('description', x.target.value)} />}
        </Field>
        <div className="row-2">
          <Field id={`${uid}-p`} label={t('blPriceNet', { c: currency })} error={e('price')} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.price} onChange={(x) => set('price', x.target.value)} />}
          </Field>
          <Field id={`${uid}-t`} label={t('blTaxRate')} error={e('tax_rate')} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.tax_rate} onChange={(x) => set('tax_rate', x.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field id={`${uid}-f1`} label={t('blFactorMin')} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.factor_min} onChange={(x) => set('factor_min', x.target.value)} />}
          </Field>
          <Field id={`${uid}-f2`} label={t('blFactorMax')} error={e('factor_max')} hint={t('blFactorHint')} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.factor_max} onChange={(x) => set('factor_max', x.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field id={`${uid}-v1`} label={t('blValidFrom')} optional>
            {(a) => <input {...a} type="date" value={v.valid_from} onChange={(x) => set('valid_from', x.target.value)} />}
          </Field>
          <Field id={`${uid}-v2`} label={t('blValidTo')} error={e('valid_to')} optional>
            {(a) => <input {...a} type="date" value={v.valid_to} onChange={(x) => set('valid_to', x.target.value)} />}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- Rechnungsdaten ----------

function SettingsTab({ data, busy, run }: { data: BillingData; busy: boolean; run: Run }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<BillingSettings>(data.settings);
  const set = <K extends keyof BillingSettings>(k: K, x: BillingSettings[K]) => setV((o) => ({ ...o, [k]: x }));
  const ro = !data.can_edit;
  const p = data.practice;
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => saveBillingSettings(v), t('blSettingsSaved')); };
  const txt = (k: 'legal_name' | 'tax_id' | 'tax_number' | 'iban' | 'bic' | 'bank', label: MessageKey, max: number, hint?: MessageKey) => (
    <Field id={`${uid}-${k}`} label={t(label)} hint={hint ? t(hint) : undefined} optional={k !== 'legal_name'}>
      {(a) => <input {...a} type="text" maxLength={max} readOnly={ro} value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );
  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <section className="card stack" aria-labelledby={`${uid}-h1`}>
        <h2 id={`${uid}-h1`}>{t('blSetIssuer')}</h2>
        <p className="small muted">{t('blSetIssuerSub')}</p>
        {txt('legal_name', 'blSetLegalName', 120)}
        <p className="small">{t('blSetAddress')}: {[[p.street, p.housenumber].filter(Boolean).join(' '), [p.postcode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}{' '}<Link to="/praxis/profil" className="link">{t('blSetAddressEdit')}</Link></p>
        <div className="row-2">
          {txt('tax_number', 'blSetTaxNumber', 30)}
          {txt('tax_id', 'blSetTaxId', 30)}
        </div>
        <p className="small muted">{t('blSetTaxHint')}</p>
        <Switch label={t('blSetSmallBusiness')} checked={v.small_business} disabled={ro} onChange={(on) => set('small_business', on)} />
      </section>
      <section className="card stack" aria-labelledby={`${uid}-h2`}>
        <h2 id={`${uid}-h2`}>{t('blSetBank')}</h2>
        {txt('iban', 'blSetIban', 42)}
        <div className="row-2">
          {txt('bic', 'blSetBic', 11)}
          {txt('bank', 'blSetBankName', 80)}
        </div>
        <Field id={`${uid}-days`} label={t('blSetDays')} required>
          {(a) => <input {...a} type="number" min={0} max={90} readOnly={ro} value={v.payment_days} onChange={(e) => set('payment_days', Number(e.target.value))} />}
        </Field>
      </section>
      <section className="card stack" aria-labelledby={`${uid}-h3`}>
        <h2 id={`${uid}-h3`}>{t('blSetMore')}</h2>
        <Switch label={t('blSetFree')} checked={v.allow_free} disabled={ro} onChange={(on) => set('allow_free', on)} />
        <p className="small muted">{t('blSetFreeSub')}</p>
        <Field id={`${uid}-foot`} label={t('blSetFooter')} optional>
          {(a) => <textarea {...a} rows={2} maxLength={300} readOnly={ro} value={v.footer ?? ''} onChange={(e) => set('footer', e.target.value)} />}
        </Field>
      </section>
      {ro ? <p className="small muted">{t('blLeadOnly')}</p> : <div className="row-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{t('blSettingsSave')}</button></div>}
      <p className="small muted note-line">{t('blLegalNote')}</p>
    </form>
  );
}
