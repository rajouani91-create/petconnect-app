import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDateShort, type MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import {
  ApiError,
  addReminder,
  completeReminder,
  deleteReminder,
  listReminders,
  listVaccinationsFor,
  updateReminder,
  type ReminderInput,
  type ReminderRow,
  type VaccinationRow,
} from '../lib/api';
import { downloadIcs, icsFilename, reminderIcs } from '../lib/ics';
import { recordErrorKey } from '../lib/record';
import {
  APPT_TITLE_MAX,
  NOTE_MAX,
  REM_KINDS,
  REM_KIND_LABEL,
  REPEAT_CHOICES,
  REPEAT_LABEL,
  REPEAT_MAX_DAYS,
  completeErrorKey,
  daysToRepeat,
  derivedVaccReminders,
  doneOnError,
  groupReminders,
  isRemKind,
  isRepeatChoice,
  reminderStatus,
  repeatToDays,
  validateReminder,
  type DerivedVacc,
  type RemErrors,
  type RemFormValues,
  type RemGroup,
} from '../lib/schedule';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { IconCalendar, IconCheck, IconPlus, IconTrash } from '../components/Icons';
import { Loading } from '../components/Loading';
import { ConfirmDelete, StatusLine, useFocusAfter, useStatus } from '../components/record/shared';
import { ALL_PETS, PetFilter, PetSelect, useLocalToday, usePetAccess } from '../components/schedule/shared';
import { TodayMeds } from '../components/schedule/TodayMeds';
import { PushHint } from '../components/PushHint';

type Mode = { kind: 'add' } | { kind: 'edit'; row: ReminderRow } | null;

const GROUPS: { key: RemGroup; label: MessageKey }[] = [
  { key: 'overdue', label: 'rmGOverdue' },
  { key: 'today', label: 'rmGToday' },
  { key: 'soon', label: 'rmGSoon' },
  { key: 'later', label: 'rmGLater' },
];

/** Hooks für Laden und Abhaken – auch von der Übersicht genutzt */
export function useReminders() {
  const { pets } = usePets();
  const [rows, setRows] = useState<ReminderRow[] | null>(null);
  const [vaccs, setVaccs] = useState<VaccinationRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const petKey = pets.map((p) => p.id).join(',');
  const load = useCallback(async () => {
    const ids = petKey ? petKey.split(',') : [];
    try {
      const [r, v] = await Promise.all([listReminders(ids), listVaccinationsFor(ids)]);
      setRows(r);
      setVaccs(v);
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petKey]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, setRows, vaccs, loadError, reload: load };
}

/** Erinnerungen aller betreuten Tiere in Gruppen; abgeleitete Impf-Erinnerungen aus der Tierakte (nur Anzeige). */
export function Reminders() {
  const { t, lang } = useI18n();
  const today = useLocalToday();
  const { pets, names, editable, editablePets } = usePetAccess();
  const { rows, setRows, vaccs, loadError } = useReminders();
  const [filter, setFilter] = useState(ALL_PETS);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<ReminderRow | null>(null);
  const [doneOther, setDoneOther] = useState<ReminderRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const shown = (rows ?? []).filter((r) => filter === ALL_PETS || r.pet_id === filter);
  const groups = groupReminders(shown, today);
  const derived = derivedVaccReminders(vaccs.filter((v) => filter === ALL_PETS || v.pet_id === filter), today);
  const anyEditable = editablePets.length > 0;
  const openCount = groups.overdue.length + groups.today.length + groups.soon.length + groups.later.length + derived.length;
  const replace = (row: ReminderRow) => setRows((cur) => (cur ?? []).map((r) => (r.id === row.id ? row : r)));

  async function complete(row: ReminderRow, doneOn: string) {
    try {
      const updated = await completeReminder(row.id, doneOn);
      replace(updated);
      setStatus(updated.repeat_days === null ? t('rmDoneOnce') : t('rmDoneNext', { d: formatIsoDateShort(updated.due_on, lang) }));
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : e);
      setStatus(t(e instanceof ApiError ? completeErrorKey(e.message) : 'errGeneric'), false);
    }
    focusLater(anyEditable ? 'add' : 'top');
  }

  async function remove(row: ReminderRow) {
    setToDelete(null);
    try {
      await deleteReminder(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('rmDeleted', { x: row.title }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  function exportIcs(r: ReminderRow) {
    const pn = names.get(r.pet_id) ?? '';
    downloadIcs(reminderIcs({ id: r.id, title: r.title, petName: pn, dueOn: r.due_on, repeatDays: r.repeat_days }), icsFilename(`${r.title}-${pn}`));
    setStatus(t('calDownloaded'));
  }

  const card = (r: ReminderRow, done = false) => (
    <ReminderItem
      key={r.id}
      r={r}
      today={today}
      done={done}
      petName={names.get(r.pet_id) ?? ''}
      canChange={editable.has(r.pet_id)}
      register={register}
      onComplete={() => void complete(r, today)}
      onCompleteOther={() => setDoneOther(r)}
      onEdit={() => { setMode({ kind: 'edit', row: r }); setStatus(''); }}
      onDelete={() => setToDelete(r)}
      onExport={() => exportIcs(r)}
    />
  );

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 ref={register('top')} tabIndex={-1}>{t('nav_reminders')}</h1>
        <p className="muted">{t('rmSub')}</p>
      </header>

      {!anyEditable && pets.length > 0 && <p className="notice notice-info">{t('rmViewOnly')}</p>}
      <PushHint />
      <TodayMeds />
      <PetFilter pets={pets} value={filter} onChange={setFilter} />

      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {anyEditable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-primary btn-start" onClick={() => { setMode({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('rmAdd')}
            </button>
          )}
          {anyEditable && mode && (
            <section className="card">
              <ReminderForm
                key={mode.kind === 'edit' ? mode.row.id : 'add'}
                pets={editablePets}
                editing={mode.kind === 'edit'}
                initial={
                  mode.kind === 'edit'
                    ? (() => {
                        const rep = daysToRepeat(mode.row.repeat_days);
                        return { petId: mode.row.pet_id, title: mode.row.title, kind: isRemKind(mode.row.kind) ? mode.row.kind : 'other', dueOn: mode.row.due_on, repeat: rep.choice, customDays: rep.custom, note: mode.row.note ?? '' };
                      })()
                    : { petId: filter !== ALL_PETS && editable.has(filter) ? filter : editablePets.length === 1 ? editablePets[0]!.id : '', title: '', kind: 'other', dueOn: today, repeat: 'once', customDays: '', note: '' }
                }
                onCancel={() => {
                  const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                  setMode(null);
                  focusLater(back);
                }}
                onSave={async (petId, input) => {
                  if (mode.kind === 'edit') {
                    const row = await updateReminder(mode.row.id, input);
                    replace(row);
                    setMode(null);
                    setStatus(t('rmUpdated', { x: row.title }));
                    focusLater(`edit-${row.id}`);
                  } else {
                    const row = await addReminder(petId, input);
                    setRows((cur) => [...(cur ?? []), row]);
                    setMode(null);
                    setStatus(t('rmSaved', { x: row.title }));
                    focusLater('add');
                  }
                }}
              />
            </section>
          )}

          {openCount === 0 && <p className="card next-empty">{t('rmAllDone')}</p>}

          {GROUPS.map(({ key, label }) => {
            const list = groups[key];
            const dv = derived.filter((d) => d.group === key);
            if (list.length === 0 && dv.length === 0) return null;
            return (
              <section key={key} className={`card stack rem-group rem-${key}`} aria-labelledby={`rm-${key}-h`}>
                <h2 id={`rm-${key}-h`}>
                  {t(label)} <span className="muted count">({list.length + dv.length})</span>
                </h2>
                <ul className="record-list">
                  {dv.map((d) => <DerivedItem key={`v-${d.id}`} d={d} today={today} petName={names.get(d.petId) ?? ''} />)}
                  {list.map((r) => card(r))}
                </ul>
              </section>
            );
          })}

          {groups.done.length > 0 && (
            <details className="card disclosure">
              <summary>{t('rmDoneH', { n: groups.done.length })}</summary>
              <ul className="record-list">{groups.done.map((r) => card(r, true))}</ul>
            </details>
          )}
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('rmDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('rmDelAsk', { x: toDelete.title })}</p>}
      </ConfirmDelete>
      <DoneOtherDialog row={doneOther} today={today} onClose={() => setDoneOther(null)} onConfirm={(r, d) => { setDoneOther(null); void complete(r, d); }} />
    </div>
  );
}

export function ReminderItem({
  r,
  today,
  done,
  petName,
  canChange,
  register,
  onComplete,
  onCompleteOther,
  onEdit,
  onDelete,
  onExport,
  compact = false,
}: {
  r: ReminderRow;
  today: string;
  done: boolean;
  petName: string;
  canChange: boolean;
  register: (key: string) => (el: HTMLElement | null) => void;
  onComplete: () => void;
  onCompleteOther?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const st = reminderStatus(r.due_on, today);
  const repeat = r.repeat_days === null ? t('rmOnce') : t('rmEvery', { n: r.repeat_days });
  return (
    <li className={`record-row rem-row${done ? ' is-closed' : ''}`}>
      <div className="record-main">
        <span className="record-title">
          {r.title}
          {!done && <span className={`pill rem-st-${st.key === 'rmToday' ? 'today' : st.key.startsWith('rmOverdue') ? 'overdue' : 'later'}`}>{t(st.key, { n: st.n })}</span>}
          {done && <span className="pill pill-ok">{t('rmDoneLabel')}</span>}
        </span>
        <span className="muted small">
          {[isRemKind(r.kind) ? t(REM_KIND_LABEL[r.kind]) : r.kind, petName].filter(Boolean).join(' · ')}
        </span>
        <span className="muted small">
          {[
            done ? (r.last_done_on && t('rmDoneOn', { d: formatIsoDateShort(r.last_done_on, lang) })) : t('rmDueOn', { d: formatIsoDateShort(r.due_on, lang) }),
            repeat,
            !done && r.last_done_on && t('rmLastDone', { d: formatIsoDateShort(r.last_done_on, lang) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {!compact && r.note && <span className="small appt-note">{r.note}</span>}
      </div>
      <div className="row-actions">
        {!done && canChange && (
          <button type="button" className="btn btn-primary" ref={register(`done-${r.id}`)} aria-label={t('rmCompleteL', { x: r.title, p: petName })} onClick={onComplete}>
            <IconCheck size={18} />
            {t('rmComplete')}
          </button>
        )}
        {!compact && (
          <>
            {!done && canChange && onCompleteOther && (
              <button type="button" className="btn btn-ghost" aria-label={t('rmCompleteOtherL', { x: r.title })} onClick={onCompleteOther}>
                {t('rmCompleteOther')}
              </button>
            )}
            {!done && onExport && (
              <button type="button" className="btn btn-ghost" aria-label={t('calExportL', { x: r.title })} onClick={onExport}>
                <IconCalendar size={18} />
                {t('calExport')}
              </button>
            )}
            {canChange && onEdit && (
              <button type="button" className="btn btn-ghost" ref={register(`edit-${r.id}`)} aria-label={t('rmEditL', { x: r.title })} onClick={onEdit}>
                {t('editBtn')}
              </button>
            )}
            {canChange && onDelete && (
              <button type="button" className="btn-icon" aria-label={t('rmDelL', { x: r.title })} onClick={onDelete}>
                <IconTrash size={20} />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function DerivedItem({ d, today, petName }: { d: DerivedVacc; today: string; petName: string }) {
  const { t, lang } = useI18n();
  const st = reminderStatus(d.validUntil, today);
  const expired = d.validUntil < today;
  return (
    <li className="record-row rem-row rem-derived">
      <div className="record-main">
        <span className="record-title">
          {t(expired ? 'rmVaccExpired' : 'rmVaccExpires', { x: d.name, d: formatIsoDateShort(d.validUntil, lang) })}
          <span className={`pill rem-st-${expired ? 'overdue' : st.key === 'rmToday' ? 'today' : 'later'}`}>{t(st.key, { n: st.n })}</span>
        </span>
        <span className="muted small">{[t('rmKindVacc'), petName, t('rmFromRecord')].join(' · ')}</span>
      </div>
      <div className="row-actions">
        <Link to="/tier" className="btn btn-ghost">{t('rmToRecord')}</Link>
      </div>
    </li>
  );
}

function DoneOtherDialog({ row, today, onClose, onConfirm }: { row: ReminderRow | null; today: string; onClose: () => void; onConfirm: (r: ReminderRow, d: string) => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [d, setD] = useState(today);
  const [err, setErr] = useState<MessageKey | undefined>();
  const ref = useRef<HTMLInputElement>(null);
  const rowId = row?.id;
  useEffect(() => {
    if (!rowId) return;
    setD(today);
    setErr(undefined);
  }, [rowId, today]);
  return (
    <Dialog
      open={row !== null}
      title={row ? t('rmCompleteOtherTitle', { x: row.title }) : ''}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const e = doneOnError(d, today);
              if (e) {
                setErr(e);
                ref.current?.focus();
                return;
              }
              if (row) onConfirm(row, d);
            }}
          >
            {t('rmComplete')}
          </button>
        </>
      }
    >
      <Field id={`${uid}-d`} label={t('rmDoneDate')} error={err ? { key: err } : undefined} required>
        {(a) => <input {...a} ref={ref} type="date" max={today} value={d} onChange={(e) => { setD(e.target.value); setErr(undefined); }} />}
      </Field>
    </Dialog>
  );
}

function ReminderForm({
  pets,
  initial,
  editing,
  onSave,
  onCancel,
}: {
  pets: { id: string; name: string }[];
  initial: RemFormValues;
  editing: boolean;
  onSave: (petId: string, v: ReminderInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<RemFormValues>(initial);
  const [errors, setErrors] = useState<RemErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusField = (k: keyof RemFormValues) => formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${k}`)}`)?.focus();

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${initial.petId ? 'title' : 'petId'}`)}`)?.focus();
  }, [initial.petId, uid]);

  const set = <K extends keyof RemFormValues>(k: K, val: RemFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: keyof RemFormValues) => (errors[k] ? { key: errors[k] } : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = validateReminder(v);
    setErrors(errs);
    const first = (['petId', 'title', 'dueOn', 'customDays', 'note'] as const).find((k) => errs[k]);
    if (first) return focusField(first);
    const rep = repeatToDays(v.repeat, v.customDays);
    if (!rep.ok) return focusField('customDays');
    setBusy(true);
    try {
      await onSave(v.petId, { title: v.title.trim(), kind: v.kind, due_on: v.dueOn, repeat_days: rep.days, note: v.note.trim() || null });
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{editing ? t('rmEditTitle') : t('rmAdd')}</h2>
      <Field id={`${uid}-petId`} label={t('schedPet')} error={fe('petId')} required>
        {(a) => <PetSelect a={a} pets={pets} value={v.petId} disabled={editing} onChange={(x) => set('petId', x)} />}
      </Field>
      <Field id={`${uid}-title`} label={t('rmTitle')} hint={t('rmTitleHint')} error={fe('title')} required>
        {(a) => <input {...a} type="text" maxLength={APPT_TITLE_MAX} value={v.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-kind`} label={t('rmKind')}>
          {(a) => (
            <select {...a} value={v.kind} onChange={(e) => isRemKind(e.target.value) && set('kind', e.target.value)}>
              {REM_KINDS.map((k) => <option key={k} value={k}>{t(REM_KIND_LABEL[k])}</option>)}
            </select>
          )}
        </Field>
        <Field id={`${uid}-dueOn`} label={t('rmDue')} error={fe('dueOn')} required>
          {(a) => <input {...a} type="date" value={v.dueOn} onChange={(e) => set('dueOn', e.target.value)} />}
        </Field>
      </div>
      <div className="row-2">
        <Field id={`${uid}-repeat`} label={t('rmRepeat')}>
          {(a) => (
            <select {...a} value={v.repeat} onChange={(e) => { if (isRepeatChoice(e.target.value)) { set('repeat', e.target.value); setErrors((p) => ({ ...p, customDays: undefined })); } }}>
              {REPEAT_CHOICES.map((c) => <option key={c} value={c}>{t(REPEAT_LABEL[c])}</option>)}
            </select>
          )}
        </Field>
        {v.repeat === 'custom' && (
          <Field id={`${uid}-customDays`} label={t('rmCustomDays')} hint={t('rmCustomHint', { n: REPEAT_MAX_DAYS })} error={fe('customDays')} required>
            {(a) => <input {...a} type="text" inputMode="numeric" autoComplete="off" value={v.customDays} onChange={(e) => set('customDays', e.target.value)} />}
          </Field>
        )}
      </div>
      <Field id={`${uid}-note`} label={t('apNote')} error={fe('note')} optional>
        {(a) => <textarea {...a} maxLength={NOTE_MAX} rows={3} value={v.note} onChange={(e) => set('note', e.target.value)} />}
      </Field>
      <p className="muted small">{t('rmIntervalHint')}</p>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
