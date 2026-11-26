// Benachrichtigungszentrum (Auftrag 13): gespeicherte Benachrichtigungen lesen, als gelesen markieren, löschen.
// Der Text kommt aus derselben Quelle wie die Push-Nachricht (push-senden/message.ts) – in der Sprache der App.
import { supabase } from './supabase';
import type { MessageKey } from '../i18n';
import { buildMessage, type Job } from '../../supabase/functions/push-senden/message.ts';
import { giveDose, isDuplicate, markDone } from './api';
import { NOTIF_CHANGED, markTaskRead, notifChanged, taskKey, taskOf, type NotifTask } from './taskSync';

export { NOTIF_CHANGED, taskKey, taskOf, type NotifTask };

export const NOTIF_CATEGORIES = ['practice', 'medication', 'feeding', 'care', 'vaccination', 'appointment', 'message', 'system'] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<NotifCategory, MessageKey> = {
  practice: 'ncCatPractice', medication: 'ncCatMed', feeding: 'ncCatFeed', care: 'ncCatCare', vaccination: 'ncCatVacc',
  appointment: 'ncCatAppt', message: 'ncCatMsg', system: 'ncCatSystem',
};

export interface NotificationRow {
  id: string; kind: string; category: NotifCategory; ref_id: string | null; pet_id: string | null; practice_id: string | null;
  slot: string; url: string; pet_name: string | null; subject: string | null; info: Record<string, unknown>; created_at: string; read_at: string | null;
}

export const PAGE_SIZE = 40;
const changed = notifChanged;

const isCategory = (v: unknown): v is NotifCategory => typeof v === 'string' && (NOTIF_CATEGORIES as readonly string[]).includes(v);

/** Titel und Text wie in der Push-Nachricht; unbekannte Arten ergeben einen neutralen Text */
export function notifText(n: Pick<NotificationRow, 'kind' | 'ref_id' | 'slot' | 'pet_name' | 'subject' | 'url' | 'info'>, lang: string): { title: string; body: string } {
  const job = {
    kind: n.kind as Job['kind'], ref_id: n.ref_id ?? '', slot: n.slot, pet: n.pet_name ?? '', title: n.subject ?? '', url: n.url,
    language: lang, info: (n.info ?? {}) as Job['info'], subs: [],
  } satisfies Job;
  try {
    const m = buildMessage(job);
    return { title: m.title, body: m.body };
  } catch {
    return { title: n.pet_name || 'PetConnect', body: n.subject ?? '' };
  }
}

/** Ziel innerhalb der App (Pfad ohne /app); fremde oder kaputte Ziele führen zur Startseite */
export function notifTarget(url: string, practice: boolean): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return practice ? '/praxis' : '/';
  return url.replace(/^\/app(?=\/|$)/, '') || '/';
}

/** Nach Kalendertag (Ortszeit) gruppiert, neueste zuerst */
export function groupByDay<T extends { created_at: string }>(rows: readonly T[], dayOf: (iso: string) => string): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const d = dayOf(r.created_at);
    const last = out[out.length - 1];
    if (last && last.day === d) last.rows.push(r); else out.push({ day: d, rows: [r] });
  }
  return out;
}

// ---------- Datenbank ----------

export async function listNotifications(before: string | null = null, limit = PAGE_SIZE): Promise<NotificationRow[]> {
  let q = supabase.from('notifications').select('id, kind, category, ref_id, pet_id, practice_id, slot, url, pet_name, subject, info, created_at, read_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as NotificationRow[]).map((r) => ({ ...r, category: isCategory(r.category) ? r.category : 'system' }));
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Einzelne (ids) oder alle ungelesenen als gelesen markieren */
export async function markRead(ids: string[] | null): Promise<void> {
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw error;
  changed();
}

export async function markUnread(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: null }).eq('id', id);
  if (error) throw error;
  changed();
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
  changed();
}

// ---------- Aufgaben hinter Benachrichtigungen (Alltag, Medikamente) ----------

/** Welche der Aufgaben hinter diesen Benachrichtigungen schon erledigt sind (Schlüssel: taskKey) */
export async function doneTaskKeys(rows: readonly Pick<NotificationRow, 'kind' | 'ref_id' | 'slot' | 'info'>[]): Promise<Set<string>> {
  const tasks = rows.map(taskOf).filter((t): t is NotifTask => t !== null);
  const out = new Set<string>();
  const rt = tasks.filter((t) => t.type === 'routine');
  const md = tasks.filter((t) => t.type === 'medication');
  const uniq = (xs: string[]) => [...new Set(xs)];
  const [a, b] = await Promise.all([
    rt.length ? supabase.from('routine_done').select('routine_item_id, done_on').in('routine_item_id', uniq(rt.map((t) => t.ref))).in('done_on', uniq(rt.map((t) => t.day))) : null,
    md.length ? supabase.from('medication_doses').select('medication_id, scheduled_on, scheduled_time').in('medication_id', uniq(md.map((t) => t.ref))).in('scheduled_on', uniq(md.map((t) => t.day))) : null,
  ]);
  if (a?.error) throw a.error;
  if (b?.error) throw b.error;
  for (const r of a?.data ?? []) out.add(taskKey({ type: 'routine', ref: r.routine_item_id, day: r.done_on, time: null }));
  for (const r of b?.data ?? []) out.add(taskKey({ type: 'medication', ref: r.medication_id, day: r.scheduled_on, time: String(r.scheduled_time).slice(0, 5) }));
  return out;
}

/** Aufgabe direkt aus der Benachrichtigung erledigen: Alltag abhaken bzw. Gabe eintragen; danach gilt die Meldung als gelesen. */
export async function completeTask(n: Pick<NotificationRow, 'kind' | 'ref_id' | 'slot' | 'info' | 'pet_id'>): Promise<void> {
  const task = taskOf(n);
  if (!task) throw new Error('no_task');
  if (task.type === 'routine') {
    await markDone(task.ref, task.day);
  } else {
    if (!n.pet_id) throw new Error('no_pet');
    try {
      await giveDose(task.ref, n.pet_id, task.day, task.time);
    } catch (e) {
      // schon von jemand anderem gegeben: gilt als erledigt
      if (!isDuplicate(e)) throw e;
      await markTaskRead(task);
    }
  }
}
