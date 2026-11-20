// Kopf und „Heute“ der Tieransicht (Release C): Alter, nächster Termin. Reine Funktionen ohne Datenbank.
import type { MessageKey } from '../i18n';

/** Alter in ganzen Monaten zwischen Geburtstag und heute (ISO-Tage); null bei fehlendem oder künftigem Datum */
export function ageMonths(birth: string | null | undefined, today: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth > today) return null;
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
}

/** Altersangabe als Textschlüssel: ab 2 Jahren in Jahren, darunter in Monaten */
export function ageText(birth: string | null | undefined, today: string): { key: MessageKey; n: number } | null {
  const m = ageMonths(birth, today);
  if (m === null) return null;
  if (m >= 24) return { key: 'petAgeY', n: Math.floor(m / 12) };
  if (m >= 12) return { key: 'petAge1Y', n: 1 };
  if (m >= 2) return { key: 'petAgeM', n: m };
  if (m === 1) return { key: 'petAge1M', n: 1 };
  return { key: 'petAge0', n: 0 };
}

/** Nächster geplanter Termin ab jetzt */
export function nextAppointment<T extends { starts_at: string; status: string }>(rows: readonly T[], now: Date): T | null {
  return [...rows]
    .filter((r) => r.status === 'planned' && new Date(r.starts_at).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
}
