import { supabase } from './supabase';

export type StaffRole = 'admin' | 'support';
export type AccountStatus = 'active' | 'locked';

export type SearchHit = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  status: AccountStatus;
  pets: { name: string; species: string }[];
};

export const MIN_QUERY = 3;
export const MAX_REASON = 200;

/** Mindestens drei Zeichen, damit die Suche nicht alle Konten liefert. */
export function isSearchable(q: string): boolean {
  return q.trim().length >= MIN_QUERY;
}

/** Grund ist Pflicht und hat eine Obergrenze. Liefert null, wenn er passt. */
export function reasonError(reason: string): 'required' | 'too_long' | null {
  const r = reason.trim();
  if (r.length === 0) return 'required';
  if (r.length > MAX_REASON) return 'too_long';
  return null;
}

/** Rolle des angemeldeten Kontos, null wenn keine Mitarbeitenden-Rolle vorliegt. */
export async function staffRoleFor(userId: string): Promise<StaffRole | null> {
  const { data, error } = await supabase.from('staff_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data?.role === 'admin' || data?.role === 'support') return data.role;
  return null;
}

export async function searchAccounts(q: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc('staff_search_accounts', { q: q.trim() });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, status: row.status === 'locked' ? 'locked' : 'active' }));
}

/** Nur Admin, die Datenbank prüft das ebenfalls. */
export async function setAccountStatus(target: string, status: AccountStatus, reason: string): Promise<void> {
  const { error } = await supabase.rpc('staff_set_account_status', { target, new_status: status, reason: reason.trim() });
  if (error) throw error;
}

export type StaffStats = {
  accounts: number;
  profiles: number;
  accounts_with_pets: number;
  pets: number;
  pets_by_species: Record<string, number>;
  locked_accounts: number;
  tickets_open: number;
  tickets_in_progress: number;
  tickets_closed: number;
};

/** Nur Zählungen, keine Personen- oder Tierdaten. Nur für Admin, die Datenbank prüft das ebenfalls. */
export async function staffStats(): Promise<StaffStats> {
  const { data, error } = await supabase.rpc('staff_stats');
  if (error) throw error;
  return data as StaffStats;
}

/** Löst den bestehenden Passwort-Reset für ein Konto aus. Das Passwort sieht niemand, die Funktion protokolliert den Versand. */
export async function sendResetLink(target: string): Promise<void> {
  const { error } = await supabase.functions.invoke('staff-reset-link', { body: { target } });
  if (error) throw error;
}
