// Abgleich zwischen Aufgaben (Alltag, Medikamente) und gespeicherten Benachrichtigungen:
// Wird eine Aufgabe erledigt – egal ob auf „Heute“, im Alltag oder in der Glocke –, gelten die passenden Benachrichtigungen als gelesen.
// Die Datenbank macht das zusätzlich für alle Personen am Tier (Trigger); hier geschieht es sofort für die eigene Glocke.
import { supabase } from './supabase';
import { berlinDay } from './monthReport';

/** Ereignis nach Änderungen (gelesen, gelöscht, erledigt), damit die Glocke sofort neu zählt */
export const NOTIF_CHANGED = 'pc-notifications-changed';
export const notifChanged = () => window.dispatchEvent(new Event(NOTIF_CHANGED));

export type NotifTask =
  | { type: 'routine'; ref: string; day: string; time: null }
  | { type: 'medication'; ref: string; day: string; time: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}/;

/** Aufgabe hinter einer Benachrichtigung (Alltag oder Medikament) oder null */
export function taskOf(n: { kind: string; ref_id: string | null; slot: string; info: Record<string, unknown> | null }): NotifTask | null {
  if (!n.ref_id) return null;
  const on = n.info?.on;
  const day = typeof on === 'string' && ISO_DAY.test(on) ? on : berlinDay(n.slot);
  if (n.kind === 'routine') return { type: 'routine', ref: n.ref_id, day, time: null };
  if (n.kind === 'medication') {
    const tm = n.info?.time;
    if (typeof tm === 'string' && HHMM.test(tm)) return { type: 'medication', ref: n.ref_id, day, time: tm.slice(0, 5) };
  }
  return null;
}

export const taskKey = (t: NotifTask): string => `${t.type}|${t.ref}|${t.day}|${t.time ?? ''}`;

/** Eigene ungelesene Benachrichtigungen zu dieser Aufgabe als gelesen markieren. Fehler werden nur protokolliert. */
export async function markTaskRead(task: NotifTask): Promise<void> {
  try {
    const { data, error } = await supabase.from('notifications').select('id, kind, ref_id, slot, info')
      .eq('kind', task.type).eq('ref_id', task.ref).is('read_at', null).limit(50);
    if (error) throw error;
    const key = taskKey(task);
    const ids = (data ?? []).filter((r) => {
      const t = taskOf(r as { kind: string; ref_id: string | null; slot: string; info: Record<string, unknown> | null });
      return t !== null && taskKey(t) === key;
    }).map((r) => r.id as string);
    if (ids.length > 0) {
      const res = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
      if (res.error) throw res.error;
    }
    notifChanged();
  } catch (e) {
    console.error(e);
  }
}
