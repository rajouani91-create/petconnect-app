import { describe, expect, it } from 'vitest';
import { translate } from '../i18n';
import {
  canEdit,
  doneByName,
  groupPeople,
  inviteErrorKey,
  inviteLink,
  inviteStatusKey,
  isOpenInvite,
  parsePreview,
  toRole,
  tokenFromPath,
  type Membership,
} from './sharing';

const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);

describe('Einladungslink', () => {
  it('baut den Link aus Origin und Code', () => {
    expect(inviteLink('https://app.petconnect.de', TOKEN)).toBe(`https://app.petconnect.de/einladung/${TOKEN}`);
    expect(inviteLink('http://localhost:3000', 'abc123')).toBe('http://localhost:3000/einladung/abc123');
  });

  it('kein doppelter Schrägstrich, Sonderzeichen werden kodiert', () => {
    expect(inviteLink('http://localhost:3000/', 'abc')).toBe('http://localhost:3000/einladung/abc');
    expect(inviteLink('', 'a/b?c')).toBe('/einladung/a%2Fb%3Fc');
  });

  it('liest den Code aus dem Pfad, nur in gültiger Form', () => {
    expect(tokenFromPath(`/einladung/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPath(`/einladung/${TOKEN}/`)).toBe(TOKEN);
    expect(tokenFromPath('/einladung/kurz')).toBeNull();
    expect(tokenFromPath('/einladung/<script>alert(1)</script>xxxxxxxx')).toBeNull();
    expect(tokenFromPath('/tier')).toBeNull();
    expect(tokenFromPath('/einladung/%E0%A4%A')).toBeNull();
  });
});

describe('Fehler-Zuordnung', () => {
  const cases: [string, string][] = [
    ['invite_not_found', 'Dieser Einladungslink ist ungültig.'],
    ['invite_used', 'Diese Einladung wurde schon verwendet. Bitten Sie um einen neuen Link.'],
    ['invite_expired', 'Diese Einladung ist abgelaufen. Bitten Sie um einen neuen Link.'],
    ['invite_own', 'Das ist Ihre eigene Einladung.'],
    ['not_authenticated', 'Bitte melden Sie sich an, um die Einladung anzunehmen.'],
    ['invite_name', 'Bitte einen Namen angeben.'],
    ['invite_role', 'Bitte wählen Sie eine Rechte-Stufe.'],
    ['invite_no_pets', 'Bitte mindestens ein Tier auswählen.'],
    ['invite_not_owner', 'Sie können nur zu Ihren eigenen Tieren einladen.'],
    ['invite_duplicate', 'Diese Person ist schon eingeladen.'],
    ['invite_max', 'Es können höchstens 5 weitere Personen eingeladen werden.'],
  ];
  it.each(cases)('%s → verständlicher Text', (code, text) => {
    expect(translate('de', inviteErrorKey(code))).toBe(text);
  });

  it('jeder bekannte Code hat einen eigenen Text, nicht die allgemeine Meldung', () => {
    for (const [code] of cases) expect(inviteErrorKey(code)).not.toBe('errGeneric');
  });

  it('Unbekanntes ergibt die allgemeine Meldung', () => {
    expect(inviteErrorKey('irgendwas')).toBe('errGeneric');
    expect(inviteErrorKey(undefined)).toBe('errGeneric');
  });

  it('Vorschau-Status, auch „empty“', () => {
    expect(inviteStatusKey('open')).toBe('open');
    expect(inviteStatusKey('member')).toBe('member');
    expect(inviteStatusKey('used')).toBe('invUsed');
    expect(inviteStatusKey('expired')).toBe('invExpired');
    expect(inviteStatusKey('empty')).toBe('invInvalid');
    expect(inviteStatusKey(undefined)).toBe('invInvalid');
  });
});

describe('Vorschau (JSON)', () => {
  it('liest ein gültiges Objekt', () => {
    const p = parsePreview({
      inviter_name: 'Ahmed',
      invitee_name: 'Kyra',
      role: 'viewer',
      expires_at: '2026-10-23T12:00:00Z',
      pets: [{ name: 'Luna', species: 'dog', species_other: null }, { name: 'Mio', species: 'cat' }, { nope: 1 }],
      status: 'open',
    });
    expect(p?.role).toBe('viewer');
    expect(p?.pets.map((x) => x.name)).toEqual(['Luna', 'Mio']);
    expect(p?.pets[1]?.species_other).toBeNull();
  });

  it('null, Arrays und Objekte ohne Status ergeben null; unbekannte Rolle → Nur ansehen', () => {
    expect(parsePreview(null)).toBeNull();
    expect(parsePreview([])).toBeNull();
    expect(parsePreview({ pets: [] })).toBeNull();
    expect(parsePreview({ status: 'open', role: 'owner' })?.role).toBe('viewer');
  });
});

describe('Rechte', () => {
  it('canEdit: Haupthalter:in und Mithalter:in ja, Nur ansehen nein', () => {
    expect(canEdit('owner')).toBe(true);
    expect(canEdit('carer')).toBe(true);
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit(null)).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });

  it('unbekannte Rollen gelten als Nur ansehen', () => {
    expect(toRole('owner')).toBe('owner');
    expect(toRole('carer')).toBe('carer');
    expect(toRole('admin')).toBe('viewer');
    expect(toRole(null)).toBe('viewer');
  });
});

describe('Gruppierung der Personen', () => {
  const myPets = [
    { id: 'luna', name: 'Luna' },
    { id: 'mio', name: 'Mio' },
  ];
  const names = new Map([
    ['me', 'Ahmed'],
    ['kyra', 'Kyra'],
    ['erika', 'Oma Erika'],
  ]);
  const rows: Membership[] = [
    { pet_id: 'luna', user_id: 'me', role: 'owner' },
    { pet_id: 'mio', user_id: 'me', role: 'owner' },
    { pet_id: 'mio', user_id: 'kyra', role: 'carer' },
    { pet_id: 'luna', user_id: 'kyra', role: 'carer' },
    { pet_id: 'luna', user_id: 'erika', role: 'carer' },
    { pet_id: 'mio', user_id: 'erika', role: 'viewer' },
    // fremdes Tier, bei dem ich nur Mitbetreuer bin: gehört nicht in meine Liste
    { pet_id: 'rex', user_id: 'kyra', role: 'owner' },
    { pet_id: 'rex', user_id: 'me', role: 'carer' },
  ];

  it('eine Zeile pro Person, ohne mich, nach Name sortiert, Tiere in meiner Reihenfolge', () => {
    const people = groupPeople(rows, 'me', myPets, names);
    expect(people.map((p) => p.name)).toEqual(['Kyra', 'Oma Erika']);
    expect(people[0]!.pets.map((x) => x.name)).toEqual(['Luna', 'Mio']);
  });

  it('gleiche Stufe → role, unterschiedliche Stufen → null mit Stufe je Tier', () => {
    const [kyra, erika] = groupPeople(rows, 'me', myPets, names);
    expect(kyra!.role).toBe('carer');
    expect(erika!.role).toBeNull();
    expect(erika!.pets.map((x) => `${x.name}:${x.role}`)).toEqual(['Luna:carer', 'Mio:viewer']);
  });

  it('ohne Namen bleibt der Name leer, ohne eigene Tiere ist die Liste leer', () => {
    const people = groupPeople([{ pet_id: 'luna', user_id: 'x', role: 'viewer' }], 'me', myPets, new Map());
    expect(people[0]!.name).toBe('');
    expect(groupPeople(rows, 'me', [], names)).toEqual([]);
  });
});

describe('erledigt von', () => {
  const names = new Map([
    ['me', 'Ahmed'],
    ['kyra', 'Kyra'],
    ['blank', '  '],
  ]);

  it('andere Person: deren Name', () => {
    expect(doneByName('kyra', 'me', names)).toBe('Kyra');
    expect(translate('de', 'doneBy', { name: 'Kyra' })).toBe('erledigt von Kyra');
  });

  it('eigene Person ergibt kein „von“', () => {
    expect(doneByName('me', 'me', names)).toBeNull();
  });

  it('ohne bekannten Namen oder ohne Person: kein „von“', () => {
    expect(doneByName('unbekannt', 'me', names)).toBeNull();
    expect(doneByName('blank', 'me', names)).toBeNull();
    expect(doneByName(undefined, 'me', names)).toBeNull();
  });
});

describe('offene Einladungen', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  it('nur nicht angenommene und nicht abgelaufene', () => {
    expect(isOpenInvite({ accepted_at: null, expires_at: '2026-10-20T12:00:00Z' }, now)).toBe(true);
    expect(isOpenInvite({ accepted_at: '2026-10-16T10:00:00Z', expires_at: '2026-10-20T12:00:00Z' }, now)).toBe(false);
    expect(isOpenInvite({ accepted_at: null, expires_at: '2026-10-16T11:59:59Z' }, now)).toBe(false);
  });
});
