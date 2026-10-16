import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import QRCode from 'qrcode';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, type MessageKey } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { addSitter, deleteSitter, listSitters, revokeSitter, type SitterRow } from '../../lib/api';
import {
  SITTER_MAX_DAYS,
  SITTER_NAME_MAX,
  SITTER_STATE_LABEL,
  SITTER_TEXT_MAX,
  mailtoLink,
  sitterLink,
  sitterState,
  validateSitter,
  whatsappLink,
  type SitterFormValues,
} from '../../lib/care';
import { recordErrorKey } from '../../lib/record';
import { addDays } from '../../lib/schedule';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { IconCopy, IconPlus, IconShare, IconTrash } from '../../components/Icons';
import { Loading } from '../../components/Loading';
import { BackToRecord, PetSubpage } from '../../components/more/shared';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from '../../components/record/shared';

/** Betreuung: zeitlich begrenzter Sitter-Zugang per Link/QR-Code, Verweis auf Familie & Mithalter:innen. */
export function Sitting() {
  return <PetSubpage>{(pet, _r, editable) => <SittingView key={pet.id} pet={pet} editable={editable} />}</PetSubpage>;
}

function SittingView({ pet, editable }: { pet: PetRow; editable: boolean }) {
  const { t, lang } = useI18n();
  const today = zonedNow(useNow()).date;
  const [rows, setRows] = useState<SitterRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toRevoke, setToRevoke] = useState<SitterRow | null>(null);
  const [toDelete, setToDelete] = useState<SitterRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    if (!editable) return;
    try {
      setRows(await listSitters(pet.id));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [pet.id, editable]);
  useEffect(() => {
    void load();
  }, [load]);

  const date = (iso: string) => formatIsoDateShort(iso, lang);

  async function revoke(row: SitterRow) {
    setToRevoke(null);
    try {
      const updated = await revokeSitter(row.id);
      setRows((cur) => (cur ?? []).map((r) => (r.id === updated.id ? updated : r)));
      setStatus(t('sitRevokedMsg', { x: row.sitter_name }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater(`del-${row.id}`);
  }

  async function remove(row: SitterRow) {
    setToDelete(null);
    try {
      await deleteSitter(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('sitDeleted', { x: row.sitter_name }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <header className="page-head no-print">
        <h1>{t('sitTitle')}</h1>
        <p className="muted">{t('sitSub')}</p>
      </header>

      {!editable ? (
        <p className="notice notice-info">{t('sitViewOnly')}</p>
      ) : (
        <>
          <div className="notice notice-info no-print">
            <p>{t('sitVisible')}</p>
            <p>{t('sitHidden')}</p>
          </div>
          {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
          {!rows && !loadError && <Loading />}
          {rows && (
            <>
              {adding ? (
                <section className="card no-print">
                  <SitterForm
                    today={today}
                    onCancel={() => { setAdding(false); focusLater('add'); }}
                    onSave={async (input) => {
                      const row = await addSitter(pet.id, input);
                      setRows((cur) => [row, ...(cur ?? [])]);
                      setAdding(false);
                      setStatus(t('sitSaved', { x: row.sitter_name }));
                      focusLater(`link-${row.id}`);
                    }}
                  />
                </section>
              ) : (
                <button type="button" ref={register('add')} className="btn btn-primary btn-start no-print" onClick={() => { setAdding(true); setStatus(''); }}>
                  <IconPlus size={20} />
                  {t('sitAdd')}
                </button>
              )}

              {rows.length === 0 ? (
                <p className="muted">{t('sitNone')}</p>
              ) : (
                rows.map((r) => {
                  const st = sitterState(r, today);
                  return (
                    <section key={r.id} className={`card stack sitter-card${st === 'revoked' || st === 'expired' ? ' is-closed' : ''}`} aria-labelledby={`sit-${r.id}`}>
                      <div className="card-head">
                        <h2 id={`sit-${r.id}`}>{r.sitter_name}</h2>
                        <span className={`pill sit-${st}`}>{t(SITTER_STATE_LABEL[st], { a: date(r.valid_from), b: date(r.valid_to) })}</span>
                      </div>
                      <p className="muted small">{t('sitPeriod', { a: date(r.valid_from), b: date(r.valid_to) })}</p>
                      {(st === 'active' || st === 'upcoming') && <Invite row={r} pet={pet} register={register} onStatus={setStatus} />}
                      <div className="row-actions no-print">
                        {(st === 'active' || st === 'upcoming') && (
                          <button type="button" className="btn btn-ghost" aria-label={t('sitRevokeL', { x: r.sitter_name })} onClick={() => setToRevoke(r)}>
                            {t('sitRevoke')}
                          </button>
                        )}
                        <button type="button" ref={register(`del-${r.id}`)} className="btn-icon" aria-label={t('sitDelL', { x: r.sitter_name })} onClick={() => setToDelete(r)}>
                          <IconTrash size={20} />
                        </button>
                      </div>
                    </section>
                  );
                })
              )}
            </>
          )}
        </>
      )}

      <section className="card stack no-print" aria-labelledby="sit-fam-h">
        <h2 id="sit-fam-h">{t('sitFamTitle')}</h2>
        <p>{t('sitFamText')}</p>
        <Link to="/mehr#familie" className="btn btn-secondary btn-start">{t('sitFamBtn')}</Link>
      </section>
      <StatusLine status={status} />

      <Dialog
        open={toRevoke !== null}
        title={t('sitRevokeTitle')}
        onClose={() => setToRevoke(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToRevoke(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => toRevoke && void revoke(toRevoke)}>{t('sitRevoke')}</button>
          </>
        }
      >
        {toRevoke && <p>{t('sitRevokeAsk', { x: toRevoke.sitter_name })}</p>}
      </Dialog>
      <ConfirmDelete open={toDelete !== null} title={t('sitDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('sitDelAsk', { x: toDelete.sitter_name })}</p>}
      </ConfirmDelete>
    </div>
  );
}

/** Link, QR-Code und Teilen-Knöpfe eines Zugangs. Der Code steht nur im Link, nie in Meldungen oder Logs. */
function Invite({ row, pet, register, onStatus }: { row: SitterRow; pet: PetRow; register: (k: string) => (el: HTMLElement | null) => void; onStatus: (text: string, ok?: boolean) => void }) {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const link = sitterLink(window.location.origin, row.token);
  const [qr, setQr] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const text = t('sitInviteText', {
    o: profile?.display_name?.trim() || t('invSomeone'),
    n: pet.name,
    a: formatIsoDateShort(row.valid_from, lang),
    b: formatIsoDateShort(row.valid_to, lang),
    u: link,
  });

  useEffect(() => {
    let alive = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => alive && setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onStatus(t('invCopied'));
    } catch {
      onStatus(t('invCopyFail'), false);
    }
  }
  async function share() {
    try {
      await navigator.share({ title: t('sitShareTitle', { n: pet.name }), text });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) onStatus(t('errGeneric'), false);
    }
  }
  function printCard() {
    const el = card.current;
    if (!el) return;
    el.classList.add('print-target');
    document.body.classList.add('printing-target');
    const done = () => {
      el.classList.remove('print-target');
      document.body.classList.remove('printing-target');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    // Manche Browser feuern afterprint nicht (z. B. in Tests): spätestens nach dem Druckdialog aufräumen
    setTimeout(done, 1000);
  }

  return (
    <div className="stack sitter-invite">
      <div ref={card} className="sitter-qr-card">
        {qr && <img src={qr} width={168} height={168} alt={t('sitQrAlt', { n: pet.name })} className="sitter-qr" />}
        <p className="sitter-qr-caption">{t('sitScan', { n: pet.name })}</p>
        <p className="invite-url mono" ref={register(`link-${row.id}`)} tabIndex={-1}>{link}</p>
      </div>
      <div className="actions actions-start no-print">
        <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
          <IconCopy size={18} />
          {t('invCopy')}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="btn btn-secondary" onClick={() => void share()}>
            <IconShare size={18} />
            {t('invShare')}
          </button>
        )}
        <a className="btn btn-ghost" href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">{t('sitWhatsapp')}</a>
        <a className="btn btn-ghost" href={mailtoLink(t('sitShareTitle', { n: pet.name }), text)}>{t('sitEmail')}</a>
        <a className="btn btn-ghost" href={link} target="_blank" rel="noopener noreferrer" aria-label={t('sitOpenL', { x: row.sitter_name })}>{t('sitOpen')}</a>
        <button type="button" className="btn btn-ghost" onClick={printCard}>{t('cPrint')}</button>
      </div>
    </div>
  );
}

function SitterForm({ today, onSave, onCancel }: { today: string; onSave: (v: { sitter_name: string; valid_from: string; valid_to: string; feeding: string | null; care_notes: string | null }) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<SitterFormValues>({ name: '', from: today, to: addDays(today, 7), feeding: '', care: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof SitterFormValues, MessageKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);
  const set = <K extends keyof SitterFormValues>(k: K, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof SitterFormValues) => (errors[k] ? { key: errors[k], vars: { n: SITTER_MAX_DAYS } } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateSitter(v);
    setErrors(errs);
    const first = (['name', 'from', 'to', 'feeding', 'care'] as const).find((k) => errs[k]);
    if (first) {
      ref.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${first}`)}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave({ sitter_name: v.name.trim(), valid_from: v.from, valid_to: v.to, feeding: v.feeding.trim() || null, care_notes: v.care.trim() || null });
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Zugang konnte nicht angelegt werden');
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('sitAdd')}</h2>
      <Field id={`${uid}-name`} label={t('sitName')} error={fe('name')} required>
        {(a) => <input {...a} type="text" maxLength={SITTER_NAME_MAX} autoComplete="off" value={v.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-from`} label={t('sitFrom')} error={fe('from')} required>
          {(a) => <input {...a} type="date" value={v.from} onChange={(e) => set('from', e.target.value)} />}
        </Field>
        <Field id={`${uid}-to`} label={t('sitTo')} hint={t('sitMaxHint', { n: SITTER_MAX_DAYS })} error={fe('to')} required>
          {(a) => <input {...a} type="date" min={v.from || undefined} value={v.to} onChange={(e) => set('to', e.target.value)} />}
        </Field>
      </div>
      <Field id={`${uid}-feeding`} label={t('sitFeed')} error={fe('feeding')} optional>
        {(a) => <textarea {...a} rows={3} maxLength={SITTER_TEXT_MAX} value={v.feeding} onChange={(e) => set('feeding', e.target.value)} />}
      </Field>
      <Field id={`${uid}-care`} label={t('sitMeds')} error={fe('care')} optional>
        {(a) => <textarea {...a} rows={3} maxLength={SITTER_TEXT_MAX} value={v.care} onChange={(e) => set('care', e.target.value)} />}
      </Field>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('sitCreate')}</button>
      </div>
    </form>
  );
}
