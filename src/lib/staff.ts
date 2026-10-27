import { supabase } from './supabase';
import type { ActivityData, DashboardData } from './dashboard';

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

/** Zahlen für das Admin-Dashboard (nur Zählungen, nur Admin; die Datenbank prüft das ebenfalls). */
export async function staffDashboard(): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('staff_dashboard');
  if (error) throw error;
  return data as unknown as DashboardData;
}

export async function staffActivity(): Promise<ActivityData> {
  const { data, error } = await supabase.rpc('staff_activity');
  if (error) throw error;
  return data as unknown as ActivityData;
}

export type TeamMember = { user_id: string; email: string; display_name: string | null; role: StaffRole; created_at: string };
export type RoleChange = StaffRole | 'none';

/** Einfache E-Mail-Prüfung für das Formular; die Datenbank sucht ohnehin nur bestehende Konten. */
export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Fehlercode der Datenbankfunktion in eine verständliche Meldung übersetzen. */
export function roleErrorText(code: string | undefined): string {
  switch (code) {
    case 'P0002':
      return 'Zu dieser E-Mail-Adresse gibt es kein Konto. Die Person muss sich zuerst registrieren.';
    case '42501':
      return 'Dafür fehlt die Berechtigung.';
    case '22023':
      return 'Das eigene Konto kann hier nicht geändert werden, und ein Grund ist Pflicht.';
    default:
      return 'Die Änderung konnte nicht gespeichert werden.';
  }
}

/** Nur Admin: alle Mitarbeitenden mit Rolle. */
export async function staffTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('staff_team');
  if (error) throw error;
  return (data ?? []).filter((r) => r.role === 'admin' || r.role === 'support') as TeamMember[];
}

/** Nur Admin: Rolle vergeben, ändern oder mit 'none' entziehen. Wird protokolliert. */
export async function setStaffRole(email: string, role: RoleChange, reason: string): Promise<void> {
  const { error } = await supabase.rpc('staff_set_role', { target_email: email.trim(), new_role: role, reason: reason.trim() });
  if (error) throw error;
}

/** Löst den bestehenden Passwort-Reset für ein Konto aus. Das Passwort sieht niemand, die Funktion protokolliert den Versand. */
export async function sendResetLink(target: string): Promise<void> {
  const { error } = await supabase.functions.invoke('staff-reset-link', { body: { target } });
  if (error) throw error;
}

export type TicketStatus = 'open' | 'in_progress' | 'closed';
export type TicketRow = {
  id: string;
  sender: string | null;
  subject: string;
  body: string;
  status: TicketStatus;
  staff_note: string | null;
  created_at: string;
};

export const TICKET_LIMITS = { subject: 200, body: 4000, sender: 200, note: 2000 } as const;

/** Pflichtfelder und Obergrenzen beim manuellen Anlegen. Liefert null, wenn alles passt. */
export function ticketInputError(input: { sender: string; subject: string; body: string; note: string }): 'required' | 'too_long' | null {
  if (input.subject.trim().length === 0 || input.body.trim().length === 0) return 'required';
  if (
    input.subject.trim().length > TICKET_LIMITS.subject ||
    input.body.trim().length > TICKET_LIMITS.body ||
    input.sender.trim().length > TICKET_LIMITS.sender ||
    input.note.trim().length > TICKET_LIMITS.note
  )
    return 'too_long';
  return null;
}

export async function listTickets(status: TicketStatus | 'all'): Promise<TicketRow[]> {
  let query = supabase
    .from('support_tickets')
    .select('id, sender, subject, body, status, staff_note, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TicketRow[];
}

export async function createTicket(input: { sender: string; subject: string; body: string; status: TicketStatus; note: string }, staffId: string): Promise<void> {
  const { error } = await supabase.from('support_tickets').insert({
    sender: input.sender.trim() || null,
    subject: input.subject.trim(),
    body: input.body.trim(),
    status: input.status,
    staff_note: input.note.trim() || null,
    created_by_staff: staffId,
  });
  if (error) throw error;
}

export async function updateTicket(id: string, patch: { status?: TicketStatus; staff_note?: string | null }): Promise<void> {
  const { error } = await supabase.from('support_tickets').update(patch).eq('id', id);
  if (error) throw error;
}
