import { describe, expect, it } from 'vitest';
import { deleteAccountMailto } from './legal';
import { DEFAULT_PREFS, deviceLabel, isIOS, prefsWrite, pushStatus, uint8ToUrlBase64, urlBase64ToUint8Array, type PushEnv } from './push';

describe('applicationServerKey', () => {
  it('base64url ohne Padding → Bytes', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
    expect([...urlBase64ToUint8Array('AQ')]).toEqual([1]);
    // typischer VAPID-Schlüssel: 65 Bytes, beginnt mit 0x04
    const key = 'BOr7mQ8w0r4Yp3FQnpxV6jbh5Rz9v5Ecd8XyO6rVb6Ff8w3S0pG3CpAuZ1QnY0Zl7k9mJgN7bW3fXyH2QzJk1Lc';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
    expect(uint8ToUrlBase64(bytes.buffer)).toBe(key);
  });
  it('ungültige Zeichen → Fehler', () => {
    expect(() => urlBase64ToUint8Array('ab$c')).toThrow('Ungültiger Schlüssel');
  });
});

describe('Gerätebezeichnung', () => {
  const UA = {
    pixel: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  };
  it('Betriebssystem · Browser', () => {
    expect(deviceLabel(UA.pixel)).toBe('Android · Chrome');
    expect(deviceLabel(UA.samsung)).toBe('Android · Samsung Internet');
    expect(deviceLabel(UA.iphone)).toBe('iPhone · Safari');
    expect(deviceLabel(UA.ipad, 'MacIntel', 5)).toBe('iPad · Safari');
    expect(deviceLabel(UA.ipad, 'MacIntel', 0)).toBe('Mac · Safari');
    expect(deviceLabel(UA.firefox)).toBe('Windows · Firefox');
    expect(deviceLabel(UA.edge)).toBe('Windows · Edge');
    expect(deviceLabel('')).toBe('Browser');
    expect(deviceLabel('x'.repeat(500)).length).toBeLessThanOrEqual(80);
  });
  it('iPhone/iPad erkennen (auch iPadOS als „Mac“)', () => {
    expect(isIOS(UA.iphone)).toBe(true);
    expect(isIOS(UA.ipad, 'MacIntel', 5)).toBe(true);
    expect(isIOS(UA.ipad, 'MacIntel', 0)).toBe(false);
    expect(isIOS(UA.pixel)).toBe(false);
  });
});

describe('Status dieses Geräts', () => {
  const ok: PushEnv = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default', ios: false, standalone: false, subscribed: false };
  it('unterstützt / blockiert / aktiv / noch nicht aktiviert', () => {
    expect(pushStatus(ok)).toBe('inactive');
    expect(pushStatus({ ...ok, permission: 'granted' })).toBe('inactive');
    expect(pushStatus({ ...ok, permission: 'granted', subscribed: true })).toBe('active');
    expect(pushStatus({ ...ok, permission: 'denied', subscribed: true })).toBe('blocked');
    expect(pushStatus({ ...ok, hasPushManager: false })).toBe('unsupported');
    expect(pushStatus({ ...ok, hasServiceWorker: false })).toBe('unsupported');
    expect(pushStatus({ ...ok, hasNotification: false, permission: 'unknown' })).toBe('unsupported');
  });
  it('iOS ohne Home-Bildschirm: erklären statt Fehler; als Web-App normal', () => {
    expect(pushStatus({ ...ok, ios: true, standalone: false, hasPushManager: false })).toBe('ios-home');
    expect(pushStatus({ ...ok, ios: true, standalone: true })).toBe('inactive');
    expect(pushStatus({ ...ok, ios: true, standalone: true, permission: 'granted', subscribed: true })).toBe('active');
  });
});

describe('Einstellungen speichern', () => {
  it('ohne Zeile anlegen, danach ändern; Uhrzeit HH:MM', () => {
    expect(prefsWrite(false, DEFAULT_PREFS)).toEqual({ op: 'insert', values: { medication: true, routine: true, reminders: true, appointments: true, reminder_time: '09:00' } });
    expect(prefsWrite(true, { ...DEFAULT_PREFS, reminders: false, reminder_time: '07:30:00' })).toEqual({ op: 'update', values: { medication: true, routine: true, reminders: false, appointments: true, reminder_time: '07:30' } });
  });
});

describe('Konto löschen', () => {
  it('mailto mit Betreff und Text; ohne hinterlegte Adresse leerer Empfänger', () => {
    expect(deleteAccountMailto(null, 'a@b.de', 'Konto löschen', 'Bitte löschen ({email})')).toBe('mailto:?subject=Konto%20l%C3%B6schen&body=Bitte%20l%C3%B6schen%20(a%40b.de)');
    expect(deleteAccountMailto('kontakt@example.org', 'a@b.de', 'X', 'Y')).toBe('mailto:kontakt@example.org?subject=X&body=Y');
  });
});
