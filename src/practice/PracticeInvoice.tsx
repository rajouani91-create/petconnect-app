import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { localeOf, type MessageKey } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { IconBack } from '../components/Icons';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import { practicePatients, type PatientRow } from '../lib/practiceAccess';
import {
  STATUS_LABEL, STATUS_TONE, billingErrorKey, cancelInvoice, clampFactor, createInvoice, discardInvoice, finalizeInvoice, lineNet, missingForFinalize,
  money, payInvoice, practiceBilling, practiceInvoice, publishCatalog, saveInvoice, totals, unpayInvoice, validOn, viewStatus,
  type BillingData, type DraftPayload, type Invoice, type InvoiceItem,
} from '../lib/billing';
import { PayDialog } from './PracticeBilling';

const back = (t: (k: MessageKey) => string) => <Link to="/praxis/abrechnung" className="back-link no-print"><IconBack size={20} />{t('blTitle')}</Link>;

/** Neue Rechnung: Tier, Behandlungsdatum und erbrachte Leistungen aus dem Praxiskatalog wählen → Entwurf */
export function PracticeInvoiceNew() {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const today = zonedNow(useNow()).date;
  const [data, setData] = useState<BillingData | null>(null);
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [pet, setPet] = useState(params.get('tier') ?? '');
  const [day, setDay] = useState(today);
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([practiceBilling(), practicePatients()]).then(([b, p]) => { setData(b); setPatients(p.filter((x) => !x.deceased)); }).catch(() => setLoadErr(true));
  }, []);

  const items = useMemo(() => (data?.catalog?.items ?? []).filter((i) => !q.trim() || `${i.code} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  const toggle = (id: string) => { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); setErr(null); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pet) { setErr('blErrPatient'); return; }
    if (!sel.length) { setErr('blErrNeedSel'); return; }
    setBusy(true);
    try {
      const id = await createInvoice(pet, day, sel);
      nav(`/praxis/abrechnung/${id}`, { replace: true });
    } catch (x) {
      setErr(billingErrorKey(x));
      setBusy(false);
    }
  };

  return (
    <div className="page stack-lg">
      {back(t)}
      <div className="page-head">
        <h1>{t('blPickTitle')}</h1>
        <p className="muted">{t('blPickSub')}</p>
      </div>
      {loadErr ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !data || !patients ? <p className="muted">{t('loading')}</p> : !data.catalog ? (
        <div className="notice notice-info"><p>{t('blNoCatalog')}</p><p><Link to="/praxis/abrechnung?tab=catalog" className="btn btn-secondary">{t('blToCatalog')}</Link></p></div>
      ) : (
        <form className="stack-lg" onSubmit={(e) => void submit(e)} noValidate>
          <section className="card stack">
            <div className="row-2">
              <Field id={`${uid}-pet`} label={t('blPet')} required hint={patients.length === 0 ? t('bkNoPatients') : undefined}>
                {(a) => (
                  <select {...a} value={pet} onChange={(e) => { setPet(e.target.value); setErr(null); }}>
                    <option value="">{t('rcReasonPick')}</option>
                    {patients.map((p) => <option key={p.pet_id} value={p.pet_id}>{[p.name, p.owner_name].filter(Boolean).join(' · ')}</option>)}
                  </select>
                )}
              </Field>
              <Field id={`${uid}-day`} label={t('blDocTreat')} required>
                {(a) => <input {...a} type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />}
              </Field>
            </div>
          </section>
          <section className="card stack" aria-labelledby={`${uid}-items`}>
            <div className="tp-list-head">
              <h2 id={`${uid}-items`}>{t('blPickItems')}</h2>
              <span className="small muted" aria-live="polite">{t('blSelected', { n: sel.length })}</span>
            </div>
            <input type="search" className="input" placeholder={t('blSearch')} aria-label={t('blSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="bl-pick">
              {items.map((i) => {
                const ok = validOn(i, day);
                return (
                  <li key={i.id}>
                    <label className={`bl-pick-row${ok ? '' : ' is-off'}`}>
                      <input type="checkbox" checked={sel.includes(i.id)} disabled={!ok} onChange={() => toggle(i.id)} />
                      <span className="mono">{i.code}</span>
                      <span className="bl-pick-name">{i.name}{!ok && <span className="small muted"> · {t('blNotValid')}</span>}</span>
                      <span className="mono">{money(Number(i.price) * Number(i.factor), data.catalog!.currency, locale)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
          {err && <p className="notice notice-crit" role="alert">{t(err)}</p>}
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('blCreateDraft')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Rechnung: Entwurf bearbeiten oder festgeschriebene Rechnung ansehen (Zahlung, Storno, Drucken) */
export function PracticeInvoice() {
  const { t } = useI18n();
  const { invoiceId } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [data, setData] = useState<BillingData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    try {
      const [i, b] = await Promise.all([practiceInvoice(invoiceId ?? ''), practiceBilling()]);
      setInv(i);
      setData(b);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, [invoiceId]);
  useEffect(() => { void load(); }, [load]);
  if (loadErr && !inv) return <div className="page stack-lg">{back(t)}<p className="notice notice-crit" role="alert">{t('scErrGone')}</p></div>;
  if (!inv || !data) return <div className="page stack-lg">{back(t)}<p className="muted">{t('loading')}</p></div>;
  return inv.status === 'draft' ? <DraftEditor key={inv.id} inv={inv} data={data} reload={load} /> : <InvoiceView inv={inv} reload={load} />;
}

type Line = InvoiceItem & { key: string };
let seq = 0;
const keyed = (it: InvoiceItem): Line => ({ ...it, key: `l${++seq}` });

function DraftEditor({ inv, data, reload }: { inv: Invoice; data: BillingData; reload: () => Promise<void> }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const nav = useNavigate();
  const today = zonedNow(useNow()).date;
  const cur = inv.currency;
  const [lines, setLines] = useState<Line[]>(() => inv.items.map(keyed));
  const [name, setName] = useState(inv.recipient_name ?? '');
  const [addr, setAddr] = useState(inv.recipient_address ?? '');
  const [note, setNote] = useState(inv.note ?? '');
  const [day, setDay] = useState(inv.treatment_date);
  const [pick, setPick] = useState('');
  const [free, setFree] = useState<{ name: string; price: string; qty: string; tax: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'final' | 'discard' | null>(null);
  const [dirty, setDirty] = useState(false);
  const sum = useMemo(() => totals(lines, data.settings.small_business), [lines, data.settings.small_business]);
  const catalog = data.catalog;
  const missing = missingForFinalize({ recipient_name: name, recipient_address: addr, items: lines }, data);
  const touch = () => { setDirty(true); setMsg(null); };

  const setLine = (key: string, patch: Partial<InvoiceItem>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, net: lineNet({ ...l, ...patch }) } : l)));
    touch();
  };
  const addCatalog = (id: string) => {
    const ci = catalog?.items.find((x) => x.id === id);
    if (!ci) return;
    const have = lines.find((l) => !l.free && l.code === ci.code);
    if (have) setLine(have.key, { qty: Number(have.qty) + 1 });
    else {
      setLines((ls) => [...ls, keyed({ catalog_item_id: ci.id, code: ci.code, name: ci.name, qty: 1, factor: Number(ci.factor), factor_min: Number(ci.factor_min), factor_max: Number(ci.factor_max), unit_price: Number(ci.price), tax_rate: Number(ci.tax_rate), net: round(Number(ci.price) * Number(ci.factor)), free: false })]);
      touch();
    }
    setPick('');
  };
  const round = (x: number) => Math.round(x * 100) / 100;
  const payload = (): DraftPayload => ({
    treatment_date: day, recipient_name: name, recipient_address: addr, note,
    items: lines.map((l) => (l.free ? { free: true as const, name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate) } : { catalog_item_id: l.catalog_item_id ?? '', qty: Number(l.qty), factor: Number(l.factor) })),
  });
  const save = async (then?: () => Promise<unknown>, ok?: string) => {
    if (!lines.length) { setMsg({ ok: false, text: t('blErrItems') }); return false; }
    setBusy(true);
    setMsg(null);
    try {
      await saveInvoice(inv.id, payload());
      setDirty(false);
      if (then) await then();
      if (ok) setMsg({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: t(billingErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toCatalog = async (l: Line) => {
    setBusy(true);
    try {
      const v = await publishCatalog({ mode: 'merge', items: [{ code: '', name: l.name, price: Number(l.unit_price), factor: 1, factor_min: 1, factor_max: 1, tax_rate: Number(l.tax_rate) }] });
      const fresh = await practiceBilling();
      const ci = fresh.catalog?.items.filter((x) => x.name === l.name).sort((a, b) => b.code.localeCompare(a.code))[0];
      if (ci) {
        setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, free: false, catalog_item_id: ci.id, code: ci.code, factor: 1, factor_min: 1, factor_max: 1 } : x)));
        setDirty(true);
      }
      setMsg({ ok: true, text: t('blFreeToCatDone', { n: l.name, c: ci?.code ?? '', v }) });
    } catch (e) {
      setMsg({ ok: false, text: t(billingErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page stack-lg">
      {back(t)}
      <div className="page-head page-head-row">
        <div>
          <h1>{t('blDraftTitle')}</h1>
          <p className="muted">{inv.pet_label} · <span className={`pill ${STATUS_TONE.draft}`}>{t(STATUS_LABEL.draft)}</span></p>
        </div>
      </div>
      <p className="notice notice-info">{t('blDraftHint')}</p>
      <div className="record-status" role="status" aria-live="polite">{msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}</div>
      <section className="card stack" aria-labelledby={`${uid}-to`}>
        <h2 id={`${uid}-to`}>{t('blDocTo')}</h2>
        {!inv.has_owner && <p className="small muted">{t('blNoOwnerAccount')}</p>}
        {inv.has_owner && !inv.recipient_address && <p className="small muted">{t('blNoOwnerAddress')}</p>}
        <div className="row-2">
          <Field id={`${uid}-n`} label={t('blRecipientName')} required>
            {(a) => <input {...a} type="text" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); touch(); }} />}
          </Field>
          <Field id={`${uid}-td`} label={t('blDocTreat')} required>
            {(a) => <input {...a} type="date" max={today} value={day} onChange={(e) => { setDay(e.target.value); touch(); }} />}
          </Field>
        </div>
        <Field id={`${uid}-a`} label={t('blRecipientAddress')} hint={t('blRecipientAddressHint')} required>
          {(a) => <textarea {...a} rows={3} maxLength={300} value={addr} onChange={(e) => { setAddr(e.target.value); touch(); }} />}
        </Field>
      </section>
      <section className="card stack" aria-labelledby={`${uid}-pos`}>
        <h2 id={`${uid}-pos`}>{t('blPositions')}</h2>
        {lines.some((l) => l.free) && <p className="notice notice-warn">{t('blDraftFreeWarn')}</p>}
        {lines.length === 0 ? <p className="muted">{t('blDraftEmpty')}</p> : (
          <div className="table-scroll">
            <table className="vault-table bl-draft">
              <thead><tr><th scope="col">{t('blColNo')}</th><th scope="col">{t('blColItem')}</th><th scope="col">{t('blColQty')}</th><th scope="col">{t('blColFactor')}</th><th scope="col" className="num">{t('blColPrice')}</th><th scope="col" className="num">{t('blColTax')}</th><th scope="col" className="num">{t('blColNet')}</th><th scope="col"><span className="sr-only">{t('blRemove')}</span></th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="mono">{l.code ?? '–'}</td>
                    <td>
                      {l.free ? <input type="text" className="input" maxLength={120} aria-label={t('blColItem')} value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} /> : l.name}
                      {l.free && data.can_edit && <><br /><button type="button" className="link-btn small" disabled={busy || !l.name.trim()} onClick={() => void toCatalog(l)}>{t('blFreeToCat')}</button></>}
                    </td>
                    <td><input type="number" className="input bl-qty" min={0.01} step="any" aria-label={t('blQtyL', { n: l.name })} value={l.qty} onChange={(e) => setLine(l.key, { qty: Number(e.target.value) })} /></td>
                    <td>
                      {!l.free && Number(l.factor_max) > Number(l.factor_min) ? (
                        <input type="number" className="input bl-qty" min={l.factor_min} max={l.factor_max} step={0.1} aria-label={t('blFactorL', { n: l.name, a: l.factor_min, b: l.factor_max })}
                          value={l.factor} onChange={(e) => setLine(l.key, { factor: Number(e.target.value) })}
                          onBlur={() => setLine(l.key, { factor: clampFactor(Number(l.factor), Number(l.factor_min), Number(l.factor_max)) })} />
                      ) : <span className="muted">–</span>}
                    </td>
                    <td className="num">{l.free ? <input type="number" className="input bl-qty" min={0} step="0.01" aria-label={t('blPriceNet', { c: cur })} value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: Number(e.target.value) })} /> : money(Number(l.unit_price), cur, locale)}</td>
                    <td className="num">{l.free ? <input type="number" className="input bl-qty" min={0} max={30} step="any" aria-label={t('blTaxRate')} value={l.tax_rate} onChange={(e) => setLine(l.key, { tax_rate: Number(e.target.value) })} /> : `${l.tax_rate} %`}</td>
                    <td className="num">{money(lineNet(l), cur, locale)}</td>
                    <td><button type="button" className="btn btn-ghost" aria-label={t('blRemoveL', { n: l.name })} onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); touch(); }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bl-add">
          {catalog && (
            <select className="input" aria-label={t('blAddItem')} value={pick} onChange={(e) => addCatalog(e.target.value)}>
              <option value="">{t('blAddItem')} …</option>
              {catalog.items.filter((i) => validOn(i, day)).map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name} · {money(Number(i.price), cur, locale)}</option>)}
            </select>
          )}
          {data.settings.allow_free && <button type="button" className="btn btn-secondary" onClick={() => setFree({ name: '', price: '', qty: '1', tax: '19' })}>{t('blFreeAdd')}</button>}
        </div>
        <dl className="inv-sum">
          <div className="inv-sum-row"><dt>{t('blSumNet')}</dt><dd>{money(sum.net, cur, locale)}</dd></div>
          {!data.settings.small_business && sum.taxes.map((x) => <div key={x.rate} className="inv-sum-row"><dt>{t('blSumTax', { r: x.rate, b: money(x.net, cur, locale) })}</dt><dd>{money(x.tax, cur, locale)}</dd></div>)}
          <div className="inv-sum-row inv-total"><dt>{t('blSumGross')}</dt><dd>{money(sum.gross, cur, locale)}</dd></div>
        </dl>
        {data.settings.small_business && <p className="small muted">{t('blDocSmallBusiness')}</p>}
      </section>
      <section className="card stack">
        <Field id={`${uid}-note`} label={t('blDraftNote')} optional>
          {(a) => <textarea {...a} rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); touch(); }} />}
        </Field>
      </section>
      {missing.length > 0 && (
        <div className="notice notice-warn">
          <p><strong>{t('blMissingTitle')}</strong></p>
          <ul>{missing.map((k) => <li key={k}>{t(k)}{k === 'blErrTaxId' && <> · <Link to="/praxis/abrechnung?tab=settings" className="link">{t('blTabSettings')}</Link></>}{k === 'blErrAddress' && <> · <Link to="/praxis/profil" className="link">{t('pp_navProfile')}</Link></>}</li>)}</ul>
        </div>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={() => void save().then((ok) => { if (ok) setConfirm('final'); })}>{t('blApprove')}</button>
        <button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={() => void save(undefined, t('blDraftSaved'))}>{t('blDraftSave')}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirm('discard')}>{t('blDraftDiscard')}</button>
      </div>
      {free && (
        <FreeDialog cur={cur} value={free} onClose={() => setFree(null)} onAdd={(f) => {
          setLines((ls) => [...ls, keyed({ catalog_item_id: null, code: null, name: f.name, qty: f.qty, factor: 1, factor_min: 1, factor_max: 1, unit_price: f.price, tax_rate: f.tax, net: round(f.qty * f.price), free: true })]);
          touch();
          setFree(null);
        }} />
      )}
      {confirm === 'final' && (
        <Dialog open title={t('blApproveTitle')} onClose={() => setConfirm(null)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>{t('blApproveBack')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                const no = await finalizeInvoice(inv.id);
                setConfirm(null);
                await reload();
                setMsg({ ok: true, text: t('blApproved', { no }) });
              } catch (e) {
                setConfirm(null);
                setMsg({ ok: false, text: t(billingErrorKey(e)) });
              } finally {
                setBusy(false);
              }
            }}>{t('blApproveYes')}</button>
          </>
        }>
          <p>{t(inv.has_owner ? 'blApproveText' : 'blApproveTextNoOwner', { v: catalog?.version ?? inv.catalog_version ?? '–', who: name || t('blTheOwner') })}</p>
          <p><strong>{money(sum.gross, cur, locale)}</strong></p>
        </Dialog>
      )}
      {confirm === 'discard' && (
        <Dialog open title={t('blDiscardTitle')} onClose={() => setConfirm(null)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await discardInvoice(inv.id); nav('/praxis/abrechnung', { replace: true }); } catch (e) { setConfirm(null); setMsg({ ok: false, text: t(billingErrorKey(e)) }); setBusy(false); }
            }}>{t('blDraftDiscard')}</button>
          </>
        }>
          <p>{t('blDiscardText')}</p>
        </Dialog>
      )}
    </div>
  );
}

function FreeDialog({ cur, value, onClose, onAdd }: { cur: string; value: { name: string; price: string; qty: string; tax: string }; onClose: () => void; onAdd: (f: { name: string; price: number; qty: number; tax: number }) => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState(value);
  const [err, setErr] = useState<MessageKey | null>(null);
  const n = (s: string) => Number(s.replace(',', '.'));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const price = n(v.price), qty = n(v.qty), tax = n(v.tax);
    if (!v.name.trim()) { setErr('blErrName'); return; }
    if (!Number.isFinite(price) || price < 0 || !(qty > 0) || !(tax >= 0 && tax <= 30)) { setErr('blErrLine'); return; }
    onAdd({ name: v.name.trim(), price: Math.round(price * 100) / 100, qty, tax });
  };
  return (
    <Dialog open title={t('blFreeAdd')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary">{t('blFreeAddBtn')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={submit} noValidate>
        <Field id={`${uid}-n`} label={t('blColItem')} required>
          {(a) => <input {...a} type="text" maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
        </Field>
        <div className="row-2">
          <Field id={`${uid}-p`} label={t('blPriceNet', { c: cur })} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />}
          </Field>
          <Field id={`${uid}-q`} label={t('blColQty')} required>
            {(a) => <input {...a} type="text" inputMode="decimal" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} />}
          </Field>
        </div>
        <Field id={`${uid}-t`} label={t('blTaxRate')} required>
          {(a) => <input {...a} type="text" inputMode="decimal" value={v.tax} onChange={(e) => setV({ ...v, tax: e.target.value })} />}
        </Field>
        {err && <p className="error" role="alert">{t(err)}</p>}
      </form>
    </Dialog>
  );
}

function InvoiceView({ inv, reload }: { inv: Invoice; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; undo?: boolean } | null>(null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const v = viewStatus(inv, today);
  const act = async (fn: () => Promise<unknown>, ok: string | ((r: unknown) => string), undo = false) => {
    setBusy(true);
    setMsg(null);
    try { const r = await fn(); await reload(); setMsg({ ok: true, text: typeof ok === 'string' ? ok : ok(r), undo }); return true; } catch (e) { setMsg({ ok: false, text: t(billingErrorKey(e)) }); return false; } finally { setBusy(false); }
  };
  return (
    <div className="page stack-lg">
      {back(t)}
      <div className="page-head page-head-row no-print">
        <div>
          <h1>{t(inv.kind === 'cancellation' ? 'blDocCancelTitle' : 'blDocTitle')} <span className="mono">{inv.number}</span></h1>
          <p className="muted">
            <span className={`pill ${STATUS_TONE[v]}`}>{t(STATUS_LABEL[v])}</span>
            {inv.finalized_by_name && <> · {t('blFinalizedBy', { name: inv.finalized_by_name })}</>}
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>{t('blPrint')}</button>
          {inv.status === 'open' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setPaying(true)}>{t('blPayBtn')}</button>}
          {inv.kind === 'invoice' && (inv.status === 'open' || inv.status === 'paid') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCancelling(true)}>{t('blCancel')}</button>}
        </div>
      </div>
      <div className="record-status no-print" role="status" aria-live="polite">
        {msg && (
          <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>
            {msg.text}
            {msg.undo && <>{' '}<button type="button" className="link-btn" disabled={busy} onClick={() => void act(() => unpayInvoice(inv.id), t('blUnpaid'))}>{t('blUndo')}</button></>}
          </p>
        )}
      </div>
      {!inv.has_owner && inv.kind === 'invoice' && <p className="notice notice-info no-print">{t('blPrintForOwner')}</p>}
      <InvoiceDocument inv={inv} />
      <p className="small muted no-print">{t('blPrintHint')}</p>
      {paying && <PayDialog row={inv} busy={busy} onClose={() => setPaying(false)}
        onSave={async (date, method) => { if (await act(() => payInvoice(inv.id, date, method), t('blPaid', { no: inv.number ?? '' }), true)) setPaying(false); }} />}
      {cancelling && (
        <Dialog open title={t('blCancelTitle', { no: inv.number ?? '' })} onClose={() => setCancelling(false)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCancelling(false)}>{t('cancelBtn')}</button>
            <button type="submit" form={`${uid}-c`} className="btn btn-danger" disabled={busy || reason.trim().length < 3}>{t('blCancelYes')}</button>
          </>
        }>
          <form id={`${uid}-c`} className="stack" noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (await act(() => cancelInvoice(inv.id, reason), (no) => t('blCancelled', { no: String(no) }))) setCancelling(false);
          }}>
            <p>{t('blCancelText')}</p>
            {inv.status === 'paid' && <p className="notice notice-warn">{t('blCancelPaid')}</p>}
            <Field id={`${uid}-r`} label={t('blCancelReason')} required>
              {(a) => <input {...a} type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          </form>
        </Dialog>
      )}
    </div>
  );
}
