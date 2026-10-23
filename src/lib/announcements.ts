import { supabase } from './supabase';

export type Announcement = { id: string; body: string; starts_at: string; ends_at: string };

export const ANNOUNCEMENT_MAX = 300;

/** Text, Beginn und Ende müssen da sein, der Text darf nicht zu lang sein und das Ende liegt nach dem Beginn. */
export function announcementError(input: { body: string; start: string; end: string }): 'required' | 'too_long' | 'order' | null {
  if (!input.body.trim() || !input.start || !input.end) return 'required';
  if (input.body.trim().length > ANNOUNCEMENT_MAX) return 'too_long';
  if (new Date(input.end).getTime() <= new Date(input.start).getTime()) return 'order';
  return null;
}

/** Laufende Ankündigungen, die dieser Nutzer noch nicht weggeklickt hat. */
export async function activeAnnouncements(userId: string): Promise<Announcement[]> {
  const [list, dismissed] = await Promise.all([
    supabase.from('announcements').select('id, body, starts_at, ends_at').order('starts_at', { ascending: false }),
    supabase.from('announcement_dismissals').select('announcement_id').eq('user_id', userId),
  ]);
  if (list.error) throw list.error;
  if (dismissed.error) throw dismissed.error;
  const seen = new Set((dismissed.data ?? []).map((d) => d.announcement_id));
  return (list.data ?? []).filter((a) => !seen.has(a.id));
}

export async function dismissAnnouncement(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('announcement_dismissals').insert({ announcement_id: id, user_id: userId });
  if (error) throw error;
}

/** Alle Ankündigungen für die Verwaltung (nur Admin, die Datenbank prüft das ebenfalls). */
export async function adminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.from('announcements').select('id, body, starts_at, ends_at').order('starts_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAnnouncement(input: { body: string; start: string; end: string }, adminId: string): Promise<void> {
  const { error } = await supabase.from('announcements').insert({
    body: input.body.trim(),
    starts_at: new Date(input.start).toISOString(),
    ends_at: new Date(input.end).toISOString(),
    created_by: adminId,
  });
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
