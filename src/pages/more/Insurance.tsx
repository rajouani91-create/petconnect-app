import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf, type MessageKey } from '../../i18n';
import {
  addClaim,
  addInsurance,
  deleteClaim,
  deleteInsurance,
  listClaims,
  listDocuments,
  listInsurances,
  signedDocumentUrl,
  updateClaim,
  updateInsurance,
  type ClaimInput,
  type ClaimRow,
  type DocumentRow,
  type InsuranceInput,
  type InsuranceRow,
} from '../../lib/api';
import {
  CLAIM_STATUS,
  CLAIM_STATUS_LABEL,
  CLAIM_TITLE_MAX,
  HOLDER_MAX,
  INSURER_MAX,
  INS_NOTE_MAX,
  POLICY_MAX,
  SUBMISSIONS,
  SUBMISSION_LABEL,
  claimTotals,
  estimateReimbursement,
  formatEuro,
  isClaimStatus,
  isSubmission,
  moneyInput,
  parseMoney,
  parsePct,
  validateClaim,
  validateInsurance,
  type ClaimFormValues,
  type InsuranceFormValues,
} from '../../lib/care';
import { recordErrorKey } from '../../lib/record';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { Field } from '../../components/Field';
import { IconPlus, IconTrash } from '../../components/Icons';
import { Loading } from '../../components/Loading';
import { BackToRecord, PetSubpage } from '../../components/more/shared';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from '../../components/record/shared';

type InsMode = { kind: 'add' } | { kind: 'edit'; row: InsuranceRow } | null;
type ClaimMode = { kind: 'add'; insurance: InsuranceRow } | { kind: 'edit'; insurance: InsuranceRow; row: ClaimRow } | null;

/** Versicherungen eines Tiers und Einreichungen (Erstattungen) verfolgen. */
export function Insurance() {
  return <PetSubpage>{(pet, _r, editable) => <InsuranceView key={pet.id} pet={pet} editable={editable} />}</PetSubpage>;
}

function InsuranceView({ pet, editable }: { pet: PetRow; editable: boolean }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const today = zonedNow(useNow()).date;
  const [ins, setIns] = useState<InsuranceRow[] | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [insMode, setInsMode] = useState<InsMode>(null);
  const [claimMode, setClaimMode] = useState<ClaimMode>(null);
  const [delIns, setDelIns] = useState<InsuranceRow | null>(null);
  const [delClaim, setDelClaim] = useState<ClaimRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      const [i, c, d] = await Promise.all([listInsurances(pet.id), listClaims(pet.id), listDocuments(pet.id)]);
      setIns(i);
      setClaims(c);
      setDocs(d);
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [pet.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const eur = (n: number) => formatEuro(Number(n), locale);
  const docTitle = (id: string | null) => docs.find((d) => d.id === id)?.title ?? null;

  async function openDoc(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const win = window.open('', '_blank');
    try {
      const url = await signedDocumentUrl(doc.storage_path, 60);
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else window.location.assign(url);
    } catch (e) {
      win?.close();
      console.error(e instanceof Error ? e.message : 'Dokument konnte nicht geöffnet werden');
      setStatus(t(recordErrorKey(e)), false);
    }
  }

  async function removeIns(row: InsuranceRow) {
    setDelIns(null);
    try {
      await deleteInsurance(row.id);
      setIns((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setClaims((cur) => cur.filter((c) => c.insurance_id !== row.id));
      setStatus(t('insDeleted', { x: row.insurer }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  async function removeClaim(row: ClaimRow) {
    setDelClaim(null);
    try {
      await deleteClaim(row.id);
      setClaims((cur) => cur.filter((c) => c.id !== row.id));
      setStatus(t('clDeleted', { x: row.title }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater(`addc-${row.insurance_id}`);
  }

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <header className="page-head">
        <h1>{t('iTitle')}</h1>
        <p className="muted">{t('iSub', { n: pet.name })}</p>
      </header>
      {!editable && <p className="notice notice-info">{t('insViewOnly')}</p>}
      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!ins && !loadError && <Loading />}

      {ins && (
        <>
          {ins.length === 0 && <p className="muted">{t('insNone')}</p>}

          {ins.map((i) => {
            const mine = claims.filter((c) => c.insurance_id === i.id);
            const sum = claimTotals(mine.map((c) => ({ amount: Number(c.amount), status: c.status, reimbursed_amount: c.reimbursed_amount === null ? null : Number(c.reimbursed_amount) })));
            return (
              <section key={i.id} className="card stack" aria-labelledby={`ins-${i.id}`}>
                <div className="card-head">
                  <h2 id={`ins-${i.id}`}>{i.insurer}</h2>
                  {editable && (
                    <div className="row-actions">
                      <button type="button" ref={register(`edit-${i.id}`)} className="btn btn-ghost" aria-label={t('insEditL', { x: i.insurer })} onClick={() => { setInsMode({ kind: 'edit', row: i }); setStatus(''); }}>
                        {t('editBtn')}
                      </button>
                      <button type="button" className="btn-icon" aria-label={t('insDelL', { x: i.insurer })} onClick={() => setDelIns(i)}>
                        <IconTrash size={20} />
                      </button>
                    </div>
                  )}
                </div>
                <dl className="kv">
                  <dt>{t('insNo')}</dt>
                  <dd className="mono">{i.policy_no}</dd>
                  <dt>{t('insHolder')}</dt>
                  <dd>{i.holder_name || <span className="muted">{t('nothingSet')}</span>}</dd>
                  <dt>{t('insDeductible')}</dt>
                  <dd>{i.deductible === null ? <span className="muted">{t('nothingSet')}</span> : eur(i.deductible)}</dd>
                  <dt>{t('insPct')}</dt>
                  <dd>{i.reimbursement_pct === null ? <span className="muted">{t('nothingSet')}</span> : `${i.reimbursement_pct} %`}</dd>
                  <dt>{t('insSubmission')}</dt>
                  <dd>{isSubmission(i.submission) ? t(SUBMISSION_LABEL[i.submission]) : <span className="muted">{t('nothingSet')}</span>}</dd>
                  {i.note && (
                    <>
                      <dt>{t('apNote')}</dt>
                      <dd className="pre">{i.note}</dd>
                    </>
                  )}
                </dl>

                <h3>{t('clTitle')}</h3>
                {mine.length === 0 ? (
                  <p className="muted">{t('clNone')}</p>
                ) : (
                  <ul className="record-list">
                    {mine.map((c) => {
                      const st = isClaimStatus(c.status) ? c.status : 'open';
                      const est = estimateReimbursement(Number(c.amount), i.reimbursement_pct);
                      const dt = docTitle(c.document_id);
                      return (
                        <li key={c.id} className="record-row">
                          <div className="record-main">
                            <span className="record-title">
                              {c.title}
                              <span className={`pill claim-${st}`}>{t(CLAIM_STATUS_LABEL[st])}</span>
                            </span>
                            <span className="muted small">
                              {formatIsoDateShort(c.claim_date, lang)} · {t('clAmountV', { a: eur(c.amount) })}
                              {c.reimbursed_amount !== null && ` · ${t('clReimbV', { a: eur(c.reimbursed_amount) })}`}
                            </span>
                            {est !== null && c.reimbursed_amount === null && <span className="small">{t('clEstimate', { a: eur(est) })}</span>}
                            {c.document_id && dt && (
                              <button type="button" className="link" aria-label={t('dcOpenL', { n: dt })} onClick={() => void openDoc(c.document_id!)}>
                                {t('clDocOpen', { x: dt })}
                              </button>
                            )}
                            {c.note && <span className="small appt-note">{c.note}</span>}
                          </div>
                          {editable && (
                            <div className="row-actions">
                              <button type="button" ref={register(`editc-${c.id}`)} className="btn btn-ghost" aria-label={t('clEditL', { x: c.title })} onClick={() => { setClaimMode({ kind: 'edit', insurance: i, row: c }); setStatus(''); }}>
                                {t('editBtn')}
                              </button>
                              <button type="button" className="btn-icon" aria-label={t('clDelL', { x: c.title })} onClick={() => setDelClaim(c)}>
                                <IconTrash size={20} />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {mine.length > 0 && (
                  <dl className="kv claim-sums" aria-label={t('clSumsL', { x: i.insurer })}>
                    <dt>{t('clSumSubmitted')}</dt>
                    <dd>{eur(sum.submitted)}</dd>
                    <dt>{t('clSumReimbursed')}</dt>
                    <dd>{eur(sum.reimbursed)}</dd>
                    <dt>{t('clSumPending')}</dt>
                    <dd>{eur(sum.pending)}</dd>
                  </dl>
                )}
                {editable && claimMode?.insurance.id === i.id ? (
                  <ClaimForm
                    key={claimMode.kind === 'edit' ? claimMode.row.id : `add-${i.id}`}
                    today={today}
                    docs={docs}
                    pct={i.reimbursement_pct}
                    editing={claimMode.kind === 'edit'}
                    initial={
                      claimMode.kind === 'edit'
                        ? {
                            title: claimMode.row.title,
                            amount: moneyInput(Number(claimMode.row.amount), locale),
                            date: claimMode.row.claim_date,
                            status: isClaimStatus(claimMode.row.status) ? claimMode.row.status : 'open',
                            reimbursed: claimMode.row.reimbursed_amount === null ? '' : moneyInput(Number(claimMode.row.reimbursed_amount), locale),
                            documentId: claimMode.row.document_id ?? '',
                            note: claimMode.row.note ?? '',
                          }
                        : { title: '', amount: '', date: today, status: 'open', reimbursed: '', documentId: '', note: '' }
                    }
                    onCancel={() => {
                      const back = claimMode.kind === 'edit' ? `editc-${claimMode.row.id}` : `addc-${i.id}`;
                      setClaimMode(null);
                      focusLater(back);
                    }}
                    onSave={async (input) => {
                      if (claimMode.kind === 'edit') {
                        const row = await updateClaim(claimMode.row.id, input);
                        setClaims((cur) => cur.map((c) => (c.id === row.id ? row : c)));
                        setStatus(t('clUpdated', { x: row.title }));
                        setClaimMode(null);
                        focusLater(`editc-${row.id}`);
                      } else {
                        const row = await addClaim(i.id, pet.id, input);
                        setClaims((cur) => [row, ...cur]);
                        setStatus(t('clSaved', { x: row.title }));
                        setClaimMode(null);
                        focusLater(`addc-${i.id}`);
                      }
                    }}
                  />
                ) : (
                  editable && (
                    <button type="button" ref={register(`addc-${i.id}`)} className="btn btn-secondary btn-start" onClick={() => { setClaimMode({ kind: 'add', insurance: i }); setStatus(''); }}>
                      <IconPlus size={20} />
                      {t('clAdd')}
                    </button>
                  )
                )}
              </section>
            );
          })}

          {editable && insMode === null && (
            <button type="button" ref={register('add')} className="btn btn-primary btn-start" onClick={() => { setInsMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('insAdd')}
            </button>
          )}
          {editable && insMode && (
            <section className="card">
              <InsuranceForm
                key={insMode.kind === 'edit' ? insMode.row.id : 'add'}
                editing={insMode.kind === 'edit'}
                initial={
                  insMode.kind === 'edit'
                    ? {
                        insurer: insMode.row.insurer,
                        policyNo: insMode.row.policy_no,
                        holder: insMode.row.holder_name ?? '',
                        deductible: insMode.row.deductible === null ? '' : moneyInput(Number(insMode.row.deductible), locale),
                        pct: insMode.row.reimbursement_pct === null ? '' : String(insMode.row.reimbursement_pct),
                        submission: isSubmission(insMode.row.submission) ? insMode.row.submission : '',
                        note: insMode.row.note ?? '',
                      }
                    : { insurer: '', policyNo: '', holder: '', deductible: '', pct: '', submission: '', note: '' }
                }
                onCancel={() => {
                  const back = insMode.kind === 'edit' ? `edit-${insMode.row.id}` : 'add';
                  setInsMode(null);
                  focusLater(back);
                }}
                onSave={async (input) => {
                  if (insMode.kind === 'edit') {
                    const row = await updateInsurance(insMode.row.id, input);
                    setIns((cur) => (cur ?? []).map((r) => (r.id === row.id ? row : r)));
                    setStatus(t('insUpdated', { x: row.insurer }));
                    setInsMode(null);
                    focusLater(`edit-${row.id}`);
                  } else {
                    const row = await addInsurance(pet.id, input);
                    setIns((cur) => [...(cur ?? []), row]);
                    setStatus(t('insSaved', { x: row.insurer }));
                    setInsMode(null);
                    focusLater('add');
                  }
                }}
              />
            </section>
          )}
          <p className="muted small">{t('clStatusHint')}</p>
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={delIns !== null} title={t('insDelTitle')} onCancel={() => setDelIns(null)} onConfirm={() => delIns && void removeIns(delIns)}>
        {delIns && <p>{t('insDelAsk', { x: delIns.insurer })}</p>}
      </ConfirmDelete>
      <ConfirmDelete open={delClaim !== null} title={t('clDelTitle')} onCancel={() => setDelClaim(null)} onConfirm={() => delClaim && void removeClaim(delClaim)}>
        {delClaim && <p>{t('clDelAsk', { x: delClaim.title })}</p>}
      </ConfirmDelete>
    </div>
  );
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

function useFormFocus(uid: string) {
  const ref = useRef<HTMLFormElement>(null);
  const focus = (k: string) => ref.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${k}`)}`)?.focus();
  return { ref, focus };
}

function InsuranceForm({ initial, editing, onSave, onCancel }: { initial: InsuranceFormValues; editing: boolean; onSave: (v: InsuranceInput) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof InsuranceFormValues, MessageKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ref, focus } = useFormFocus(uid);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input')?.focus();
  }, [ref]);
  const set = <K extends keyof InsuranceFormValues>(k: K, val: InsuranceFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof InsuranceFormValues) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateInsurance(v);
    setErrors(errs);
    const first = (['insurer', 'policyNo', 'holder', 'deductible', 'pct', 'note'] as const).find((k) => errs[k]);
    if (first) return focus(first);
    const d = v.deductible.trim() ? parseMoney(v.deductible, true) : null;
    setBusy(true);
    try {
      await onSave({
        insurer: v.insurer.trim(),
        policy_no: v.policyNo.trim(),
        holder_name: orNull(v.holder),
        deductible: d && d.ok ? d.value : null,
        reimbursement_pct: parsePct(v.pct),
        submission: v.submission || null,
        note: orNull(v.note),
      });
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{editing ? t('insEditTitle') : t('insAdd')}</h2>
      <Field id={`${uid}-insurer`} label={t('insInsurer')} error={fe('insurer')} required>
        {(a) => <input {...a} type="text" maxLength={INSURER_MAX} autoComplete="off" value={v.insurer} onChange={(e) => set('insurer', e.target.value)} />}
      </Field>
      <Field id={`${uid}-policyNo`} label={t('insNo')} error={fe('policyNo')} required>
        {(a) => <input {...a} type="text" maxLength={POLICY_MAX} autoComplete="off" value={v.policyNo} onChange={(e) => set('policyNo', e.target.value)} />}
      </Field>
      <Field id={`${uid}-holder`} label={t('insHolder')} error={fe('holder')} optional>
        {(a) => <input {...a} type="text" maxLength={HOLDER_MAX} value={v.holder} onChange={(e) => set('holder', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-deductible`} label={t('insDeductibleEur')} hint={t('insMoneyHint')} error={fe('deductible')} optional>
          {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" value={v.deductible} onChange={(e) => set('deductible', e.target.value)} />}
        </Field>
        <Field id={`${uid}-pct`} label={t('insPctL')} hint={t('insPctHint')} error={fe('pct')} optional>
          {(a) => <input {...a} type="text" inputMode="numeric" autoComplete="off" value={v.pct} onChange={(e) => set('pct', e.target.value)} />}
        </Field>
      </div>
      <Field id={`${uid}-submission`} label={t('insSubmission')} optional>
        {(a) => (
          <select {...a} value={v.submission} onChange={(e) => set('submission', isSubmission(e.target.value) ? e.target.value : '')}>
            <option value="">{t('nothingSet')}</option>
            {SUBMISSIONS.map((s) => <option key={s} value={s}>{t(SUBMISSION_LABEL[s])}</option>)}
          </select>
        )}
      </Field>
      <Field id={`${uid}-note`} label={t('apNote')} error={fe('note')} optional>
        {(a) => <textarea {...a} rows={2} maxLength={INS_NOTE_MAX} value={v.note} onChange={(e) => set('note', e.target.value)} />}
      </Field>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}

function ClaimForm({
  initial,
  today,
  docs,
  pct,
  editing,
  onSave,
  onCancel,
}: {
  initial: ClaimFormValues;
  today: string;
  docs: DocumentRow[];
  pct: number | null;
  editing: boolean;
  onSave: (v: ClaimInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ClaimFormValues, MessageKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ref, focus } = useFormFocus(uid);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input')?.focus();
  }, [ref]);
  const set = <K extends keyof ClaimFormValues>(k: K, val: ClaimFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof ClaimFormValues) => (errors[k] ? { key: errors[k] } : undefined);
  const amount = parseMoney(v.amount);
  const est = amount.ok ? estimateReimbursement(amount.value, pct) : null;
  // Rechnungen zuerst, dann übrige Dokumente
  const sortedDocs = [...docs].sort((a, b) => Number(b.category === 'invoice') - Number(a.category === 'invoice') || a.title.localeCompare(b.title));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateClaim(v, today);
    setErrors(errs);
    const first = (['title', 'amount', 'date', 'reimbursed', 'note'] as const).find((k) => errs[k]);
    if (first) return focus(first);
    const a = parseMoney(v.amount);
    const r = v.reimbursed.trim() ? parseMoney(v.reimbursed, true) : null;
    if (!a.ok) return focus('amount');
    setBusy(true);
    try {
      await onSave({
        title: v.title.trim(),
        amount: a.value,
        claim_date: v.date,
        status: v.status,
        reimbursed_amount: r && r.ok ? r.value : null,
        document_id: v.documentId || null,
        note: orNull(v.note),
      });
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form ref={ref} className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{editing ? t('clEditTitle') : t('clAdd')}</h3>
      <Field id={`${uid}-title`} label={t('clName')} hint={t('clNameHint')} error={fe('title')} required>
        {(a) => <input {...a} type="text" maxLength={CLAIM_TITLE_MAX} value={v.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-amount`} label={t('clAmount')} hint={t('insMoneyHint')} error={fe('amount')} required>
          {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" value={v.amount} onChange={(e) => set('amount', e.target.value)} />}
        </Field>
        <Field id={`${uid}-date`} label={t('clDate')} error={fe('date')} required>
          {(a) => <input {...a} type="date" max={today} value={v.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
      </div>
      {est !== null && <p className="small notice notice-info">{t('clEstimate', { a: formatEuro(est, locale) })}</p>}
      <div className="row-2">
        <Field id={`${uid}-status`} label={t('clStatus')}>
          {(a) => (
            <select {...a} value={v.status} onChange={(e) => isClaimStatus(e.target.value) && set('status', e.target.value)}>
              {CLAIM_STATUS.map((s) => <option key={s} value={s}>{t(CLAIM_STATUS_LABEL[s])}</option>)}
            </select>
          )}
        </Field>
        <Field id={`${uid}-reimbursed`} label={t('clRefLbl')} error={fe('reimbursed')} optional>
          {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" value={v.reimbursed} onChange={(e) => set('reimbursed', e.target.value)} />}
        </Field>
      </div>
      <Field id={`${uid}-doc`} label={t('clDoc')} hint={docs.length === 0 ? t('clDocNone') : undefined} optional>
        {(a) => (
          <select {...a} value={v.documentId} onChange={(e) => set('documentId', e.target.value)} disabled={docs.length === 0}>
            <option value="">{t('clDocPick')}</option>
            {sortedDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
                {d.doc_date ? ` (${formatIsoDateShort(d.doc_date, lang)})` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={`${uid}-note`} label={t('apNote')} error={fe('note')} optional>
        {(a) => <textarea {...a} rows={2} maxLength={INS_NOTE_MAX} value={v.note} onChange={(e) => set('note', e.target.value)} />}
      </Field>
      <p className="muted small">{t('clStatusHint')}</p>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
