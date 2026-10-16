import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatTime } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { addRoutine, deleteRoutine, isDuplicate, listRoutine, setAllReminders, setReminder } from '../lib/api';
import type { RoutineRow } from '../lib/supabase';
import { KINDS, REPEATS, isKind, isRepeat, type Kind } from '../lib/domain';
import { KIND_LABEL, REPEAT_LABEL, repeatLabel, routineTitle } from '../lib/labels';
import { toHHMM, toMinutes } from '../lib/time';
import { LABEL_MAX, hasErrors, isDuplicateRoutine, validateRoutine, type Errors, type RoutineField, type RoutineFormValues } from '../lib/validate';
import { PetSwitcher } from '../components/PetSwitcher';
import { Switch } from '../components/Switch';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { IconPlus, IconTrash, KindIcon } from '../components/Icons';
import { Loading } from '../components/Loading';

const EMPTY_FORM: RoutineFormValues = { kind: 'walk', time: '', repeat: 'daily', label: '' };

export function Routine() {
  const { t, lang } = useI18n();
  const { active } = usePets();
  const [items, setItems] = useState<RoutineRow[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('');
  const [toDelete, setToDelete] = useState<RoutineRow | null>(null);
  const [adding, setAdding] = useState(false);

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
    if (petId) void load(petId);
  }, [petId, load]);

  if (!active) return null;

  const sorted = items ? [...items].sort((a, b) => toMinutes(a.time_of_day) - toMinutes(b.time_of_day)) : [];
  const allOn = sorted.length > 0 && sorted.every((i) => i.reminder_on);

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
      setStatus(t('errGeneric'));
    }
  }

  async function toggleAll(on: boolean) {
    if (!active) return;
    const prev = items;
    setItems((cur) => cur?.map((i) => ({ ...i, reminder_on: on })) ?? cur);
    try {
      await setAllReminders(active.id, on);
      setStatus(t(on ? 'gpAllOn' : 'gpAllOff', { n: active.name }));
    } catch (e) {
      console.error(e);
      setItems(prev);
      setStatus(t('errGeneric'));
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
      setStatus(t('errGeneric'));
    }
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('routineTitle')}</h1>
        <p className="muted">{t('gpSub', { n: active.name })}</p>
      </header>

      <PetSwitcher />

      <p className="notice notice-info">{t('pushLater')}</p>

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!items && !error && <Loading />}

      {items && (
        <section className="card" aria-labelledby="plan-h">
          <div className="card-head">
            <h2 id="plan-h">{t('tplPlan')}</h2>
            {sorted.length > 0 && <Switch checked={allOn} onChange={(on) => void toggleAll(on)} label={t('gpAll')} />}
          </div>
          {sorted.length === 0 ? (
            <p className="muted">{t('gpEmpty', { n: active.name })}</p>
          ) : (
            <ul className="routine-list">
              {sorted.map((item) => {
                const title = routineTitle(item, t);
                const showLabel = item.kind !== 'own' && item.label;
                return (
                  <li key={item.id} className="routine-row">
                    <span className="time mono">{formatTime(toHHMM(item.time_of_day), lang)}</span>
                    {isKind(item.kind) && <KindIcon kind={item.kind} size={22} className="kind-icon" />}
                    <div className="routine-text">
                      <span className="routine-title">{title}</span>
                      <span className="muted small">
                        {showLabel ? `${item.label} · ` : ''}
                        {repeatLabel(item.repeat, t)}
                      </span>
                    </div>
                    <Switch
                      checked={item.reminder_on}
                      onChange={(on) => void toggleOne(item, on)}
                      label={t('reminder')}
                      ariaLabel={t('gpSwL', { x: `${title}, ${formatTime(toHHMM(item.time_of_day), lang)}` })}
                      hideLabel
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={t('gpDelL', { x: `${title}, ${formatTime(toHHMM(item.time_of_day), lang)}` })}
                      onClick={() => setToDelete(item)}
                    >
                      <IconTrash size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {adding ? (
            <AddForm
              onCancel={() => setAdding(false)}
              isDuplicate={(v) => isDuplicateRoutine(sorted, v)}
              onAdd={async (v) => {
                const row = await addRoutine(active.id, v);
                setItems((cur) => [...(cur ?? []), row]);
                setAdding(false);
                setStatus(t('gpSaved', { x: routineTitle(row, t) }));
              }}
            />
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
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

      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </div>
  );
}

function AddForm({
  onAdd,
  onCancel,
  isDuplicate: isDup,
}: {
  onAdd: (v: RoutineFormValues) => Promise<void>;
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
      } else {
        console.error(err);
        setFormError(t('errGeneric'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{t('addEntry')}</h3>
      <Field id={`${uid}-kind`} label={t('gpWhat')}>
        {(a) => (
          <select {...a} ref={firstRef} value={v.kind} onChange={(e) => isKind(e.target.value) && set('kind', e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
            ))}
          </select>
        )}
      </Field>
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
