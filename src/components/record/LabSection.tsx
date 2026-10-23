import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort } from '../../i18n';
import {
  addLabValue,
  deleteLabValue,
  listLabValues,
  updateLabValue,
  type LabValueRow,
} from '../../lib/api';
import { recordErrorKey, pastDateError } from '../../lib/record';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ByLine, ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';
import type { FieldError } from '../../lib/validate';

type Mode = { kind: 'add' } | { kind: 'edit'; row: LabValueRow } | null;

/** Ampelfarbe anhand Referenzbereich */
function labStatus(value: number, refMin: number | null, refMax: number | null): 'ok' | 'low' | 'high' | 'none' {
  if (refMin === null && refMax === null) return 'none';
  if (refMin !== null && value < refMin) return 'low';
  if (refMax !== null && value > refMax) return 'high';
  return 'ok';
}

const STATUS_CLASS: Record<string, string> = {
  ok: 'lab-status-ok',
  low: 'lab-status-low',
  high: 'lab-status-high',
  none: '',
};

const STATUS_SYMBOL: Record<string, string> = {
  ok: '🟢',
  low: '🔴',
  high: '🔴',
  none: '',
};

/** Laborwerte: Liste, Eintragen / Ändern / Löschen mit Referenzbereich-Ampel. */
export function LabSection({
  petId,
  editable,
  today,
  myId,
  names,
}: {
  petId: string;
  editable: boolean;
  today: string;
  myId: string | undefined;
  names: ReadonlyMap<string, string>;
}) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<LabValueRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<LabValueRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      setRows(await listLabValues(petId));
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

  async function save(data: Omit<LabValueRow, 'id' | 'pet_id' | 'owner_id' | 'created_at'>) {
    if (mode?.kind === 'edit') {
      const row = await updateLabValue(mode.row.id, data);
      setRows((cur) => (cur ?? []).map((r) => (r.id === row.id ? row : r)));
      setMode(null);
      setStatus(t('lbUpdated', { p: row.parameter, d: date(row.measured_on) }));
      focusLater(`edit-${row.id}`);
    } else {
      const row = await addLabValue(petId, data);
      setRows((cur) => [row, ...(cur ?? [])]);
      setMode(null);
      setStatus(t('lbSaved', { p: row.parameter, d: date(row.measured_on) }));
      focusLater('add');
    }
  }

  async function remove(row: LabValueRow) {
    setToDelete(null);
    try {
      await deleteLabValue(row.id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id));
      setStatus(t('lbDeleted'));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  return (
    <div className="stack record-panel">
      {loadError && (
        <p className="notice notice-crit" role="alert">
          {t('errGeneric')}
        </p>
      )}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {rows.length === 0 && !mode && <p className="muted">{t('lbNone')}</p>}

          {editable && mode === null && (
            <button
              type="button"
              ref={register('add')}
              className="btn btn-secondary btn-start"
              onClick={() => {
                setMode({ kind: 'add' });
                setStatus('');
              }}
            >
              <IconPlus size={20} />
              {t('lbAdd')}
            </button>
          )}

          {editable && mode && (
            <LabForm
              key={mode.kind === 'edit' ? mode.row.id : 'add'}
              today={today}
              initial={
                mode.kind === 'edit'
                  ? {
                      date: mode.row.measured_on,
                      parameter: mode.row.parameter,
                      value: String(mode.row.value),
                      unit: mode.row.unit,
                      refMin: mode.row.ref_min !== null ? String(mode.row.ref_min) : '',
                      refMax: mode.row.ref_max !== null ? String(mode.row.ref_max) : '',
                      note: mode.row.note,
                      practice: mode.row.practice,
                    }
                  : {
                      date: today,
                      parameter: '',
                      value: '',
                      unit: '',
                      refMin: '',
                      refMax: '',
                      note: '',
                      practice: '',
                    }
              }
              title={mode.kind === 'edit' ? t('lbEditTitle') : t('lbAdd')}
              onCancel={() => {
                const back = mode.kind === 'edit' ? `edit-${mode.row.id}` : 'add';
                setMode(null);
                focusLater(back);
              }}
              onSave={save}
            />
          )}

          {rows.length > 0 && (
            <div className="stack">
              <h3>{t('lbHist')}</h3>
              <ul className="record-list">
                {rows.map((r) => {
                  const st = labStatus(Number(r.value), r.ref_min, r.ref_max);
                  return (
                    <li key={r.id} className="record-row">
                      <div className="record-main">
                        <span className="record-title">
                          {STATUS_SYMBOL[st] && (
                            <span className={`lab-dot ${STATUS_CLASS[st]}`} aria-hidden="true" />
                          )}
                          <span className="mono">{date(r.measured_on)}</span> · {r.parameter}:{' '}
                          <strong>
                            {Number(r.value)} {r.unit}
                          </strong>
                        </span>
                        {r.ref_min !== null && r.ref_max !== null && (
                          <span className="muted small">
                            {t('lbRefRange', {
                              min: String(r.ref_min),
                              max: String(r.ref_max),
                              u: r.unit,
                            })}
                          </span>
                        )}
                        {r.note && <span className="muted small">{r.note}</span>}
                        {r.practice && <span className="muted small">{r.practice}</span>}
                        <ByLine ownerId={r.owner_id} myId={myId} names={names} />
                      </div>
                      {editable && (
                        <div className="row-actions">
                          <button
                            type="button"
                            ref={register(`edit-${r.id}`)}
                            className="btn btn-ghost"
                            aria-label={t('lbEditL', { p: r.parameter, d: date(r.measured_on) })}
                            onClick={() => {
                              setMode({ kind: 'edit', row: r });
                              setStatus('');
                            }}
                          >
                            {t('editBtn')}
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={t('lbDelL', { p: r.parameter, d: date(r.measured_on) })}
                            onClick={() => setToDelete(r)}
                          >
                            <IconTrash size={20} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <StatusLine status={status} />

      <ConfirmDelete
        open={toDelete !== null}
        title={t('lbDelTitle')}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
      >
        {toDelete && (
          <p>
            {t('lbDelAsk', {
              p: toDelete.parameter,
              d: date(toDelete.measured_on),
            })}
          </p>
        )}
      </ConfirmDelete>
    </div>
  );
}

interface LabFormValues {
  date: string;
  parameter: string;
  value: string;
  unit: string;
  refMin: string;
  refMax: string;
  note: string;
  practice: string;
}

function LabForm({
  initial,
  today,
  title,
  onSave,
  onCancel,
}: {
  initial: LabFormValues;
  today: string;
  title: string;
  onSave: (data: Omit<LabValueRow, 'id' | 'pet_id' | 'owner_id' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<LabFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof LabFormValues, FieldError>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paramRef = useRef<HTMLInputElement>(null);

  useEffect(() => paramRef.current?.focus(), []);

  function field(k: keyof LabFormValues) {
    return (val: string) => {
      setV((p) => ({ ...p, [k]: val }));
      setErrors((p) => ({ ...p, [k]: undefined }));
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const next: typeof errors = {};
    const dErr = pastDateError(v.date, today, true);
    if (dErr) next.date = { key: dErr };
    if (!v.parameter.trim()) next.parameter = { key: 'lbErrParamRequired' };
    if (!v.value.trim()) next.value = { key: 'lbErrValueRequired' };
    const parsedVal = parseFloat(v.value.replace(',', '.'));
    if (v.value.trim() && isNaN(parsedVal)) next.value = { key: 'lbErrValueFormat' };
    if (!v.unit.trim()) next.unit = { key: 'lbErrUnitRequired' };

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await onSave({
        measured_on: v.date,
        parameter: v.parameter.trim(),
        value: parsedVal,
        unit: v.unit.trim(),
        ref_min: v.refMin.trim() ? parseFloat(v.refMin.replace(',', '.')) : null,
        ref_max: v.refMax.trim() ? parseFloat(v.refMax.replace(',', '.')) : null,
        note: v.note.trim(),
        practice: v.practice.trim(),
      });
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{title}</h3>

      <div className="row-2">
        <Field id={`${uid}-date`} label={t('lbDate')} error={errors.date} required>
          {(a) => (
            <input
              {...a}
              type="date"
              max={today}
              value={v.date}
              onChange={(e) => field('date')(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${uid}-param`} label={t('lbParam')} hint={t('lbParamHint')} error={errors.parameter} required>
          {(a) => (
            <input
              {...a}
              ref={paramRef}
              type="text"
              autoComplete="off"
              value={v.parameter}
              onChange={(e) => field('parameter')(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="row-2">
        <Field id={`${uid}-value`} label={t('lbValue')} error={errors.value} required>
          {(a) => (
            <input
              {...a}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={v.value}
              onChange={(e) => field('value')(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${uid}-unit`} label={t('lbUnit')} hint={t('lbUnitHint')} error={errors.unit} required>
          {(a) => (
            <input
              {...a}
              type="text"
              autoComplete="off"
              value={v.unit}
              onChange={(e) => field('unit')(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="row-2">
        <Field id={`${uid}-refmin`} label={t('lbRefMin')}>
          {(a) => (
            <input
              {...a}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={v.refMin}
              onChange={(e) => field('refMin')(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${uid}-refmax`} label={t('lbRefMax')}>
          {(a) => (
            <input
              {...a}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={v.refMax}
              onChange={(e) => field('refMax')(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field id={`${uid}-note`} label={t('lbNote')}>
        {(a) => (
          <input
            {...a}
            type="text"
            autoComplete="off"
            value={v.note}
            onChange={(e) => field('note')(e.target.value)}
          />
        )}
      </Field>

      <Field id={`${uid}-practice`} label={t('lbPractice')}>
        {(a) => (
          <input
            {...a}
            type="text"
            autoComplete="off"
            value={v.practice}
            onChange={(e) => field('practice')(e.target.value)}
          />
        )}
      </Field>

      {formError && (
        <p className="notice notice-crit" role="alert">
          {formError}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('cancelBtn')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {t('saveBtn')}
        </button>
      </div>
    </form>
  );
}
