import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatTime, localeOf } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import {
  addMedication,
  addRoutine,
  deleteRoutine,
  isDuplicate,
  isUseMedication,
  listRoutine,
  setAllReminders,
  setReminder,
  updateMedication,
  type MedicationRow,
} from '../lib/api';
import type { PetRow, RoutineRow } from '../lib/supabase';
import { canEdit } from '../lib/sharing';
import { KINDS, REPEATS, isKind, isRepeat, type Kind } from '../lib/domain';
import { KIND_LABEL, REPEAT_LABEL, repeatLabel, routineTitle } from '../lib/labels';
import { toHHMM } from '../lib/time';
import { HINT_TEXT, amountText, doseState, doseText, emptyMedForm, formToMed, isRunning, timesFor, type MedFormValues } from '../lib/medication';
import { PLAN_MED_TIMES_MAX, initialPlanTimes, isLegacyMed, planForDay, validatePlanTimes, type PlanTimesError } from '../lib/plan';
import { recordErrorKey } from '../lib/record';
import { LABEL_MAX, hasErrors, isDuplicateRoutine, validateRoutine, type Errors, type RoutineField, type RoutineFormValues } from '../lib/validate';
import { PetSwitcher } from '../components/PetSwitcher';
import { Switch } from '../components/Switch';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { IconCheck, IconPlus, IconTrash, KindIcon } from '../components/Icons';
import { Loading } from '../components/Loading';
import { usePushStatus } from '../components/PushHint';
import { MedicationForm, inPlan } from '../components/record/MedicationCard';
import { StatusLine, useFocusAfter, useStatus } from '../components/record/shared';
import { useMedsSync } from '../components/schedule/DosesProvider';
import { stateText, useDoseActions, useTodayDoses } from '../components/schedule/TodayMeds';

const EMPTY_FORM: RoutineFormValues = { kind: 'walk', time: '', repeat: 'daily', label: '' };

/** Unter der Liste: Eintrag hinzufügen, neues Medikament oder alten Medikamenten-Eintrag umwandeln */
type Panel = null | { kind: 'add' } | { kind: 'newMed' } | { kind: 'convert'; item: RoutineRow };

export function Routine() {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const { user } = useAuth();
  const { active, memberCount, myRole } = usePets();
  const [items, setItems] = useState<RoutineRow[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useStatus();
  const [toDelete, setToDelete] = useState<RoutineRow | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const { register, focusLater } = useFocusAfter();
  const doses = useTodayDoses();
  const sync = useMedsSync();
  const actions = useDoseActions(doses, setStatus, focusLater);
  const push = usePushStatus();

  const load = useCallback(async (petId: string) => {
    try {
      setError(false);
      setItems(await listRoutine(petId));
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }, []);

  const petId = active?.id;
  useEffect(() => {
    setItems(null);
    setPanel(null);
    if (petId) void load(petId);
  }, [petId, load]);

  if (!active) return null;
  const pet = active;

  // Nur ansehen: keine Schalter, kein Hinzufügen, kein Löschen, kein Abhaken
  const editable = canEdit(myRole(pet));
  const meds = doses.data?.meds ?? [];
  const entries = items ? planForDay(items, meds, pet.id, doses.day, null) : [];
  const allOn = !!items && items.length > 0 && items.every((i) => i.reminder_on);
  const runningMeds = meds.filter((m) => m.pet_id === pet.id && isRunning(m, doses.day)).sort((a, b) => a.name.localeCompare(b.name));

  async function toggleOne(item: RoutineRow, on: boolean) {
    const prev = items;
    setItems((cur) => cur?.map((i) => (i.id === item.id ? { ...i, reminder_on: on } : i)) ?? cur);
    try {
      await setReminder(item.id, on);
      const x = routineTitle(item, t);
      setStatus(t(on ? 'gpOnT' : 'gpOffT', { x }));
    } catch (e) {
      console.error(e);
      setItems(prev);
      setStatus(t('errGeneric'), false);
    }
  }

  async function toggleAll(on: boolean) {
    const prev = items;
    setItems((cur) => cur?.map((i) => ({ ...i, reminder_on: on })) ?? cur);
    try {
      await setAllReminders(pet.id, on);
      setStatus(t(on ? 'gpAllOn' : 'gpAllOff', { n: pet.name }));
    } catch (e) {
      console.error(e);
      setItems(prev);
      setStatus(t('errGeneric'), false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    try {
      await deleteRoutine(item.id);
      setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? cur);
      setStatus(t('gpDeleted', { x: routineTitle(item, t) }));
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'), false);
    }
  }

  function closePanel(focus = 'add') {
    setPanel(null);
    focusLater(focus);
  }

  /** Neues Medikament aus dem Tagesplan: speichern, in alle Ansichten übernehmen */
  async function saveNewMed(v: MedFormValues) {
    const row = await addMedication(pet.id, formToMed(v));
    sync.put(row);
    setStatus(t(inPlan(row) ? 'omSavedPlan' : 'omSaved', { n: row.name }));
    closePanel();
  }

  /** Alten Eintrag „Medikament geben“ umwandeln: erst das Medikament speichern, nur danach den alten Eintrag löschen */
  async function saveConverted(item: RoutineRow, v: MedFormValues) {
    const row = await addMedication(pet.id, formToMed(v));
    sync.put(row);
    closePanel();
    try {
      await deleteRoutine(item.id);
      setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? cur);
      setStatus(t('gpConverted', { n: row.name }));
    } catch (e) {
      console.error(e);
      setStatus(t('gpConvertedKeep', { n: row.name }), false);
    }
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('routineTitle')}</h1>
        <p className="muted">{t('gpSub', { n: pet.name })}</p>
      </header>

      <PetSwitcher />

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!items && !error && <Loading />}

      {items && (
        <section className="card" aria-labelledby="plan-h">
          <div className="card-head">
            <h2 id="plan-h">{t('tplPlan')}</h2>
            {editable && items.length > 0 && <Switch checked={allOn} onChange={(on) => void toggleAll(on)} label={t('gpAll')} />}
          </div>
          {editable && items.length > 0 && memberCount(pet.id) > 1 && <p className="muted small all-hint">{t('gpAllShared', { n: pet.name })}</p>}
          {entries.length === 0 ? (
            <p className="muted">{t('gpEmpty', { n: pet.name })}</p>
          ) : (
            <ul className="routine-list">
              {entries.map((e) => {
                if (e.type === 'med') {
                  const m = e.med;
                  const given = doses.data?.doses.get(e.id) ?? null;
                  const st = doseState(doses.day, e.time, doses.now, given);
                  const hint = m.intake_hint === 'with_food' || m.intake_hint === 'empty_stomach' ? t(HINT_TEXT[m.intake_hint]) : null;
                  const line = [m.name, amountText(m, t, locale), hint].filter(Boolean).join(' · ');
                  const p = { med: m, time: e.time };
                  return (
                    <li key={e.id} className={`routine-row plan-med${given ? ' is-done' : ''}`}>
                      <span className="time mono">{formatTime(e.time, lang)}</span>
                      <KindIcon kind="med" size={22} className="kind-icon" />
                      <div className="routine-text">
                        <Link to={`/tier#med-${m.id}`} className="routine-title plan-med-link">{line}</Link>
                        <span className="plan-med-meta small">
                          <span className="pill pill-med">{t('gpFromMed')}</span>
                          <span className={`pill dose-${st.kind}`}>{stateText(st, user?.id, doses.data?.names ?? new Map(), t)}</span>
                        </span>
                      </div>
                      {editable && (
                        given ? (
                          <button type="button" ref={register(`undo-${e.id}`)} className="btn btn-ghost" disabled={actions.pending === e.id} aria-label={t('odUndoL', { m: m.name, p: pet.name, t: e.time })} onClick={() => void actions.undo(p, given)}>
                            {t('odUndo')}
                          </button>
                        ) : (
                          <button type="button" ref={register(`give-${e.id}`)} className="btn btn-primary" disabled={actions.pending === e.id} aria-label={t('odGiveL', { m: m.name, p: pet.name, t: e.time })} onClick={() => void actions.give(p)}>
                            <IconCheck size={20} />
                            {t('odGive')}
                          </button>
                        )
                      )}
                    </li>
                  );
                }
                const item = e.item;
                const title = routineTitle(item, t);
                const showLabel = item.kind !== 'own' && item.label;
                const time = formatTime(toHHMM(item.time_of_day), lang);
                const legacy = isLegacyMed(item);
                return (
                  <li key={item.id} className={`routine-row${legacy ? ' is-legacy' : ''}`}>
                    <span className="time mono">{time}</span>
                    {isKind(item.kind) && <KindIcon kind={item.kind} size={22} className="kind-icon" />}
                    <div className="routine-text">
                      <span className="routine-title">{title}</span>
                      <span className="muted small">
                        {showLabel ? `${item.label} · ` : ''}
                        {repeatLabel(item.repeat, t)}
                      </span>
                      {legacy && <span className="small legacy-note">{t('gpMedLegacy')}</span>}
                    </div>
                    {editable && (
                      <>
                        {legacy && (
                          <button type="button" className="btn btn-secondary" aria-label={t('gpConvertL', { x: `${title}, ${time}` })} onClick={() => { setPanel({ kind: 'convert', item }); setStatus(''); }}>
                            {t('gpConvert')}
                          </button>
                        )}
                        <Switch checked={item.reminder_on} onChange={(on) => void toggleOne(item, on)} label={t('reminder')} ariaLabel={t('gpSwL', { x: `${title}, ${time}` })} hideLabel />
                        <button type="button" className="btn-icon" aria-label={t('gpDelL', { x: `${title}, ${time}` })} onClick={() => setToDelete(item)}>
                          <IconTrash size={20} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editable && items.length > 0 && (
            <p className="muted small push-note">
              {t('gpPushNote')}
              {push !== null && push !== 'active' && (
                <>
                  {' '}
                  <Link to="/mehr/benachrichtigungen" className="link">{t('pnHintLink')}</Link>
                </>
              )}
            </p>
          )}

          {!editable ? null : panel?.kind === 'add' ? (
            <AddForm
              meds={runningMeds}
              onCancel={() => closePanel()}
              isDuplicate={(v) => isDuplicateRoutine(items, v)}
              onAdd={async (v) => {
                const row = await addRoutine(pet.id, v);
                setItems((cur) => [...(cur ?? []), row]);
                setStatus(t('gpSaved', { x: routineTitle(row, t) }));
                closePanel();
              }}
              onPickMed={async (m, times) => {
                const row = await updateMedication(m.id, { times, frequency: 'daily', remind: true });
                sync.put(row);
                setStatus(t('gpMedTimeSaved', { n: row.name }));
                closePanel();
              }}
              onNewMed={() => setPanel({ kind: 'newMed' })}
            />
          ) : panel?.kind === 'newMed' ? (
            <MedicationForm title={t('mdAdd')} initial={emptyMedForm(doses.day, pet.vet_name)} onCancel={() => closePanel()} onSave={saveNewMed} />
          ) : panel?.kind === 'convert' ? (
            <MedicationForm
              key={panel.item.id}
              title={t('gpConvertTitle')}
              initial={convertForm(panel.item, doses.day, pet)}
              onCancel={() => closePanel()}
              onSave={(v) => saveConverted(panel.item, v)}
            />
          ) : (
            <button type="button" ref={register('add')} className="btn btn-secondary" onClick={() => { setPanel({ kind: 'add' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('addEntry')}
            </button>
          )}
        </section>
      )}

      <Dialog
        open={toDelete !== null}
        title={t('deleteTitle')}
        onClose={() => setToDelete(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToDelete(null)}>
              {t('cancelBtn')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()}>
              {t('gpDelYes')}
            </button>
          </>
        }
      >
        {toDelete && <p>{t('gpDelAsk', { x: `${routineTitle(toDelete, t)} (${formatTime(toHHMM(toDelete.time_of_day), lang)})` })}</p>}
      </Dialog>

      <StatusLine status={status} />
    </div>
  );
}

/** Vorausgefülltes Medikamenten-Formular aus einem alten Tagesplan-Eintrag: Präparat = Bezeichnung, eine Uhrzeit, Menge leer */
function convertForm(item: RoutineRow, today: string, pet: PetRow): MedFormValues {
  const base = emptyMedForm(today, pet.vet_name);
  const times = timesFor('1');
  times[0] = toHHMM(item.time_of_day);
  return { ...base, name: item.label?.trim() ?? '', amount: '', freq: '1', times };
}

function AddForm({
  meds,
  onAdd,
  onPickMed,
  onNewMed,
  onCancel,
  isDuplicate: isDup,
}: {
  meds: MedicationRow[];
  onAdd: (v: RoutineFormValues) => Promise<void>;
  onPickMed: (m: MedicationRow, times: string[]) => Promise<void>;
  onNewMed: () => void;
  onCancel: () => void;
  isDuplicate: (v: RoutineFormValues) => boolean;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<RoutineFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors<RoutineField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLSelectElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => firstRef.current?.focus(), []);

  const set = <K extends RoutineField>(k: K, val: RoutineFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
    setFormError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateRoutine(v);
    setErrors(errs);
    if (hasErrors(errs)) {
      (errs.time ? timeRef : labelRef).current?.focus();
      return;
    }
    if (isDup(v)) {
      setErrors({ time: { key: 'gpErrDup' } });
      timeRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onAdd(v);
    } catch (err) {
      if (isDuplicate(err)) {
        setErrors({ time: { key: 'gpErrDup' } });
        timeRef.current?.focus();
      } else if (isUseMedication(err)) {
        setFormError(t('gpErrUseMed'));
      } else {
        console.error(err);
        setFormError(t('errGeneric'));
      }
    } finally {
      setBusy(false);
    }
  }

  const kindSelect = (
    <Field id={`${uid}-kind`} label={t('gpWhat')}>
      {(a) => (
        <select {...a} ref={firstRef} value={v.kind} onChange={(e) => isKind(e.target.value) && set('kind', e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
          ))}
        </select>
      )}
    </Field>
  );

  // „Medikament“: kein freier Eintrag, sondern ein Medikament aus der Medikation
  if (v.kind === 'med') {
    return (
      <div className="add-form stack" role="group" aria-labelledby={`${uid}-h`}>
        <h3 id={`${uid}-h`}>{t('addEntry')}</h3>
        {kindSelect}
        <MedChooser meds={meds} onPick={onPickMed} onNewMed={onNewMed} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{t('addEntry')}</h3>
      {kindSelect}
      <Field
        id={`${uid}-label`}
        label={v.kind === 'own' ? t('gpOwnText') : t('ownLabel')}
        error={errors.label}
        required={v.kind === 'own'}
        optional={v.kind !== 'own'}
      >
        {(a) => <input {...a} ref={labelRef} type="text" maxLength={LABEL_MAX} value={v.label} onChange={(e) => set('label', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-time`} label={t('gpTime')} error={errors.time} required>
          {(a) => <input {...a} ref={timeRef} type="time" value={v.time} onChange={(e) => set('time', e.target.value)} />}
        </Field>
        <Field id={`${uid}-rep`} label={t('gpRep')}>
          {(a) => (
            <select {...a} value={v.repeat} onChange={(e) => isRepeat(e.target.value) && set('repeat', e.target.value)}>
              {REPEATS.map((r) => (
                <option key={r} value={r}>{t(REPEAT_LABEL[r])}</option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('addBtn')}</button>
      </div>
    </form>
  );
}

/** Laufendes Medikament wählen und seine Uhrzeiten festlegen (ändert pet_medications.times, kein Tagesplan-Eintrag) */
function MedChooser({ meds, onPick, onNewMed, onCancel }: { meds: MedicationRow[]; onPick: (m: MedicationRow, times: string[]) => Promise<void>; onNewMed: () => void; onCancel: () => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [medId, setMedId] = useState<string | null>(meds.length === 1 ? meds[0]!.id : null);
  const med = meds.find((m) => m.id === medId) ?? null;
  const [times, setTimes] = useState<string[]>(() => (med ? initialPlanTimes(med) : []));
  const [errors, setErrors] = useState<(PlanTimesError | undefined)[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef(new Map<number, HTMLInputElement>());

  function choose(m: MedicationRow) {
    setMedId(m.id);
    setTimes(initialPlanTimes(m));
    setErrors([]);
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!med) {
      setFormError(t('gpMedPickErr'));
      return;
    }
    const errs = validatePlanTimes(times);
    if (errs) {
      setErrors(errs);
      refs.current.get(Math.max(0, errs.findIndex(Boolean)))?.focus();
      return;
    }
    setBusy(true);
    try {
      await onPick(med, times.map((x) => x.trim()).sort());
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  if (meds.length === 0) {
    return (
      <>
        <p className="muted">{t('gpMedNone')}</p>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
          <button type="button" className="btn btn-primary" onClick={onNewMed}>
            <IconPlus size={20} />
            {t('gpMedNew')}
          </button>
        </div>
      </>
    );
  }

  const practice = med?.source === 'practice';
  return (
    <form className="stack" onSubmit={submit} noValidate aria-label={t('gpMedFormL')}>
      <fieldset className="field">
        <legend>{t('gpMedPick')}</legend>
        <div className="radio-col">
          {meds.map((m) => (
            <label key={m.id} className="radio">
              <input type="radio" name={`${uid}-med`} value={m.id} checked={medId === m.id} onChange={() => choose(m)} />
              <span>
                <strong>{m.name}</strong> – {doseText(m, t, locale, false)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {med && practice && <p className="notice notice-info">{t('gpMedPrac')}</p>}
      {med && !practice && (
        <div className="stack">
          <div className="med-times">
            {times.map((x, i) => (
              <div key={i} className="plan-time">
                <Field id={`${uid}-t${i}`} label={t('gpMedTimeN', { n: i + 1 })} error={errors[i] ? { key: errors[i] } : undefined} required>
                  {(a) => (
                    <input
                      {...a}
                      ref={(el) => {
                        if (el) refs.current.set(i, el);
                        else refs.current.delete(i);
                      }}
                      type="time"
                      value={x}
                      onChange={(e) => {
                        setTimes((p) => p.map((y, j) => (j === i ? e.target.value : y)));
                        setErrors([]);
                      }}
                    />
                  )}
                </Field>
                {times.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={t('gpMedTimeDelL', { n: i + 1 })}
                    onClick={() => {
                      setTimes((p) => p.filter((_, j) => j !== i));
                      setErrors([]);
                    }}
                  >
                    <IconTrash size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {times.length < PLAN_MED_TIMES_MAX && (
            <button
              type="button"
              className="btn btn-ghost btn-start"
              onClick={() => {
                setTimes((p) => [...p, '']);
                setErrors([]);
              }}
            >
              <IconPlus size={20} />
              {t('gpMedTimeAdd')}
            </button>
          )}
        </div>
      )}
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="button" className="btn btn-secondary" onClick={onNewMed}>{t('gpMedNew')}</button>
        {!practice && (
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
        )}
      </div>
    </form>
  );
}
