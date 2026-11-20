// Behandlung dokumentieren und dabei abrechnen (Etappe P7b): Befund + erbrachte Leistungen aus dem Praxiskatalog,
// Pakete, freie Positionen; beim Speichern entsteht der Rechnungsentwurf zum heutigen Termin.
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { localeOf, type MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import { useNow } from '../../lib/useNow';
import {
  addLine, addPackage, billPackages, billingErrorKey, createTreatmentInvoice, freeLine, linePayload, lineNet, money, practiceBilling,
  practiceInvoices, saveBillPackage, totals, usualTaxRate, validOn,
  type BillPackage, type BillingData, type InvoiceRow, type ServiceLine,
} from '../../lib/billing';
import { dayOf, markAppointment, practiceAppointments, timeOf, type PracticeAppointment } from '../../lib/practiceAppointments';
import { EMPTY_FORM, addEntry, entryData, entryErrors, type FormValues } from '../../lib/practiceRecord';
import { EntryFields, type RecordCtx } from './shared';

export interface TreatmentBilling {
  data: BillingData | null;
  packages: BillPackage[];
  appt: PracticeAppointment | null;
  /** Gültige Rechnung zu diesem Termin (Entwurf, offen oder bezahlt) */
  apptInvoice: InvoiceRow | null;
  /** Katalog, Pakete, Termine oder Rechnungen konnten nicht geladen werden */
  loadErr: boolean;
  reload: () => Promise<void>;
}

/** Heutiger Termin des Tiers: der zuletzt begonnene, sonst der nächste */
export function todaysAppointment(rows: readonly PracticeAppointment[], petId: string, today: string, now: Date): PracticeAppointment | null {
  const mine = rows
    .filter((a) => a.pet_id === petId && dayOf(a.starts_at) === today && (a.status === 'confirmed' || a.status === 'attended' || a.status === 'new'))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const started = mine.filter((a) => new Date(a.starts_at) <= now);
  return started.at(-1) ?? mine[0] ?? null;
}

export function useTreatmentBilling(petId: string, today: string, enabled: boolean): TreatmentBilling {
  const [data, setData] = useState<BillingData | null>(null);
  const [packages, setPackages] = useState<BillPackage[]>([]);
  const [appts, setAppts] = useState<PracticeAppointment[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled) return;
    let failed = false;
    const soft = <T,>(pr: Promise<T>, fallback: T) => pr.catch(() => { failed = true; return fallback; });
    const [b, p, a, i] = await Promise.all([
      soft(practiceBilling(), null),
      soft(billPackages(), [] as BillPackage[]),
      soft(practiceAppointments(), [] as PracticeAppointment[]),
      soft(practiceInvoices(), [] as InvoiceRow[]),
    ]);
    setLoadErr(failed);
    setData(b);
    setPackages(p);
    setAppts(a);
    setInvoices(i);
  }, [enabled]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const now = useNow();
  const appt = useMemo(() => todaysAppointment(appts, petId, today, now), [appts, petId, today, now]);
  const apptInvoice = useMemo(
    () => (appt ? (invoices.find((r) => r.appointment_id === appt.id && r.kind === 'invoice' && ['draft', 'open', 'paid'].includes(r.status)) ?? null) : null),
    [appt, invoices],
  );
  return { data, packages, appt, apptInvoice, loadErr, reload };
}

const clampQty = (n: number) => Math.min(Math.max(Math.round(n), 1), 9999);

export function TreatmentForm({ ctx, bill, lines, setLines, suggested, clearSuggested }: {
  ctx: RecordCtx; bill: TreatmentBilling; lines: ServiceLine[]; setLines: (fn: (l: ServiceLine[]) => ServiceLine[]) => void;
  suggested: boolean; clearSuggested: () => void;
}) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [v, setV] = useState<FormValues>(() => EMPTY_FORM.finding(ctx.today));
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const [auto, setAuto] = useState(true);
  const [q, setQ] = useState('');
  const [free, setFree] = useState<{ name: string; qty: string; price: string; tax: string } | null>(null);
  const [freeErr, setFreeErr] = useState<MessageKey | null>(null);
  const [pkgName, setPkgName] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; invoiceId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, x: string) => setV((c) => ({ ...c, [k]: x }));
  const c = bill.data?.catalog ?? null;
  const settings = bill.data?.settings;
  const day = v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : ctx.today;
  const items = useMemo(() => (c ? c.items.filter((i) => validOn(i, day)) : []), [c, day]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => `${i.code} ${i.name}`.toLowerCase().includes(s)).slice(0, 8);
  }, [items, q]);
  const sum = totals(lines, !!settings?.small_business);
  const cur = c?.currency ?? 'EUR';
  const blocked = !!bill.apptInvoice;
  const willBill = !!c && auto && !blocked && lines.length > 0;
  const catalogLines = lines.filter((l) => !l.free);

  const parse = (s: string) => Number(s.replace(',', '.').trim());
  function addFree() {
    if (!free) return;
    const qty = parse(free.qty);
    const price = parse(free.price);
    const tax = parse(free.tax);
    if (!free.name.trim()) return setFreeErr('blErrLine');
    // leere Felder nicht als 0 übernehmen
    if (!free.price.trim() || !free.tax.trim() || !free.qty.trim()) return setFreeErr('blErrFreeEmpty');
    if (!Number.isFinite(qty) || qty < 1 || qty > 9999 || !Number.isFinite(price) || price < 0 || price > 100000 || !Number.isFinite(tax) || tax < 0 || tax > 30) return setFreeErr('blErrLine');
    setLines((ls) => [...ls, freeLine(free.name.trim().slice(0, 120), Math.round(qty), Math.round(price * 100) / 100, tax)]);
    setFree(null);
    setFreeErr(null);
  }

  async function savePackage() {
    if (pkgName === null) return;
    const name = pkgName.trim();
    if (!name) return setNote({ ok: false, text: t('blErrPkgName') });
    setBusy(true);
    try {
      await saveBillPackage(name, catalogLines.map((l) => ({ code: l.code!, qty: l.qty })));
      await bill.reload();
      setPkgName(null);
      setNote({ ok: true, text: t('blTrPkgSaved', { n: name }) });
    } catch (e) {
      setNote({ ok: false, text: t(billingErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const hasFinding = !!(v.title ?? '').trim();
    const errs = entryErrors('finding', v, ctx.today);
    // Nur abrechnen ohne Befund ist erlaubt; dann zählt nur das Datum
    const relevant = hasFinding || !willBill ? errs : Object.fromEntries(Object.entries(errs).filter(([k]) => k === 'date'));
    setErrors(relevant);
    if (Object.keys(relevant).length) return;
    setNote(null);
    let invoiceId: string | null = null;
    let invoiceErr: MessageKey | null = null;
    const n = lines.length;
    const appt = bill.appt;
    let markFailed = false;
    const work = async () => {
      if (appt && appt.status === 'confirmed' && new Date(appt.starts_at) <= new Date() && v.date === ctx.today) {
        await markAppointment(appt.id, true).catch(() => { markFailed = true; });
      }
      if (!willBill) return;
      try {
        invoiceId = await createTreatmentInvoice({
          pet_id: ctx.petId, treatment_date: v.date ?? ctx.today, items: lines.map(linePayload),
          appointment_id: appt && v.date === ctx.today ? appt.id : null,
        });
      } catch (err) {
        invoiceErr = billingErrorKey(err);
      }
    };
    if (hasFinding) {
      const ok = await ctx.run(async () => {
        await addEntry(ctx.petId, 'finding', entryData('finding', v));
        await work();
      }, () => (invoiceId ? t('blTrSaved', { n }) : t('rcSavedFind')));
      if (!ok) return;
      setV(EMPTY_FORM.finding(ctx.today));
    } else {
      // Nur abrechnen (z. B. nach einer Impfung): Akte bleibt unverändert
      setBusy(true);
      try { await work(); } finally { setBusy(false); }
    }
    if (invoiceId) {
      setV(EMPTY_FORM.finding(ctx.today));
      setLines(() => []);
      clearSuggested();
      setNote({ ok: true, text: t(hasFinding ? 'blTrDraftReady' : 'blTrSavedBill', { n }) + (markFailed ? ` ${t('blTrMarkFailed')}` : ''), invoiceId });
    } else if (invoiceErr) {
      setNote({ ok: false, text: t(invoiceErr) });
    } else if (markFailed) {
      setNote({ ok: false, text: t('blTrMarkFailed') });
    }
    await bill.reload();
  }

  const qtyBtn = (l: ServiceLine, d: number) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: clampQty(x.qty + d) } : x)));

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('blTrTitle')}</h2>
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <EntryFields kind="finding" v={v} set={set} errors={errors} uid={uid} />
        {bill.loadErr && (
          <p className="notice notice-warn small" role="alert">
            {t('blTrLoadErr')} <button type="button" className="link-btn" onClick={() => void bill.reload()}>{t('blTrRetry')}</button>
          </p>
        )}
        {bill.data && (
          <fieldset className="fieldset tr-services">
            <legend>{t('blTrServices')}</legend>
            {!c ? (
              <p className="small muted">{t('blTrNoCatalog')} <Link to="/praxis/abrechnung?tab=catalog" className="link">{t('blTabCatalog')}</Link></p>
            ) : (
              <>
                {bill.appt && (
                  <p className="small muted">{t('blTrAppt', { t: timeOf(bill.appt.starts_at), type: bill.appt.type_name })}</p>
                )}
                {blocked && (
                  <p className="notice notice-info small">
                    {t('blTrHave')} <Link to={`/praxis/abrechnung/${bill.apptInvoice!.id}`} className="link">{t('blTrOpenInvoice')}</Link>
                  </p>
                )}
                {suggested && <p className="notice notice-info small">{t('blTrSugHint')}</p>}
                <div className="tr-search">
                  <input type="search" className="input" placeholder={t('blTrSearch')} aria-label={t('blTrSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
                  {q.trim() && (
                    <ul className="tr-hits" aria-label={t('blTrHits')}>
                      {hits.length === 0 ? <li className="small muted tr-hit-none">{t('blTrNoHits')}</li> : hits.map((i) => (
                        <li key={i.id}>
                          <button type="button" className="tr-hit" onClick={() => { setLines((ls) => addLine(ls, i)); setQ(''); }}>
                            <span className="mono">{i.code}</span> <span>{i.name}</span>
                            <span className="tr-hit-price">{money(Number(i.price) * Number(i.factor), cur, locale)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {bill.packages.length > 0 && (
                  <div className="stack-sm">
                    <span className="small muted">{t('blTrPackages')}</span>
                    <div className="chips-wrap">
                      {bill.packages.map((p) => (
                        <button key={p.id} type="button" className="chip" title={p.items.map((x) => `${x.qty}× ${x.code}`).join(', ')}
                          onClick={() => {
                            const r = addPackage(lines, p, items, day);
                            setLines(() => r.lines);
                            setNote(r.skipped ? { ok: false, text: t('blTrPkgSkipped', { n: r.skipped }) } : null);
                          }}>+ {p.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                {lines.length === 0 ? <p className="small muted">{t('blTrNone')}</p> : (
                  <ul className="tr-lines">
                    {lines.map((l) => (
                      <li key={l.key} className="tr-line">
                        <div className="tr-line-main">
                          <span>{l.code && <span className="mono">{l.code} </span>}{l.name}</span>
                          <span className="small muted">
                            {l.free && <span className="pill">{t('blTrFreeLabel')}</span>}
                            {l.suggested && <span className="pill pill-warn">{t('blTrSug')}</span>}
                            {' '}{money(lineNet(l), cur, locale)}
                          </span>
                        </div>
                        <div className="tr-qty" role="group" aria-label={t('blTrQtyL', { n: l.name })}>
                          <button type="button" className="btn btn-ghost tr-step" aria-label={t('blTrLess')} disabled={l.qty <= 1} onClick={() => qtyBtn(l, -1)}>−</button>
                          <span aria-live="polite" className="tr-qty-n">{l.qty}</span>
                          <button type="button" className="btn btn-ghost tr-step" aria-label={t('blTrMore')} onClick={() => qtyBtn(l, 1)}>+</button>
                        </div>
                        <button type="button" className="btn btn-ghost tr-step" aria-label={t('blTrRemoveL', { n: l.name })} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                {lines.length > 0 && <p className="tr-est"><strong>{t('blTrEst', { a: money(sum.gross, cur, locale) })}</strong></p>}
                <div className="row-actions">
                  {settings?.allow_free && !free && (
                    <button type="button" className="btn btn-ghost" onClick={() => setFree({ name: '', qty: '1', price: '', tax: String(settings.small_business ? 0 : usualTaxRate(c.items)) })}>+ {t('blFreeAdd')}</button>
                  )}
                  {catalogLines.length >= 2 && pkgName === null && (
                    <button type="button" className="btn btn-ghost" onClick={() => setPkgName('')}>{t('blTrPkgSave')}</button>
                  )}
                </div>
                {free && (
                  <div className="stack-sm tr-sub">
                    <Field id={`${uid}-fn`} label={t('blColItem')} required error={freeErr ? { key: freeErr } : undefined}>
                      {(a) => <input {...a} type="text" maxLength={120} value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} />}
                    </Field>
                    <div className="tr-free-grid">
                      <Field id={`${uid}-fq`} label={t('blColQty')}>
                        {(a) => <input {...a} type="number" min={1} max={9999} inputMode="numeric" value={free.qty} onChange={(e) => setFree({ ...free, qty: e.target.value })} />}
                      </Field>
                      <Field id={`${uid}-fp`} label={t('blPriceNet')}>
                        {(a) => <input {...a} type="text" inputMode="decimal" value={free.price} onChange={(e) => setFree({ ...free, price: e.target.value })} />}
                      </Field>
                      <Field id={`${uid}-ft`} label={t('blColTax')}>
                        {(a) => <input {...a} type="text" inputMode="decimal" value={free.tax} onChange={(e) => setFree({ ...free, tax: e.target.value })} />}
                      </Field>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn btn-secondary" onClick={addFree}>{t('blTrAdd')}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => { setFree(null); setFreeErr(null); }}>{t('cancelBtn')}</button>
                    </div>
                  </div>
                )}
                {pkgName !== null && (
                  <div className="stack-sm tr-sub">
                    <Field id={`${uid}-pk`} label={t('blTrPkgName')} hint={t('blTrPkgHint', { n: catalogLines.length })}>
                      {(a) => <input {...a} type="text" maxLength={80} value={pkgName} onChange={(e) => setPkgName(e.target.value)} />}
                    </Field>
                    <div className="row-actions">
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void savePackage()}>{t('blTrPkgSave')}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setPkgName(null)}>{t('cancelBtn')}</button>
                    </div>
                  </div>
                )}
                <label className="check-row">
                  <input type="checkbox" checked={auto && !blocked} disabled={blocked} onChange={(e) => setAuto(e.target.checked)} />
                  <span>{t('blTrAuto')}</span>
                </label>
              </>
            )}
          </fieldset>
        )}
        <div role="status" aria-live="polite">
          {note && (
            <p className={`notice ${note.ok ? 'notice-ok' : 'notice-crit'} small`}>
              {note.text}
              {note.invoiceId && <> <Link to={`/praxis/abrechnung/${note.invoiceId}`} className="link">{t('blTrReview')}</Link></>}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-start" disabled={ctx.busy || busy}>{t(willBill ? 'blTrSave' : 'saveBtn')}</button>
      </form>
    </section>
  );
}
