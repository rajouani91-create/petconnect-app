import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, localeOf, type MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import { IconBack } from '../../components/Icons';
import { Loading } from '../../components/Loading';
import { InvoiceDocument } from '../../components/InvoiceDocument';
import { useNow } from '../../lib/useNow';
import { zonedNow } from '../../lib/time';
import {
  STATUS_LABEL, STATUS_TONE, billingErrorKey, money, myBillingAddress, ownerInvoice, ownerInvoices, round2, saveBillingAddress, viewStatus,
  type BillingAddress, type Invoice, type OwnerInvoiceRow,
} from '../../lib/billing';

/** Mehr → Rechnungen: Rechnungen der Praxen mit Zahlungsstatus, „Noch zu zahlen“, Rechnungsanschrift */
export function Invoices() {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const today = zonedNow(useNow()).date;
  const [rows, setRows] = useState<OwnerInvoiceRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  useEffect(() => { ownerInvoices().then(setRows).catch(() => setLoadErr(true)); }, []);
  const open = (rows ?? []).filter((r) => r.kind === 'invoice' && r.status === 'open');
  const byCur = new Map<string, number>();
  for (const r of open) byCur.set(r.currency, round2((byCur.get(r.currency) ?? 0) + Number(r.gross)));
  return (
    <div className="page stack-lg">
      <Link to="/mehr" className="back-link"><IconBack size={20} />{t('moreTitle')}</Link>
      <header className="page-head">
        <h1>{t('blOwnTitle')}</h1>
        <p className="muted">{t('blOwnSub')}</p>
      </header>
      {loadErr ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !rows ? <Loading /> : (
        <>
          <section className="card tp-kpi">
            <h2 className="small muted">{t('blOwnOpen')}</h2>
            <p className="tp-num">{byCur.size ? [...byCur.entries()].map(([c, s]) => money(s, c, locale)).join(' + ') : money(0, 'EUR', locale)}</p>
            <p className="small muted">{t('blKCount', { n: open.length })}</p>
          </section>
          {rows.length === 0 ? <p className="muted">{t('blOwnNone')}</p> : (
            <ul className="record-list card">
              {rows.map((r) => {
                const v = viewStatus(r, today);
                return (
                  <li key={r.id} className="record-row bl-row">
                    <div className="record-main">
                      <span className="record-title">{r.pet_label} <span className="muted">· {r.practice_name}</span></span>
                      <span className="small"><span className="mono">{r.number}</span> · {formatIsoDate(r.invoice_date, lang)}</span>
                      <span className="small muted">
                        {r.kind === 'cancellation' ? t('blCancelsRef', { no: r.cancels_number ?? '–' })
                          : r.status === 'paid' && r.paid_on ? t('blPaidOnShort', { d: formatIsoDate(r.paid_on, lang) })
                          : r.status === 'cancelled' ? t('blCancelledBy', { no: r.cancelled_by_number ?? '–' })
                          : r.due_date ? t('blDueOn', { d: formatIsoDate(r.due_date, lang) }) : ''}
                      </span>
                    </div>
                    <span className="bl-amount mono">{money(Number(r.gross), r.currency, locale)}</span>
                    <span className={`pill ${STATUS_TONE[v]}`}>{t(STATUS_LABEL[v])}</span>
                    <div className="row-actions"><Link to={`/mehr/rechnungen/${r.id}`} className="btn btn-secondary" aria-label={t('blOwnViewL', { no: r.number })}>{t('blOwnView')}</Link></div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="small muted note-line">{t('blOwnPayInfo')}</p>
        </>
      )}
      <AddressCard />
    </div>
  );
}

const EMPTY: BillingAddress = { name: '', street: '', postcode: '', city: '', country: 'DE' };

function AddressCard() {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<BillingAddress | null>(null);
  const [had, setHad] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Partial<Record<keyof BillingAddress, MessageKey>>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => myBillingAddress().then((a) => { setV(a ?? EMPTY); setHad(!!a); }).catch(() => setV(EMPTY)), []);
  useEffect(() => { void load(); }, [load]);
  if (!v) return null;
  const set = (k: keyof BillingAddress, x: string) => { setV({ ...v, [k]: x }); setErrs((e) => ({ ...e, [k]: undefined })); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Partial<Record<keyof BillingAddress, MessageKey>> = {};
    const empty = !v.name.trim() && !v.street.trim() && !v.postcode.trim() && !v.city.trim();
    if (!empty) (['name', 'street', 'postcode', 'city'] as const).forEach((k) => { if (!v[k].trim()) er[k] = 'blErrRequired'; });
    if (!/^[A-Za-z]{2}$/.test(v.country.trim())) er.country = 'blErrCountry';
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await saveBillingAddress({ ...v, country: v.country.trim().toUpperCase() });
      setHad(!empty);
      setMsg({ ok: true, text: t(empty ? 'blAddrRemoved' : 'blAddrSaved') });
    } catch (x) {
      setMsg({ ok: false, text: t(billingErrorKey(x)) });
    } finally {
      setBusy(false);
    }
  };
  const err = (k: keyof BillingAddress) => (errs[k] ? { key: errs[k]! } : undefined);
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('blAddrTitle')}</h2>
      <p className="muted">{t(had ? 'blAddrSub' : 'blAddrSubNone')}</p>
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <Field id={`${uid}-n`} label={t('blAddrName')} error={err('name')}>
          {(a) => <input {...a} type="text" autoComplete="name" maxLength={120} value={v.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field id={`${uid}-s`} label={t('blAddrStreet')} error={err('street')}>
          {(a) => <input {...a} type="text" autoComplete="street-address" maxLength={120} value={v.street} onChange={(e) => set('street', e.target.value)} />}
        </Field>
        <div className="row-2">
          <Field id={`${uid}-p`} label={t('blAddrPostcode')} error={err('postcode')}>
            {(a) => <input {...a} type="text" autoComplete="postal-code" maxLength={12} value={v.postcode} onChange={(e) => set('postcode', e.target.value)} />}
          </Field>
          <Field id={`${uid}-c`} label={t('blAddrCity')} error={err('city')}>
            {(a) => <input {...a} type="text" autoComplete="address-level2" maxLength={80} value={v.city} onChange={(e) => set('city', e.target.value)} />}
          </Field>
        </div>
        <Field id={`${uid}-co`} label={t('blAddrCountry')} error={err('country')} hint={t('blAddrCountryHint')}>
          {(a) => <input {...a} type="text" autoComplete="country" maxLength={2} value={v.country} onChange={(e) => set('country', e.target.value)} />}
        </Field>
        <div role="status" aria-live="polite">{msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}</div>
        <div className="row-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{t('blAddrSave')}</button></div>
        <p className="small muted">{t('blAddrPrivacy')}</p>
      </form>
    </section>
  );
}

/** Eine Rechnung ansehen und drucken bzw. als PDF speichern */
export function InvoiceDetail() {
  const { t } = useI18n();
  const { invoiceId } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { ownerInvoice(invoiceId ?? '').then(setInv).catch(() => setErr(true)); }, [invoiceId]);
  return (
    <div className="page stack-lg">
      <Link to="/mehr/rechnungen" className="back-link no-print"><IconBack size={20} />{t('blOwnTitle')}</Link>
      {err ? <p className="notice notice-crit" role="alert">{t('scErrGone')}</p> : !inv ? <Loading /> : (
        <>
          <div className="row-actions no-print"><button type="button" className="btn btn-primary" onClick={() => window.print()}>{t('blPrint')}</button></div>
          <InvoiceDocument inv={inv} />
          <p className="small muted no-print">{t('blOwnSync')}</p>
        </>
      )}
    </div>
  );
}
