// Auftrag 08b: Sortierung, Namens-Hinweis, Leer-Zustände, genauere Öffnungszeiten, Hervorhebung, Verzögerung.
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpeningHours from 'opening_hours';
import { translate } from '../i18n';
import { INPUT_DELAY_MS, debounce, latestOnly, searchText } from './debounce';
import { applyOpenNow, openingInfo, openingText, stateFromPostcode, type OhConstructor } from './openingHours';
import { nameHintsSpecies } from './practiceCatalog';
import { EMPTY_FILTERS, byRecommended, emptyState, expandCountKey, highlightParts, splitResults, type RadiusCount } from './practices';

const Oh = OpeningHours as unknown as OhConstructor;
// Tests laufen mit TZ=Europe/Berlin
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe('Öffnungszeiten genauer', () => {
  const de = (v: string | null, now: Date, plz: string | null = '65428') => {
    const o = openingText(openingInfo(Oh, v, now, plz), now);
    const day = 'day' in o ? new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(o.day) : '';
    return translate('de', o.key, { x: 'x' in o ? o.x : '', d: day });
  };
  const week = 'Mo-Fr 08:00-18:00; Sa 09:00-12:00';

  it('geöffnet bis, schließt bald, öffnet heute, öffnet an einem anderen Tag', () => {
    expect(de(week, at(2026, 10, 16, 10))).toBe('Jetzt geöffnet – bis 18:00');
    expect(de(week, at(2026, 10, 16, 17, 30))).toBe('Schließt bald – um 18:00');
    expect(de(week, at(2026, 10, 16, 17, 14))).toBe('Jetzt geöffnet – bis 18:00'); // 46 Minuten
    expect(de(week, at(2026, 10, 16, 7))).toBe('Geschlossen – öffnet heute um 08:00');
    expect(de(week, at(2026, 10, 16, 19))).toBe('Geschlossen – öffnet Samstag um 09:00');
  });
  it('Wochenende und Mitternacht', () => {
    expect(de(week, at(2026, 10, 17, 13))).toBe('Geschlossen – öffnet Montag um 08:00');
    expect(de(week, at(2026, 10, 18, 23, 59))).toBe('Geschlossen – öffnet Montag um 08:00');
    expect(de('Fr 20:00-02:00', at(2026, 10, 16, 23, 30))).toBe('Jetzt geöffnet – bis 02:00');
    expect(de('Fr 20:00-02:00', at(2026, 10, 17, 1, 30))).toBe('Schließt bald – um 02:00');
    expect(de('24/7', at(2026, 10, 18, 0, 0))).toBe('Rund um die Uhr geöffnet');
  });
  it('Feiertag nach Bundesland: Fronleichnam (4.6.2026) in Hessen, nicht in Niedersachsen', () => {
    const v = 'Mo-Fr 08:00-18:00; PH off';
    expect(stateFromPostcode('65428')).toBe('Hessen');
    expect(stateFromPostcode('30159')).toBe('Niedersachsen');
    expect(stateFromPostcode('abc')).toBe('Hessen');
    expect(stateFromPostcode(null)).toBe('Hessen');
    expect(openingInfo(Oh, v, at(2026, 6, 4, 10), '65428').state).toBe('closed');
    expect(openingInfo(Oh, v, at(2026, 6, 4, 10), '30159').state).toBe('open');
    expect(openingInfo(Oh, v, at(2026, 12, 25, 10), '30159').state).toBe('closed'); // überall Feiertag
  });
  it('unbekannt und ungültig werfen nie; Kommentar wird gezeigt', () => {
    expect(de(null, at(2026, 10, 16, 10))).toBe('Öffnungszeiten unbekannt');
    expect(de('Mo-Zz 99:00-ab', at(2026, 10, 16, 10))).toBe('Öffnungszeiten unbekannt');
    expect(openingInfo(Oh, 'Mo-Fr 08:00-12:00 open "nur Notfälle"', at(2026, 10, 16, 10), '65428')).toMatchObject({ state: 'open', comment: 'nur Notfälle' });
    // Kommentar ohne „open“: laut Syntax unklar, ob geöffnet – „unbekannt“, Kommentar trotzdem sichtbar
    expect(openingInfo(Oh, 'Mo-Fr 08:00-12:00 "nach Vereinbarung"', at(2026, 10, 16, 10), '65428')).toMatchObject({ state: 'unknown', comment: 'nach Vereinbarung' });
  });
  it('„Schließt bald“ zählt bei „Jetzt geöffnet“ als geöffnet', () => {
    const rows = [{ id: 'bald', oh: week }, { id: 'zu', oh: 'Sa 09:00-12:00' }];
    const r = applyOpenNow(rows, (x) => openingInfo(Oh, x.oh, at(2026, 10, 16, 17, 30)), true);
    expect(r.shown.map((x) => x.id)).toEqual(['bald']);
  });
});

describe('Sortierung und Namens-Hinweis', () => {
  const p = (name: string, d: number, o: { reg?: boolean; ver?: boolean; prof?: boolean; m?: boolean } = {}) => ({
    name,
    distance_km: d,
    has_profile: o.prof ?? true,
    matches: o.m ?? true,
    registered: o.reg ?? false,
    titles_verified: o.ver ?? false,
    services: [],
    species: [],
    titles: [],
  });
  it('Empfohlen: bei PetConnect → geprüft → Entfernung; „Name“ sortiert nur nach Name', () => {
    const rows = [p('Nah', 1), p('Geprüft', 5, { ver: true }), p('Partner', 9, { reg: true }), p('Partner geprüft', 12, { reg: true, ver: true })];
    expect([...rows].sort(byRecommended).map((x) => x.name)).toEqual(['Partner geprüft', 'Partner', 'Geprüft', 'Nah']);
    expect(splitResults(rows, true, 'distance').matches.map((x) => x.name)).toEqual(['Partner geprüft', 'Partner', 'Geprüft', 'Nah']);
    expect(splitResults(rows, true, 'name').matches.map((x) => x.name)).toEqual(['Geprüft', 'Nah', 'Partner', 'Partner geprüft']);
  });
  it('Name deutet auf Tierart hin: nur weiter oben bei „Angebot unbekannt“, nie Treffer', () => {
    expect(nameHintsSpecies('Exotenpraxis Bauschheim', 'reptile')).toBe(true);
    expect(nameHintsSpecies('Vögel & Co', 'bird')).toBe(true);
    expect(nameHintsSpecies('PFERDEKLINIK', 'horse')).toBe(true);
    expect(nameHintsSpecies('Exotenpraxis', 'dog')).toBe(false);
    expect(nameHintsSpecies('Exotenpraxis', null)).toBe(false);
    const rows = [p('Tierarzt Nah', 1, { prof: false, m: false }), p('Exotenpraxis', 4, { prof: false, m: false }), p('Reptilien mit Profil', 3, { m: false })];
    const s = splitResults(rows, true, 'distance', 'reptile');
    expect(s.matches).toEqual([]);
    expect(s.unknown.map((x) => x.name)).toEqual(['Exotenpraxis', 'Tierarzt Nah']);
    expect([...s.hinted].map((x) => x.name)).toEqual(['Exotenpraxis']);
  });
});

describe('Leer-Zustände', () => {
  const c = (rows: [number, number, number][]): RadiusCount[] =>
    [5, 10, 25, 50].map((k, i) => ({ radius_km: k, total: rows[i]![0], with_profile: rows[i]![1], matches: rows[i]![2] }));
  const f = { ...EMPTY_FILTERS, species: 'reptile' as const };
  it('Treffer vorhanden', () => {
    expect(emptyState(2, c([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]]), f)).toEqual({ kind: 'results' });
  });
  it('größere Stufe mit echten Treffern → Radius-Knopf', () => {
    expect(emptyState(0, c([[1, 1, 0], [3, 1, 0], [8, 3, 2], [20, 5, 4]]), f)).toEqual({ kind: 'expand', radius: 25, n: 2 });
    expect(translate('de', 'psExpand', { n: 25 })).toBe('Suchradius auf 25 km erweitern');
    expect(translate('de', expandCountKey(2), { n: 2, k: 25 })).toBe('2 passende Praxen im Umkreis von 25 km');
    expect(translate('de', expandCountKey(1), { n: 1, k: 50 })).toBe('1 passende Praxis im Umkreis von 50 km');
  });
  it('Praxen da, aber keine mit Angaben → Hinweis, kein Radius-Knopf', () => {
    expect(emptyState(0, c([[2, 0, 0], [5, 0, 0], [9, 0, 0], [30, 0, 0]]), f)).toEqual({ kind: 'noProfiles' });
  });
  it('Praxen mit Angaben, aber keine passt → Filter zurücksetzen, kein Radius-Knopf', () => {
    expect(emptyState(0, c([[2, 1, 0], [5, 2, 0], [9, 3, 0], [30, 4, 0]]), f)).toEqual({ kind: 'noMatch' });
  });
  it('bis 50 km keine Praxis', () => {
    expect(emptyState(0, c([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), f)).toEqual({ kind: 'nothing' });
  });
  it('Namenssuche ohne Ergebnis: nächste Stufe mit Praxen dieses Namens', () => {
    const q = { ...EMPTY_FILTERS, q: 'Müller' };
    expect(emptyState(0, c([[0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]]), q)).toEqual({ kind: 'nameNone', radius: 25 });
    expect(emptyState(0, c([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), q)).toEqual({ kind: 'nameNone', radius: null });
  });
  it('nur „Jetzt geöffnet“ blendet aus; ohne Zähler einfacher Hinweis', () => {
    expect(emptyState(0, c([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]]), { ...f, openNow: true })).toEqual({ kind: 'noMatch' });
    expect(emptyState(0, null, f)).toEqual({ kind: 'noMatch' });
  });
});

describe('Hervorhebung und Verzögerung', () => {
  afterEach(() => vi.useRealTimers());
  it('getippte Stelle markieren, Groß/Klein und Umlaute tolerant', () => {
    const r = [{ text: '65428 ', hit: false }, { text: 'Rüss', hit: true }, { text: 'elsheim', hit: false }];
    expect(highlightParts('65428 Rüsselsheim', 'rüss')).toEqual(r);
    expect(highlightParts('65428 Rüsselsheim', 'RUSS')).toEqual(r);
    expect(highlightParts('65428 Rüsselsheim', '654')).toEqual([{ text: '654', hit: true }, { text: '28 Rüsselsheim', hit: false }]);
    expect(highlightParts('65428 Rüsselsheim', 'xyz')).toEqual([{ text: '65428 Rüsselsheim', hit: false }]);
  });
  it('kein HTML aus der Eingabe: nur Textteile', () => {
    expect(highlightParts('Mainz <script>', '<script>')).toEqual([{ text: 'Mainz ', hit: false }, { text: '<script>', hit: true }]);
    expect(highlightParts('Mainz', '<script>alert(1)</script>')).toEqual([{ text: 'Mainz', hit: false }]);
  });
  it('debounce: nur der letzte Aufruf nach 250 ms; cancel verwirft', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const d = debounce((q: string) => calls.push(q), INPUT_DELAY_MS);
    d('R');
    d('Rü');
    d('Rüs');
    vi.advanceTimersByTime(INPUT_DELAY_MS - 1);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['Rüs']);
    d('Main');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['Rüs']);
  });
  it('nur die jüngste Antwort zählt; Suchtext nur trimmen, ab 2 Zeichen', () => {
    const l = latestOnly();
    const a = l.start();
    const b = l.start();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
    l.cancel();
    expect(b()).toBe(false);
    expect(searchText('  Tierarztpraxis Dr. Müller ')).toBe('Tierarztpraxis Dr. Müller');
    expect(searchText(' M ')).toBe('');
    expect(searchText('Mü')).toBe('Mü');
  });
});
