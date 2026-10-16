import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, type MessageKey } from '../../i18n';
import { addVaccination, deleteVaccination, listVaccinations, updateVaccination, type VaccinationRow } from '../../lib/api';
import {
  VACC_NAME_MAX,
  VACC_STATUS_LABEL,
  recordErrorKey,
  sortVaccinations,
  vaccStatus,
  validateVaccination,
  type VaccErrors,
  type VaccFormValues,
} from '../../lib/record';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ByLine, ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';

type Mode = { kind: 'add' } | { kind: 'edit'; row: VaccinationRow } | null;

/** Vorschläge für den Namen (eigene Eingabe bleibt möglich) */
const SUGGESTIONS: MessageKey[] = ['vsRabies', 'vsDistemper', 'vsParvo', 'vsHepatitis', 'vsLepto', 'vsKennel', 'vsCatFlu', 'vsPanleuk', 'vsLeukosis'];

/** Impfungen: nächste Fälligkeit oben, Status als Text, Praxis-Einträge nicht änderbar. */
export function VaccinationSection({ petId, editable, today, myId, names }: { petId: string; editable: boolean; today: string; myId: string | undefined; names: ReadonlyMap<string, string> }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<VaccinationRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<VaccinationRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      setRows(sortVaccinations(await listVaccinations(petId)));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petId]);
  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const date = (iso: string) => formatIsoDateShort(iso, lang);
  const list = rows ?? [];

  async function save(v: VaccFormValues) {
    const input = { name: v.name.trim(), given_on: v.givenOn || null, valid_until: v.validUntil || null };
    if (mode?.kind === 'edit') {
      const row = await updateVaccination(mode.row.id, input);
      setRows((cur) => sortVaccinations((cur ?? []).map((r) => (r.id === row.id ? row : r))));
      setMode(null);
      setStatus(t('vcUpdated', { n: row.name }));
      focusLater(`edit-${row.id}`);
    } else {
      const row = await addVaccination(petId, input);
      setRows((cur) => sortVaccinations([...(cur ?? []), row]));
      setMode(null);
      setStatus(t('vcSaved', { n: row.name }));
      focusLater('add');
    }
  }

  async function remove(row: VaccinationRow) {
    setToDelete(null);
    try {
      await deleteVaccination(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('vcDeleted', { n: row.name }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  return (
    <div className="stack record-panel">
      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {list.length === 0 ? (
            <p className="muted">{t('vcNone')}</p>
          ) : (
            <ul className="record-list" aria-label={t('vcListL')}>
              {list.map((r) => {
                const st = vaccStatus(r.valid_until, today);
                const practice = r.source === 'practice';
                return (
                  <li key={r.id} className="record-row">
                    <div className="record-main">
                      <span className="record-title">
                        {r.name}
                        {st && <span className={`pill vacc-${st}`}>{t(VACC_STATUS_LABEL[st])}</span>}
                      </span>
                      <span className="muted small">
                        {[r.given_on && t('vcGivenOnV', { d: date(r.given_on) }), r.valid_until && t('vcValidUntilV', { d: date(r.valid_until) })]
                          .filter(Boolean)
                          .join(' · ') || t('vcNoDates')}
                      </span>
                      {practice ? <span className="small practice-note">{t('vcPractice')}</span> : <ByLine ownerId={r.owner_id} myId={myId} names={names} />}
                    </div>
                    {editable && !practice && (
                      <div className="row-actions">
                        <button type="button" ref={register(`edit-${r.id}`)} className="btn btn-ghost" aria-label={t('vcEditL', { n: r.name })} onClick={() => { setMode({ kind: 'edit', row: r }); setStatus(''); }}>
                          {t('editBtn')}
                        </button>
                        <button type="button" className="btn-icon" aria-label={t('vcDelL', { n: r.name })} onClick={() => setToDelete(r)}>
                          <IconTrash size={20} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-secondary btn-start" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('vcAdd')}
            </button>
          )}
          {editable && mode && (
            <VaccinationForm
              key={mode.kind === 'edit' ? mode.row.id : 'add'}
              today={today}
              title={mode.kind === 'edit' ? t('vcEditTitle') : t('vcAdd')}
              initial={
                mode.kind === 'edit'
                  ? { name: mode.row.name, givenOn: mode.row.given_on ?? '', validUntil: mode.row.valid_until ?? '' }
                  : { name: '', givenOn: '', validUntil: '' }
              }
              onCancel={() => {
                const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                setMode(null);
                focusLater(back);
              }}
              onSave={save}
            />
          )}
          <p className="muted small">{t('vcUnchecked')}</p>
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('vcDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('vcDelAsk', { n: toDelete.name })}</p>}
      </ConfirmDelete>
    </div>
  );
}

function VaccinationForm({
  initial,
  today,
  title,
  onSave,
  onCancel,
}: {
  initial: VaccFormValues;
  today: string;
  title: string;
  onSave: (v: VaccFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<VaccFormValues>(initial);
  const [errors, setErrors] = useState<VaccErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const givenRef = useRef<HTMLInputElement>(null);
  const untilRef = useRef<HTMLInputElement>(null);
  const refs = { name: nameRef, givenOn: givenRef, validUntil: untilRef };

  useEffect(() => nameRef.current?.focus(), []);

  const set = <K extends keyof VaccFormValues>(k: K, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof VaccFormValues) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateVaccination(v, today);
    setErrors(errs);
    const first = (['name', 'givenOn', 'validUntil'] as const).find((k) => errs[k]);
    if (first) return refs[first].current?.focus();
    setBusy(true);
    try {
      await onSave(v);
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{title}</h3>
      <Field id={`${uid}-name`} label={t('vcName')} hint={t('vcNameHint')} error={fe('name')} required>
        {(a) => <input {...a} ref={refs.name} type="text" list={`${uid}-list`} maxLength={VACC_NAME_MAX} autoComplete="off" value={v.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <datalist id={`${uid}-list`}>
        {SUGGESTIONS.map((k) => <option key={k} value={t(k)}>{t(k)}</option>)}
      </datalist>
      <div className="row-2">
        <Field id={`${uid}-given`} label={t('vcGivenOn')} error={fe('givenOn')} optional>
          {(a) => <input {...a} ref={refs.givenOn} type="date" max={today} value={v.givenOn} onChange={(e) => set('givenOn', e.target.value)} />}
        </Field>
        <Field id={`${uid}-until`} label={t('vcValidUntil')} error={fe('validUntil')} optional>
          {(a) => <input {...a} ref={refs.validUntil} type="date" min={v.givenOn || undefined} value={v.validUntil} onChange={(e) => set('validUntil', e.target.value)} />}
        </Field>
      </div>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
