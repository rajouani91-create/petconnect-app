// Leistungskatalog (Etappe P7b): Import per CSV-Datei mit Vorschau und Leistungspakete der Praxis.
import { useCallback, useEffect, useId, useState, type ChangeEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { localeOf } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { billPackages, deleteBillPackage, money, publishCatalog, type BillPackage, type BillingData } from '../lib/billing';
import { CSV_TEMPLATE, importPayload, parseCatalogCsv, type ImportResult } from '../lib/billingImport';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;
const MAX_BYTES = 2_000_000;

export function ImportCard({ data, busy, run }: { data: BillingData; busy: boolean; run: Run }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [name, setName] = useState('');
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setRes(null);
    setFileErr(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setFileErr(t('blImpErrBig')); return; }
    f.text().then((text) => {
      setRes(parseCatalogCsv(text));
      setName(f.name.replace(/\.[^.]+$/, '').slice(0, 120));
    }, () => setFileErr(t('blImpErrEmpty')));
  };

  const template = () => {
    const url = URL.createObjectURL(new Blob(['﻿', CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'petconnect-leistungskatalog-vorlage.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reset = () => { setRes(null); setName(''); setInputKey((k) => k + 1); };

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('blImpTitle')}</h2>
      <p className="muted">{t('blImpSub')}</p>
      <div className="row-actions">
        <label className="btn btn-secondary file-btn">
          {t('blImpFile')}
          <input key={inputKey} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
        <button type="button" className="btn btn-ghost" onClick={template}>{t('blImpTemplate')}</button>
      </div>
      <p className="small muted">{t('blImpCols')}</p>
      <div role="status" aria-live="polite">
        {fileErr && <p className="notice notice-crit">{fileErr}</p>}
        {res?.fatal && <p className="notice notice-crit">{t(res.fatal)}</p>}
      </div>
      {res && !res.fatal && (
        <div className="stack">
          <h3>{t('blImpPreview')}</h3>
          <p>{t('blImpFound', { n: res.items.length, m: res.errors.length })}</p>
          {res.errors.length > 0 && (
            <ul className="bl-imp-errs small">
              {res.errors.slice(0, 50).map((e) => <li key={e.line}>{t('blImpRowErr', { n: e.line, e: t(e.key) })}</li>)}
              {res.errors.length > 50 && <li>…</li>}
            </ul>
          )}
          <div className="table-scroll">
            <table className="vault-table bl-cat">
              <thead><tr><th scope="col">{t('blColNo')}</th><th scope="col">{t('blColItem')}</th><th scope="col" className="num">{t('blColPrice')}</th><th scope="col">{t('blColFactor')}</th><th scope="col" className="num">{t('blColTax')}</th></tr></thead>
              <tbody>
                {res.items.slice(0, 8).map((i) => (
                  <tr key={i.code}>
                    <td className="mono">{i.code}</td><td>{i.name}</td><td className="num">{money(i.price, res.currency, locale)}</td>
                    <td>{i.factor_max! > i.factor_min! ? `${i.factor_min}–${i.factor_max}` : i.factor}</td><td className="num">{i.tax_rate} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {res.items.length > 8 && <p className="small muted">{t('blImpMore', { n: res.items.length - 8 })}</p>}
          <Field id={`${uid}-name`} label={t('blImpName')} required>
            {(a) => <input {...a} type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => setConfirm(true)}>{t('blImpAdopt')}</button>
            <button type="button" className="btn btn-ghost" onClick={reset}>{t('cancelBtn')}</button>
          </div>
        </div>
      )}
      {confirm && res && (
        <Dialog open title={t('blImpAdopt')} onClose={() => setConfirm(false)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={async () => { if (await run(() => publishCatalog(importPayload(res, name)), t('blImpDone', { n: res.items.length }))) { setConfirm(false); reset(); } }}>{t('blImpAdoptYes')}</button>
          </>
        }>
          <p>{t(data.catalog ? 'blImpReplace' : 'blImpFirst', { n: res.items.length })}</p>
        </Dialog>
      )}
    </section>
  );
}

/** Pakete der Praxis: entstehen in der Patientenakte („Als Paket speichern“), hier ansehen und löschen */
export function PackagesCard({ data, busy, run }: { data: BillingData; busy: boolean; run: Run }) {
  const { t } = useI18n();
  const uid = useId();
  const [list, setList] = useState<BillPackage[] | null>(null);
  const [del, setDel] = useState<BillPackage | null>(null);
  const load = useCallback(() => billPackages().then(setList).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (code: string) => data.catalog?.items.find((i) => i.code.toUpperCase() === code.toUpperCase())?.name;
  if (!list) return null;
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('blPkgTitle')}</h2>
      <p className="muted">{t('blPkgSub')}</p>
      {list.length === 0 ? <p className="small muted">{t('blPkgNone')}</p> : (
        <ul className="record-list">
          {list.map((p) => (
            <li key={p.id} className="record-row">
              <div className="record-main">
                <span className="record-title">{p.name}</span>
                <span className="small muted">
                  {p.items.map((x) => `${x.qty}× ${x.code}${nameOf(x.code) ? ` ${nameOf(x.code)}` : ` (${t('blPkgMissing')})`}`).join(' · ')}
                </span>
              </div>
              <button type="button" className="btn btn-ghost" disabled={busy} aria-label={t('blPkgDeleteL', { n: p.name })} onClick={() => setDel(p)}>{t('blPkgDelete')}</button>
            </li>
          ))}
        </ul>
      )}
      {del && (
        <Dialog open title={t('blPkgDelete')} onClose={() => setDel(null)} actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDel(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" disabled={busy}
              onClick={async () => { if (await run(async () => { await deleteBillPackage(del.id); await load(); }, t('blPkgDeleted', { n: del.name }))) setDel(null); }}>{t('blPkgDelete')}</button>
          </>
        }>
          <p>{t('blPkgDeleteQ', { n: del.name })}</p>
        </Dialog>
      )}
    </section>
  );
}
