import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { usePets } from '../../pets/PetsProvider';
import {
  addMedication,
  deleteMedication,
  listMedications,
  profileNames,
  stopMedication,
  updateMedNotes,
  updateMedication,
  type MedicationRow,
} from '../../lib/api';
import {
  FREQ_CHOICES,
  INTAKE_HINTS,
  HINT_TEXT,
  MED_BY_MAX,
  MED_NAME_MAX,
  MED_STATUS_LABEL,
  MED_TEXT_MAX,
  MED_UNITS,
  doseText,
  emptyMedForm,
  firstError,
  formToMed,
  medStatus,
  medToForm,
  splitMeds,
  timesCount,
  timesFor,
  unitOptionText,
  validateMed,
  type FreqChoice,
  type MedErrors,
  type MedFormValues,
} from '../../lib/medication';
import { recordErrorKey } from '../../lib/record';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';

type Mode = { kind: 'add' } | { kind: 'edit'; row: MedicationRow } | null;
const NOTES_MAX = 1000;

/**
 * Tierakte → „Medikation“: strukturierte Medikamente (Präparat, Menge, Einheit, Uhrzeiten, Hinweis, Zeitraum).
 * Sicherheitshinweis immer sichtbar. Die App berechnet und empfiehlt keine Dosierungen.
 */
export function MedicationCard({ pet, editable }: { pet: PetRow; editable: boolean }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const { user } = useAuth();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [rows, setRows] = useState<MedicationRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<MedicationRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      const list = await listMedications([pet.id]);
      setRows(list);
      setLoadError(false);
      const others = [...new Set(list.map((m) => m.owner_id))];
      setNames(await profileNames(others).catch(() => new Map<string, string>()));
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [pet.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const { current, ended } = splitMeds(rows ?? [], today);
  const date = (iso: string) => formatIsoDateShort(iso, lang);
  const replace = (row: MedicationRow) => setRows((cur) => (cur ?? []).map((r) => (r.id === row.id ? row : r)));

  async function save(v: MedFormValues) {
    const input = formToMed(v);
    if (mode?.kind === 'edit') {
      const row = await updateMedication(mode.row.id, input);
      replace(row);
      setMode(null);
      setStatus(t('omUpdated', { n: row.name }));
      focusLater(`edit-${row.id}`);
    } else {
      const row = await addMedication(pet.id, input);
      setRows((cur) => [...(cur ?? []), row]);
      setMode(null);
      setStatus(t('omSaved', { n: row.name }));
      focusLater('add');
    }
  }

  async function stop(row: MedicationRow) {
    try {
      replace(await stopMedication(row.id, today));
      setStatus(t('mdStopped'));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  async function remove(row: MedicationRow) {
    setToDelete(null);
    try {
      await deleteMedication(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('mdDeleted'));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  const source = (m: MedicationRow) =>
    m.source === 'practice' ? t('mdByPrac') : m.owner_id === user?.id ? t('omByMe') : names.get(m.owner_id)?.trim() ? t('omByOther', { n: names.get(m.owner_id)!.trim() }) : null;

  const item = (m: MedicationRow) => {
    const st = medStatus(m, today);
    const practice = m.source === 'practice';
    const src = source(m);
    const period = [t('mdSince', { d: date(m.starts_on) }), m.stopped_on && (!m.ends_on || m.stopped_on < m.ends_on) ? t('mdUntil', { d: date(m.stopped_on) }) : m.ends_on ? t('mdUntil', { d: date(m.ends_on) }) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <li key={m.id} className="record-row med-row">
        <div className="record-main">
          <span className="record-title">
            {m.name}
            <span className={`pill med-${st}`}>{t(MED_STATUS_LABEL[st])}</span>
          </span>
          {src && <span className={`small${practice ? ' practice-note' : ' muted'}`}>{src}</span>}
          <span className="med-dose">{doseText(m, t, locale, false)}</span>
          {m.note && <span className="small">{m.note}</span>}
          {m.reason && <span className="muted small">{m.reason}</span>}
          {m.prescribed_by && <span className="muted small">{t('omBySrc', { p: m.prescribed_by })}</span>}
          <span className="muted small">{period}</span>
          {practice && editable && <span className="small muted">{t('omPracOnly')}</span>}
        </div>
        {editable && !practice && (
          <div className="row-actions">
            <button type="button" ref={register(`edit-${m.id}`)} className="btn btn-ghost" aria-label={t('omEditL', { n: m.name })} onClick={() => { setMode({ kind: 'edit', row: m }); setStatus(''); }}>
              {t('editBtn')}
            </button>
            {st !== 'ended' && (
              <button type="button" className="btn btn-ghost" aria-label={t('omStopL', { n: m.name })} onClick={() => void stop(m)}>
                {t('mdStop')}
              </button>
            )}
            <button type="button" className="btn-icon" aria-label={t('omDelL', { n: m.name })} onClick={() => setToDelete(m)}>
              <IconTrash size={20} />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`} id="medikation">
      <h2 id={`${uid}-h`}>{t('mdTitle')}</h2>
      <p className="med-safe" role="note">{t('omSafe')}</p>

      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {current.length === 0 ? (
            <p className="muted">{t('mdNone')}</p>
          ) : (
            <ul className="record-list" aria-label={t('omListL', { n: pet.name })}>{current.map(item)}</ul>
          )}
          {ended.length > 0 && (
            <details className="disclosure">
              <summary>{t('omEndedH', { n: ended.length })}</summary>
              <ul className="record-list">{ended.map(item)}</ul>
            </details>
          )}

          {editable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-secondary btn-start" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('mdAdd')}
            </button>
          )}
          {editable && mode && (
            <MedicationForm
              key={mode.kind === 'edit' ? mode.row.id : 'add'}
              title={mode.kind === 'edit' ? t('omEditTitle') : t('mdAdd')}
              initial={mode.kind === 'edit' ? medToForm(mode.row, locale) : emptyMedForm(today, pet.vet_name)}
              onCancel={() => {
                const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                setMode(null);
                focusLater(back);
              }}
              onSave={save}
            />
          )}
        </>
      )}

      <MedNotes pet={pet} editable={editable} onStatus={setStatus} />
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('omDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('omDelAsk', { n: toDelete.name })}</p>}
      </ConfirmDelete>
    </section>
  );
}

/** „Weitere Hinweise zur Medikation“ – das bisherige Freitextfeld pets.medications */
function MedNotes({ pet, editable, onStatus }: { pet: PetRow; editable: boolean; onStatus: (text: string, ok?: boolean) => void }) {
  const { t } = useI18n();
  const uid = useId();
  const { upsertLocal } = usePets();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(pet.medications ?? '');
  const [busy, setBusy] = useState(false);
  const { register, focusLater } = useFocusAfter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      upsertLocal(await updateMedNotes(pet.id, text.trim() ? text.trim().slice(0, NOTES_MAX) : null));
      setEditing(false);
      onStatus(t('savedShort'));
      focusLater('notes-edit');
    } catch (err) {
      console.error(err);
      onStatus(t(recordErrorKey(err)), false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form className="add-form stack" onSubmit={submit} aria-labelledby={`${uid}-h`}>
        <h3 id={`${uid}-h`} className="sr-only">{t('medNotes')}</h3>
        <Field id={`${uid}-n`} label={t('medNotes')} optional>
          {(a) => <textarea {...a} rows={3} maxLength={NOTES_MAX} value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setText(pet.medications ?? ''); focusLater('notes-edit'); }}>{t('cancelBtn')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
        </div>
      </form>
    );
  }
  return (
    <div className="stack med-notes">
      <h3>{t('medNotes')}</h3>
      <p className={pet.medications?.trim() ? 'pre' : 'muted'}>{pet.medications?.trim() || t('nothingSet')}</p>
      {editable && (
        <button type="button" ref={register('notes-edit')} className="btn btn-ghost btn-start" onClick={() => { setText(pet.medications ?? ''); setEditing(true); }}>
          {t('medNotesEdit')}
        </button>
      )}
    </div>
  );
}

function MedicationForm({ initial, title, onSave, onCancel }: { initial: MedFormValues; title: string; onSave: (v: MedFormValues) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<MedFormValues>(initial);
  const [errors, setErrors] = useState<MedErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef(new Map<string, HTMLElement>());
  const reg = (k: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(k, el);
    else refs.current.delete(k);
  };

  useEffect(() => refs.current.get('name')?.focus(), []);

  const set = <K extends keyof MedFormValues>(k: K, val: MedFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const setTime = (i: number, val: string) => {
    setV((p) => ({ ...p, times: p.times.map((x, j) => (j === i ? val : x)) }));
    setErrors((p) => ({ ...p, times: undefined }));
  };
  const setFreq = (f: FreqChoice) => {
    // Neue Anzahl: vorbelegte Zeiten, bereits eingetragene bleiben an ihrer Stelle
    setV((p) => {
      const d = timesFor(f);
      const n = timesCount(f);
      return { ...p, freq: f, times: d.map((x, i) => (i < n && i < timesCount(p.freq) && p.times[i] ? p.times[i]! : x)) };
    });
    setErrors((p) => ({ ...p, times: undefined }));
  };
  const fe = (k: string | undefined) => (k ? { key: k as Parameters<typeof t>[0] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateMed(v);
    setErrors(errs);
    const first = firstError(errs);
    if (first) return refs.current.get(first)?.focus();
    setBusy(true);
    try {
      await onSave(v);
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  const n = timesCount(v.freq);
  const group = (labelId: string, children: ReactNode) => (
    <div className="chips" role="group" aria-labelledby={labelId}>{children}</div>
  );

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{title}</h3>
      <Field id={`${uid}-name`} label={t('mdName')} error={fe(errors.name)} required>
        {(a) => <input {...a} ref={reg('name')} type="text" maxLength={MED_NAME_MAX} autoComplete="off" value={v.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-amt`} label={t('omAmt')} hint={t('omAmtHint')} error={fe(errors.amount)} required>
          {(a) => <input {...a} ref={reg('amount')} type="text" inputMode="decimal" autoComplete="off" maxLength={8} value={v.amount} onChange={(e) => set('amount', e.target.value)} />}
        </Field>
        <Field id={`${uid}-unit`} label={t('omUnit')}>
          {(a) => (
            <select {...a} value={v.unit} onChange={(e) => set('unit', e.target.value as MedFormValues['unit'])}>
              {MED_UNITS.map((u) => <option key={u} value={u}>{unitOptionText(u, t)}</option>)}
            </select>
          )}
        </Field>
      </div>

      <div className="field">
        <span className="label-text" id={`${uid}-freq`}>{t('omFreq')}</span>
        {group(
          `${uid}-freq`,
          FREQ_CHOICES.map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={v.freq === f} onClick={() => setFreq(f)}>
              {f === 'as_needed' ? t('omPrn') : t('omDaily', { n: f })}
            </button>
          )),
        )}
      </div>
      {n === 0 ? (
        <p className="muted small">{t('omPrnNote')}</p>
      ) : (
        <div className="med-times">
          {Array.from({ length: n }, (_, i) => (
            <Field key={i} id={`${uid}-t${i}`} label={t('omTimeN', { n: i + 1 })} error={fe(errors.times?.[i])} required>
              {(a) => <input {...a} ref={reg(`time-${i}`)} type="time" value={v.times[i] ?? ''} onChange={(e) => setTime(i, e.target.value)} />}
            </Field>
          ))}
        </div>
      )}

      <fieldset className="field">
        <legend>{t('omHint')}</legend>
        <div className="radio-row">
          {INTAKE_HINTS.map((h) => (
            <label key={h} className="radio">
              <input type="radio" name={`${uid}-hint`} value={h} checked={v.hint === h} onChange={() => set('hint', h)} />
              {t(HINT_TEXT[h])}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`${uid}-note`} label={t('omNoteL')} optional>
        {(a) => <input {...a} type="text" maxLength={MED_TEXT_MAX} value={v.note} onChange={(e) => set('note', e.target.value)} />}
      </Field>
      <Field id={`${uid}-why`} label={t('omWhyL')} optional>
        {(a) => <input {...a} type="text" maxLength={MED_TEXT_MAX} value={v.reason} onChange={(e) => set('reason', e.target.value)} />}
      </Field>
      <Field id={`${uid}-by`} label={t('omByL')} optional>
        {(a) => <input {...a} type="text" maxLength={MED_BY_MAX} value={v.prescribedBy} onChange={(e) => set('prescribedBy', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-from`} label={t('mdFrom')} error={fe(errors.startsOn)} required>
          {(a) => <input {...a} ref={reg('startsOn')} type="date" value={v.startsOn} onChange={(e) => set('startsOn', e.target.value)} />}
        </Field>
        <Field id={`${uid}-to`} label={t('mdTo')} error={fe(errors.endsOn)}>
          {(a) => <input {...a} ref={reg('endsOn')} type="date" min={v.startsOn || undefined} value={v.endsOn} onChange={(e) => set('endsOn', e.target.value)} />}
        </Field>
      </div>
      {n > 0 && (
        <label className="check-row" htmlFor={`${uid}-rem`}>
          <input id={`${uid}-rem`} type="checkbox" checked={v.remind} onChange={(e) => set('remind', e.target.checked)} />
          <span>{t('omRemind')}</span>
        </label>
      )}
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
