// Prüft die Verschlüsselung (RFC 8291) mit der Gegenseite eines Geräts und die Texte der Benachrichtigungen.
import { describe, expect, it } from 'vitest';
import { b64u, encryptPayload, generateVapid, unb64u } from './webpush';
import { buildMessage, buildPayload, type Job } from './message';
import { TEXTS } from './texts';

const enc = new TextEncoder();
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, k, len * 8));
}

/** Entschlüsselt wie der Browser auf dem Gerät */
async function decrypt(msg: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array): Promise<string> {
  const salt = msg.slice(0, 16);
  const rs = new DataView(msg.buffer, msg.byteOffset + 16, 4).getUint32(0);
  const idLen = msg[20];
  const asPublic = msg.slice(21, 21 + idLen);
  const cipher = msg.slice(21 + idLen);
  expect(rs).toBe(4096);
  expect(idLen).toBe(65);
  const asKey = await crypto.subtle.importKey('raw', asPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, cipher as BufferSource));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('webpush', () => {
  it('verschlüsselt so, dass das Gerät die Nachricht lesen kann', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const text = JSON.stringify({ title: 'Bello: Neuer Eintrag der Praxis', body: 'Praxis Ostpark hat die Tierakte ergänzt.' });
    const msg = await encryptPayload(b64u(uaPublic), b64u(auth), enc.encode(text));
    expect(await decrypt(msg, ua, uaPublic, auth)).toBe(text);
  });
  it('base64url hin und zurück, VAPID-Schlüssel ist ein unkomprimierter Punkt', async () => {
    const b = crypto.getRandomValues(new Uint8Array(33));
    expect([...unb64u(b64u(b))]).toEqual([...b]);
    const k = await generateVapid();
    expect(unb64u(k.publicKey).length).toBe(65);
    expect(k.privateJwk.d).toBeTruthy();
  });
});

const job = (o: Partial<Job>): Job => ({ kind: 'reminder', ref_id: 'r1', slot: 's', pet: 'Bello', title: 'Wurmkur', url: '/erinnerungen', language: 'de', info: {}, subs: [], ...o });

describe('buildMessage', () => {
  it('Hinweis der Praxis: Tier, Praxisname, kein Inhalt des Eintrags', () => {
    const m = buildMessage(job({ kind: 'practice', title: 'Praxis Ostpark', url: '/tier/1/gesundheitsakte' }));
    expect(m).toEqual({ title: 'Bello: Neuer Eintrag der Praxis', body: 'Praxis Ostpark hat die Tierakte ergänzt. In PetConnect ansehen.', url: '/tier/1/gesundheitsakte', tag: 'practice-r1-s' });
  });
  it('alle Sprachen haben die Texte der Praxis mit Platzhalter', () => {
    for (const [lang, T] of Object.entries(TEXTS)) {
      expect(T.prac.length, lang).toBeGreaterThan(3);
      expect(T.pracBody, lang).toContain('{p}');
      expect(buildMessage(job({ kind: 'practice', title: 'P', language: lang })).body, lang).not.toContain('{p}');
    }
    expect(Object.keys(TEXTS)).toHaveLength(11);
  });
  it('bisherige Arten unverändert', () => {
    expect(buildMessage(job({})).body).toBe('Heute fällig');
    expect(buildMessage(job({ kind: 'medication', title: 'Meloxicam', info: { amount: 0.5, unit: 'ml', hint: 'with_food', time: '08:00' } })).body).toBe('Medikament: 08:00 Uhr · 0,5 ml · mit Futter. Gegeben? In PetConnect abhaken.');
    expect(buildMessage(job({ kind: 'appointment', title: 'Impfung', info: { time: '15:00', location: 'Praxis' } })).body).toBe('In 1 Stunde: 15:00 Uhr · Praxis');
    expect(buildMessage(job({ kind: 'routine', info: { rkind: 'walk', time: '07:00' } })).title).toBe('Bello: Gassirunde');
    expect(buildMessage(job({ language: 'xx' })).body).toBe('Heute fällig');
  });
  it('Online-Buchung: Texte für Praxis und Halter:in, Zeit in Berliner Ortszeit', () => {
    const at = '2026-11-23T08:00:00Z';
    const pr = buildMessage(job({ kind: 'booking', title: 'Praxis Ostpark', url: '/praxis/termine', info: { event: 'requested', target: 'practice', starts_at: at } }));
    expect(pr.title).toBe('Neue Online-Buchung');
    expect(pr.body).toMatch(/^Bello · Mo\.?, 23\. Nov\.?,? 09:00/);
    const ow = buildMessage(job({ kind: 'booking', title: 'Praxis Ostpark', url: '/termine', info: { event: 'declined', target: 'owner', starts_at: at } }));
    expect(ow.title).toBe('Bello: Terminanfrage abgelehnt');
    expect(ow.body).toContain('Praxis Ostpark kann den Termin');
    for (const [lang, T] of Object.entries(TEXTS)) {
      for (const ev of ['requested', 'confirmed', 'declined', 'cancelled', 'moved', 'owner_cancelled', 'slot_free', 'remind48', 'remind2', 'cancelled_alt', 'alt_taken', 'offer_taken']) {
        expect(T.bk[ev], `${lang} ${ev}`).toHaveLength(2);
        const m = buildMessage(job({ kind: 'booking', title: 'P', language: lang, info: { event: ev, target: ev === 'requested' || ev === 'owner_cancelled' || ev === 'alt_taken' || ev === 'offer_taken' ? 'practice' : 'owner', starts_at: at } }));
        expect(m.title + m.body, `${lang} ${ev}`).not.toMatch(/\{(p|pet|d)\}/);
      }
    }
    expect(buildMessage(job({ kind: 'booking', title: 'P', info: { event: 'neu' } }))).toMatchObject({ title: 'Bello', body: 'P' });
  });
  it('Impferinnerung: Tier, Impfung, Fälligkeit, Praxis', () => {
    const m = buildMessage(job({ kind: 'recall', title: 'Praxis Ostpark', url: '/termine/buchen?praxis=1', info: { vaccine: 'Tollwut', due_on: '2026-12-03' } }));
    expect(m.title).toBe('Bello: Impfung fällig');
    expect(m.body).toBe('Praxis Ostpark erinnert an die Impfung „Tollwut“ (fällig am 3. Dezember 2026). Jetzt Termin buchen.');
    for (const lang of Object.keys(TEXTS)) {
      const x = buildMessage(job({ kind: 'recall', title: 'P', language: lang, info: { vaccine: 'V', due_on: '2026-12-03' } }));
      expect(x.title + x.body, lang).not.toMatch(/\{(p|v|d)\}/);
    }
  });
  it('Anfragen: Praxis ohne Nachrichtentext, Notfall hervorgehoben, Antwort an Halter:in', () => {
    const n = buildMessage(job({ kind: 'inquiry', title: 'Ole', url: '/praxis/anfragen', info: { event: 'new', urgency: 'soon' } }));
    expect(n).toMatchObject({ title: 'Neue Anfrage', body: 'Ole · Bello. In PetConnect ansehen.' });
    expect(buildMessage(job({ kind: 'inquiry', title: 'Ole', info: { event: 'new', urgency: 'emergency' } })).title).toBe('Notfall-Anfrage');
    expect(buildMessage(job({ kind: 'inquiry', title: 'Praxis Ostpark', info: { event: 'answered' } }))).toMatchObject({ title: 'Bello: Antwort der Praxis', body: 'Praxis Ostpark hat auf Ihre Anfrage geantwortet.' });
    for (const [lang, T] of Object.entries(TEXTS)) {
      for (const ev of ['new', 'new_emergency', 'answered', 'offered']) expect(T.iq[ev], `${lang} ${ev}`).toHaveLength(2);
      for (const info of [{ event: 'new', urgency: 'emergency' }, { event: 'new', urgency: 'normal' }, { event: 'answered' }, { event: 'offered' }]) {
        const x = buildMessage(job({ kind: 'inquiry', title: 'P', language: lang, info }));
        expect(x.title + x.body, lang).not.toMatch(/\{(p|o|pet)\}/);
      }
    }
  });
  it('Rechnung: Nummer, Betrag und Fälligkeit, Storno ohne Minuszeichen', () => {
    const m = buildMessage(job({ kind: 'invoice', title: 'Praxis Ostpark', url: '/mehr/rechnungen', info: { event: 'invoice', number: 'RE-2026-00001', gross: 176.51, currency: 'EUR', due_on: '2026-11-26' } }));
    expect(m.title).toBe('Bello: Neue Rechnung');
    expect(m.body).toMatch(/^Praxis Ostpark: Rechnung RE-2026-00001 über 176,51\s€, fällig am 26\. November 2026\.$/);
    expect(buildMessage(job({ kind: 'invoice', title: 'P', info: { event: 'cancellation', number: 'X', gross: -10, currency: 'EUR' } })).body).toMatch(/^P: Stornorechnung X über 10,00\s€\.$/);
    for (const [lang, T] of Object.entries(TEXTS)) {
      for (const ev of ['invoice', 'cancellation']) {
        expect(T.inv[ev], `${lang} ${ev}`).toHaveLength(2);
        const x = buildMessage(job({ kind: 'invoice', title: 'P', language: lang, info: { event: ev, number: 'N', gross: 5, currency: 'EUR', due_on: '2026-11-26' } }));
        expect(x.title + x.body, lang).not.toMatch(/\{(p|no|a|d)\}/);
      }
    }
  });
  it('unbekannte Art: neutrale Meldung', () => {
    expect(buildMessage(job({ kind: 'neu' as Job['kind'], title: 'Etwas' }))).toMatchObject({ title: 'Bello', body: 'Etwas' });
  });
});

describe('buildPayload (Auftrag 13)', () => {
  const job: Job = { kind: 'medication', ref_id: 'm1', slot: '2026-01-15T08:30:00Z', pet: 'Bello', title: 'Carprofen', url: '/erinnerungen', language: 'de',
    info: { amount: 1, unit: 'tablet', time: '08:00' }, subs: [], notification_id: 'n1', category: 'medication', action: 'a'.repeat(64) };
  it('enthält ID, Kategorie, Uhrzeit, Token und Adresse', () => {
    const p = buildPayload(job, { url: 'https://x.supabase.co/', key: 'pk' });
    expect(p).toMatchObject({ url: '/erinnerungen', nid: 'n1', cat: 'medication', t: '08:00', qa: 'a'.repeat(64), api: { url: 'https://x.supabase.co', key: 'pk' } });
  });
  it('ohne Schlüssel oder mit ungültigem Token: kein Token in der Nachricht', () => {
    expect(buildPayload(job, null).qa).toBeUndefined();
    expect(buildPayload({ ...job, action: 'kurz' }, { url: 'https://x.supabase.co', key: 'pk' }).qa).toBeUndefined();
    expect(buildPayload({ ...job, action: null, kind: 'invoice' }, { url: 'https://x.supabase.co', key: 'pk' }).t).toBeUndefined();
  });
});
