// Tagesplan: Einträge aus routine_items und Uhrzeiten laufender Medikamente zusammenführen (ohne Supabase und React).
// Medikamente haben genau eine Quelle (pet_medications); im Tagesplan erscheinen sie nur zum Abhaken.
import { doseKey, dosesForDay, type MedForToday } from './medication';
import { occursOn, toHHMM, toMinutes, type Schedulable } from './time';

export interface RoutineLike extends Schedulable {
  readonly kind: string;
}

/** Ein Punkt im Tagesplan. `id`, `time_of_day`, `repeat` wie bei routine_items, damit nextDue() beide Arten versteht. */
export type PlanEntry<R extends RoutineLike, M extends MedForToday> =
  | { readonly type: 'routine'; readonly id: string; readonly time_of_day: string; readonly repeat: string; readonly item: R }
  | { readonly type: 'med'; readonly id: string; readonly time_of_day: string; readonly repeat: 'daily'; readonly med: M; readonly time: string };

/**
 * Tagesplan eines Tiers für `day` (YYYY-MM-DD, Europe/Berlin).
 * `weekday` (0 = Sonntag): nur Einträge, die an diesem Tag anfallen; `null` = alle Einträge des Plans (Ansicht „Alltag“).
 * Medikamente: täglich, mit Erinnerung, heute im Zeitraum, nicht beendet – je Uhrzeit ein Punkt; „bei Bedarf“ nie.
 * Sortiert nach Uhrzeit; bei gleicher Uhrzeit Tagesplan vor Medikament.
 */
export function planForDay<R extends RoutineLike, M extends MedForToday>(
  routine: readonly R[],
  meds: readonly M[],
  petId: string,
  day: string,
  weekday: number | null,
): PlanEntry<R, M>[] {
  const out: PlanEntry<R, M>[] = routine
    .filter((i) => weekday === null || occursOn(i.repeat, weekday))
    .map((item) => ({ type: 'routine', id: item.id, time_of_day: item.time_of_day, repeat: item.repeat, item }));
  for (const p of dosesForDay(meds.filter((m) => m.pet_id === petId), day)) {
    out.push({ type: 'med', id: doseKey(p.med.id, day, p.time), time_of_day: p.time, repeat: 'daily', med: p.med, time: p.time });
  }
  const rank = (e: PlanEntry<R, M>) => (e.type === 'routine' ? 0 : 1);
  return out.sort((a, b) => toMinutes(a.time_of_day) - toMinutes(b.time_of_day) || rank(a) - rank(b));
}

/**
 * Erledigte Punkte: Tagesplan-Einträge aus routine_done (Eintrags-ID), Medikamente aus medication_doses (doseKey).
 * Ergebnis passt direkt zu nextDue().
 */
export function doneIds(routineDone: ReadonlyMap<string, unknown>, doses: ReadonlyMap<string, unknown>): Set<string> {
  return new Set([...routineDone.keys(), ...doses.keys()]);
}

/** Erledigt? Für beide Arten über die Plan-ID */
export const isEntryDone = (e: { id: string }, done: Pick<ReadonlySet<string>, 'has'>) => done.has(e.id);

/** Alte Tagesplan-Einträge „Medikament geben“ (vor Auftrag 11): nur noch zum Umwandeln */
export const isLegacyMed = (item: { kind: string }) => item.kind === 'med';

export const PLAN_MED_TIMES_MAX = 4;
export type PlanTimesError = 'omErrTime' | 'omErrDup';

/** Uhrzeiten für „Eintrag hinzufügen → Medikament“: 1–4, Format HH:MM, keine doppelten (Regeln der Datenbank) */
export function validatePlanTimes(times: readonly string[]): (PlanTimesError | undefined)[] | null {
  const seen = new Set<string>();
  const errs = times.map((x): PlanTimesError | undefined => {
    const v = x.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return 'omErrTime';
    if (seen.has(v)) return 'omErrDup';
    seen.add(v);
    return undefined;
  });
  return times.length === 0 || times.length > PLAN_MED_TIMES_MAX || errs.some(Boolean) ? errs : null;
}

/** Vorbelegung der Uhrzeiten: vorhandene des Medikaments, sonst 08:00 */
export function initialPlanTimes(med: { times: readonly string[] }): string[] {
  const ts = med.times.map((x) => toHHMM(x)).sort();
  return ts.length ? ts.slice(0, PLAN_MED_TIMES_MAX) : ['08:00'];
}
