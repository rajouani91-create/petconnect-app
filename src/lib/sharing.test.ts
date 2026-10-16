import { describe, expect, it } from 'vitest';
import { translate } from '../i18n';
import { doneByName, inviteErrorKey, inviteLink, inviteStatusKey, isOpenInvite, tokenFromPath } from './sharing';

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
  it('Datenbank-Fehlertexte → verständliche Texte', () => {
    expect(inviteErrorKey('invite_used')).toBe('invUsed');
    expect(translate('de', inviteErrorKey('invite_used'))).toBe('Diese Einladung wurde schon verwendet. Bitten Sie um einen neuen Link.');
    expect(inviteErrorKey('invite_expired')).toBe('invExpired');
    expect(inviteErrorKey('invite_not_found')).toBe('invInvalid');
    expect(inviteErrorKey('not_authenticated')).toBe('invNeedLogin');
  });

  it('Unbekanntes ergibt die allgemeine Meldung', () => {
    expect(inviteErrorKey('irgendwas')).toBe('errGeneric');
    expect(inviteErrorKey(undefined)).toBe('errGeneric');
  });

  it('Vorschau-Status', () => {
    expect(inviteStatusKey('open')).toBe('open');
    expect(inviteStatusKey('member')).toBe('member');
    expect(inviteStatusKey('used')).toBe('invUsed');
    expect(inviteStatusKey('expired')).toBe('invExpired');
    expect(inviteStatusKey('???')).toBe('invInvalid');
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
