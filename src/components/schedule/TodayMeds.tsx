import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { localeOf } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { giveDose, isDuplicate, undoDose, type DoseRow, type MedicationRow } from '../../lib/api';
import {
  HINT_TEXT,
  amountText,
  berlinHHMM,
  doseKey,
  doseState,
  nextOpenDose,
  type DoseState,
  type PlannedDose,
} from '../../lib/medication';
import { recordErrorKey } from '../../lib/record';
import { IconCheck } from '../Icons';
import { StatusLine, useFocusAfter, useStatus } from '../record/shared';
import { useTodayDoses } from './DosesProvider';

export { useTodayDoses } from './DosesProvider';

export type Doses = ReturnType<typeof useTodayDoses>;

/** Abhaken und Zurücknehmen – gemeinsam für Liste, kompakte Karte und Tagesplan */
export function useDoseActions(d: Doses, setStatus: (text: string, ok?: boolean) => void, focusLater: (key: string) => void, focusAfter?: string) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [pending, setPending] = useState<string | null>(null);

  async function give(p: PlannedDose<MedicationRow>) {
    const key = doseKey(p.med.id, d.day, p.time);
    setPending(key);
    try {
      const row = await giveDose(p.med.id, p.med.pet_id, d.day, p.time);
      d.setData((cur) => {
        if (!cur) return cur;
        const doses = new Map(cur.doses).set(key, row);
        const names = new Map(cur.names);
        if (user && !names.has(user.id)) names.set(user.id, '');
        return { ...cur, doses, names };
      });
      setStatus(t('odSaved', { m: p.med.name, t: p.time }));
      focusLater(focusAfter ?? `undo-${key}`);
    } catch (e) {
      if (isDuplicate(e)) {
        // Jemand anderes war schneller: neu laden und sagen, wer
        const fresh = await d.reload();
        const other = fresh?.doses.get(key);
        const name = other ? fresh?.names.get(other.given_by)?.trim() : '';
        setStatus(t('odTaken', { n: name || t('odSomeone'), t: other ? berlinHHMM(other.given_at) : p.time }), false);
      } else {
        console.error(e);
        setStatus(t(recordErrorKey(e)), false);
      }
    } finally {
      setPending(null);
    }
  }

  async function undo(p: PlannedDose<MedicationRow>, row: DoseRow) {
    const key = doseKey(p.med.id, d.day, p.time);
    setPending(key);
    try {
      await undoDose(row.id);
      d.setData((cur) => {
        if (!cur) return cur;
        const doses = new Map(cur.doses);
        doses.delete(key);
        return { ...cur, doses };
      });
      setStatus(t('odUndone', { m: p.med.name, t: p.time }));
      focusLater(focusAfter ?? `give-${key}`);
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    } finally {
      setPending(null);
    }
  }
  return { give, undo, pending };
}

export function stateText(s: DoseState, myId: string | undefined, names: ReadonlyMap<string, string>, t: ReturnType<typeof useI18n>['t']): string {
  switch (s.kind) {
    case 'open':
      return t('odOpen');
    case 'due':
      return t('odDue');
    case 'overdue':
      return t('odOverdue', { n: s.min });
    case 'given': {
      const at = berlinHHMM(s.at);
      if (s.by === myId) return t('odGivenMe', { t: at });
      const n = names.get(s.by)?.trim();
      return n ? t('odGivenBy', { n, t: at }) : t('odGivenAt', { t: at });
    }
  }
}

function DoseItem({ p, d, actions, register }: { p: PlannedDose<MedicationRow>; d: Doses; actions: ReturnType<typeof useDoseActions>; register: (k: string) => (el: HTMLElement | null) => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const { user } = useAuth();
  const key = doseKey(p.med.id, d.day, p.time);
  const given = d.data?.doses.get(key) ?? null;
  const st = doseState(d.day, p.time, d.now, given);
  const petName = d.petNames.get(p.med.pet_id) ?? '';
  const hint = p.med.intake_hint === 'with_food' || p.med.intake_hint === 'empty_stomach' ? t(HINT_TEXT[p.med.intake_hint]) : null;
  const canChange = d.editable.has(p.med.pet_id);
  const line = [p.time, petName, `${p.med.name} ${amountText(p.med, t, locale)}`, hint].filter(Boolean).join(' · ');
  return (
    <li className={`record-row dose-row${given ? ' is-done' : ''}`}>
      <div className="record-main">
        <span className="record-title">{line}</span>
        <span className={`pill dose-${st.kind}`}>{stateText(st, user?.id, d.data?.names ?? new Map(), t)}</span>
      </div>
      {canChange && (
        <div className="row-actions">
          {given ? (
            <button type="button" ref={register(`undo-${key}`)} className="btn btn-ghost" disabled={actions.pending === key} aria-label={t('odUndoL', { m: p.med.name, p: petName, t: p.time })} onClick={() => void actions.undo(p, given)}>
              {t('odUndo')}
            </button>
          ) : (
            <button type="button" ref={register(`give-${key}`)} className="btn btn-primary" disabled={actions.pending === key} aria-label={t('odGiveL', { m: p.med.name, p: petName, t: p.time })} onClick={() => void actions.give(p)}>
              <IconCheck size={20} />
              {t('odGive')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Erinnerungen: Abschnitt „Heute: Medikamente“ mit allen heutigen Gaben (nur wenn es welche gibt) */
export function TodayMeds() {
  const { t } = useI18n();
  const d = useTodayDoses();
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();
  const actions = useDoseActions(d, setStatus, focusLater);
  if (d.loadError) return <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>;
  if (!d.data || d.planned.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="od-h" id="medikamente">
      <h2 id="od-h">{t('odTitle')}</h2>
      <ul className="record-list" aria-label={t('odListL')}>
        {d.planned.map((p) => <DoseItem key={doseKey(p.med.id, d.day, p.time)} p={p} d={d} actions={actions} register={register} />)}
      </ul>
      <StatusLine status={status} />
    </section>
  );
}

/** Übersicht: nächste offene Gabe über alle Tiere + „Alle Gaben heute“ */
export function NextDoseCard() {
  const { t } = useI18n();
  const d = useTodayDoses();
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();
  // Nach dem Abhaken wechselt die Karte zur nächsten Gabe: Fokus auf den Link
  const actions = useDoseActions(d, setStatus, focusLater, 'all-link');
  if (!d.data || d.planned.length === 0) return null;
  const next = nextOpenDose(d.planned, d.data.doses, d.day);
  return (
    <section className="card stack" aria-labelledby="nd-h">
      <h2 id="nd-h">{t('odTitle')}</h2>
      {next ? (
        <>
          <h3 className="label">{t('odNext')}</h3>
          <ul className="record-list">
            <DoseItem p={next} d={d} actions={actions} register={register} />
          </ul>
        </>
      ) : (
        <p className="muted">{t('odAllDone')}</p>
      )}
      <Link to="/erinnerungen" className="link" ref={register('all-link')}>{t('odAll')}</Link>
      <StatusLine status={status} />
    </section>
  );
}
