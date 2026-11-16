import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, localeOf } from '../i18n';
import { PAY_LABEL, formatIban, money, type Invoice } from '../lib/billing';

const num = (x: number, locale: string, max = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(x);

/** Rechnung als Dokument (Praxis und Halter:in gleich). Drucken bzw. „Als PDF speichern“ über den Browser. */
export function InvoiceDocument({ inv }: { inv: Invoice }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const m = (x: number) => money(Number(x), inv.currency, locale);
  const d = (iso: string | null) => (iso ? formatIsoDate(iso, lang) : '–');
  const is = inv.issuer;
  const cancel = inv.kind === 'cancellation';
  const showFactor = inv.items.some((x) => Number(x.factor) !== 1 || Number(x.factor_max) > 1);
  return (
    <article className="vault print-a4 inv-doc" aria-label={t(cancel ? 'blDocCancelTitle' : 'blDocTitle')}>
      <header className="inv-head">
        <div className="inv-issuer">
          <strong>{is.name}</strong>
          {is.street && <span>{is.street}</span>}
          {(is.postcode || is.city) && <span>{[is.postcode, is.city].filter(Boolean).join(' ')}</span>}
          {is.phone && <span>{t('blDocPhone', { v: is.phone })}</span>}
          {is.email && <span>{is.email}</span>}
        </div>
        <div className="inv-title">
          <h2>{t(cancel ? 'blDocCancelTitle' : 'blDocTitle')}</h2>
          <span className="mono">{inv.number ?? t('blStDraft')}</span>
        </div>
      </header>
      <div className="inv-meta">
        <div className="inv-to">
          <span className="small muted">{t('blDocTo')}</span>
          <strong>{inv.recipient_name ?? '–'}</strong>
          {(inv.recipient_address ?? '').split('\n').filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <dl className="inv-facts">
          <dt>{t('blDocNo')}</dt><dd className="mono">{inv.number ?? '–'}</dd>
          <dt>{t('blDocDate')}</dt><dd>{d(inv.invoice_date)}</dd>
          <dt>{t('blDocTreat')}</dt><dd>{d(inv.treatment_date)}</dd>
          {!cancel && <><dt>{t('blDocDue')}</dt><dd>{d(inv.due_date)}</dd></>}
          <dt>{t('blDocPet')}</dt><dd>{inv.pet_label}</dd>
        </dl>
      </div>
      {cancel && <p className="inv-cancel-ref"><strong>{t('blDocCancels', { no: inv.cancels_number ?? '–' })}</strong>{inv.cancel_reason && <> · {inv.cancel_reason}</>}</p>}
      <div className="table-scroll">
        <table className="vault-table inv-table">
          <thead>
            <tr>
              <th scope="col">{t('blColNo')}</th>
              <th scope="col">{t('blColItem')}</th>
              <th scope="col" className="num">{t('blColQty')}</th>
              {showFactor && <th scope="col" className="num">{t('blColFactor')}</th>}
              <th scope="col" className="num">{t('blColPrice')}</th>
              <th scope="col" className="num">{t('blColTax')}</th>
              <th scope="col" className="num">{t('blColNet')}</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id ?? i}>
                <td className="mono">{it.code ?? '–'}</td>
                <td>{it.name}</td>
                <td className="num">{num(Number(it.qty), locale)}</td>
                {showFactor && <td className="num">{it.free ? '–' : num(Number(it.factor), locale)}</td>}
                <td className="num">{m(Number(it.unit_price))}</td>
                <td className="num">{num(Number(it.tax_rate), locale)} %</td>
                <td className="num">{m(Number(it.net))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="inv-sum">
        <div className="inv-sum-row"><dt>{t('blSumNet')}</dt><dd>{m(inv.net)}</dd></div>
        {!inv.small_business && inv.taxes.map((x) => (
          <div key={x.rate} className="inv-sum-row"><dt>{t('blSumTax', { r: num(Number(x.rate), locale), b: m(Number(x.net)) })}</dt><dd>{m(Number(x.tax))}</dd></div>
        ))}
        <div className="inv-sum-row inv-total"><dt>{t('blSumGross')}</dt><dd>{m(inv.gross)}</dd></div>
      </dl>
      {inv.small_business && <p className="small">{t('blDocSmallBusiness')}</p>}
      {inv.note && !cancel && <p className="inv-note"><span className="small muted">{t('blDocNote')}</span><br />{inv.note}</p>}
      {inv.status === 'paid' && inv.paid_on && inv.pay_method && <p className="inv-stamp inv-paid">{t('blDocPaid', { d: d(inv.paid_on), m: t(PAY_LABEL[inv.pay_method]) })}</p>}
      {inv.status === 'cancelled' && <p className="inv-stamp">{t('blDocCancelledBy', { no: inv.cancelled_by_number ?? '–' })}</p>}
      {!cancel && inv.status !== 'cancelled' && inv.status !== 'paid' && is.iban && <p className="small">{t('blDocPayHint', { no: inv.number ?? '…', d: d(inv.due_date) })}</p>}
      <footer className="vault-foot inv-foot">
        {inv.catalog_name && <span>{t('blDocCatalog', { c: inv.catalog_name, v: inv.catalog_version ?? '–' })}</span>}
        {(is.tax_number || is.tax_id) && <span>{[is.tax_number && t('blDocTaxNo', { v: is.tax_number }), is.tax_id && t('blDocTaxId', { v: is.tax_id })].filter(Boolean).join(' · ')}</span>}
        {is.iban && <span>{[is.bank, `IBAN ${formatIban(is.iban)}`, is.bic && `BIC ${is.bic}`].filter(Boolean).join(' · ')}</span>}
        {is.footer && <span>{is.footer}</span>}
      </footer>
    </article>
  );
}
