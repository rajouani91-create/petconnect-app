// Recall (Etappe P6): fällige Impfungen der Patienten einer Praxis und Erinnerung der Halter:innen per Push.
import { supabase } from './supabase';
import type { MessageKey } from '../i18n';

export interface RecallItem {
  vaccination_id: string; pet_id: string; pet_name: string; owner_name: string; vaccine: string; due_on: string;
  /** Tage bis zur Fälligkeit, negativ = überfällig */
  days: number;
  sent_at: string | null; sent_by_name: string | null;
  /** automatisch erinnert (14 Tage vorher), ohne Klick */
  auto_sent: boolean;
}
export interface RecallData { auto: boolean; can_edit: boolean; items: RecallItem[] }

/** Erinnerung gilt als „gesendet“, wenn per Klick oder automatisch erfolgt */
export const isSent = (r: RecallItem) => r.sent_at !== null || r.auto_sent;
/** Erneut senden erst nach 7 Tagen (wie die Datenbank) */
export const canResend = (r: RecallItem, now: Date) => r.sent_at === null || now.getTime() - new Date(r.sent_at).getTime() > 7 * 86400000;

export type RecallFilter = 'all' | 'overdue' | 'due' | 'open';
export const RECALL_FILTERS: RecallFilter[] = ['all', 'overdue', 'due', 'open'];
export const RECALL_FILTER_LABEL: Record<RecallFilter, MessageKey> = { all: 'hsAll', overdue: 'rclFOverdue', due: 'rclFDue', open: 'rclFOpen' };
export function filterRecalls(items: readonly RecallItem[], f: RecallFilter): RecallItem[] {
  if (f === 'overdue') return items.filter((r) => r.days < 0);
  if (f === 'due') return items.filter((r) => r.days >= 0);
  if (f === 'open') return items.filter((r) => !isSent(r));
  return [...items];
}

const ERROR_KEYS: Record<string, MessageKey> = { already_sent: 'rclErrSent', entry_not_found: 'scErrGone', forbidden: 'pe_forbidden', not_lead: 'pe_forbidden' };
export function recallErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = Object.keys(ERROR_KEYS).find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

export async function practiceRecalls(): Promise<RecallData> {
  const { data, error } = await supabase.rpc('practice_recalls');
  if (error) throw error;
  const d = (data ?? {}) as unknown as Partial<RecallData>;
  return { auto: !!d.auto, can_edit: !!d.can_edit, items: d.items ?? [] };
}

export async function sendRecall(vaccinationId: string): Promise<void> {
  const { error } = await supabase.rpc('practice_send_recall', { p_vaccination: vaccinationId });
  if (error) throw error;
}

export async function sendAllRecalls(): Promise<number> {
  const { data, error } = await supabase.rpc('practice_send_all_recalls');
  if (error) throw error;
  return data ?? 0;
}

export async function setRecallAuto(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('practice_set_recall_auto', { p_on: on });
  if (error) throw error;
}
