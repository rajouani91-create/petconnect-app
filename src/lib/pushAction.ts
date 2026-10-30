// Aktionen aus der Benachrichtigung („Gegeben“, „Erledigt“): Adresse lesen und prüfen. Reine Funktionen, ohne React.

export type PushAction = { kind: 'give'; medId: string; time: string } | { kind: 'done'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `?gegeben=<Medikament>&zeit=HH:MM` oder `?erledigt=<Eintrag>`; alles andere → null */
export function parsePushAction(search: string): PushAction | null {
  const p = new URLSearchParams(search);
  const med = p.get('gegeben');
  const time = p.get('zeit');
  if (med && time && UUID.test(med) && HHMM.test(time)) return { kind: 'give', medId: med.toLowerCase(), time };
  const id = p.get('erledigt');
  if (id && UUID.test(id)) return { kind: 'done', id: id.toLowerCase() };
  return null;
}
