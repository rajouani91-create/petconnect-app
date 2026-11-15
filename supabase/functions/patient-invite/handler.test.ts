import { describe, expect, it, vi } from 'vitest';
import { handle, dbCode, type Deps, type InviteRow, type UserDb } from './handler';
import { LANGS, TEXTS, buildMail, cleanName, pickLang } from './mail';

const ROW: InviteRow = { invite_id: '11111111-1111-4111-8111-111111111111', code: 'PC-7KQ3-M9XZ', email: 'ole@x.de', owner_name: 'Ole Becker', pet_name: 'Bello', practice_name: 'Praxis Ostpark', expires_at: '2026-12-15T10:00:00Z' };

function setup(over: Partial<UserDb> = {}, send: Deps['send'] = vi.fn(async () => {})) {
  const db: UserDb = { create: vi.fn(async () => ({ data: ROW, error: null })), resend: vi.fn(async () => ({ data: ROW, error: null })), ...over };
  const log = vi.fn();
  const deps: Deps = { userDb: async (t) => (t === 'good' ? db : null), send, allowedOrigins: ['https://petconnect24.com'], appOrigin: 'https://petconnect24.com', log };
  return { deps, db, send, log };
}
const req = (body: unknown, init: { token?: string | null; origin?: string; method?: string } = {}) =>
  new Request('https://x/functions/v1/patient-invite', {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.origin ? { origin: init.origin } : {}), ...(init.token === null ? {} : { authorization: `Bearer ${init.token ?? 'good'}` }) },
    body: init.method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
const CREATE = { action: 'create', owner: { name: 'Ole Becker', email: 'ole@x.de' }, pet: { name: 'Bello', species: 'dog' }, lang: 'de' };

describe('patient-invite', () => {
  it('legt an, verschickt die Mail mit Code und Link und antwortet ohne Praxisnamen-Leck', async () => {
    const { deps, db, send } = setup();
    const res = await handle(req(CREATE, { origin: 'https://petconnect24.com' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invite: { id: ROW.invite_id, code: ROW.code, email: 'ole@x.de', pet_name: 'Bello', expires_at: ROW.expires_at }, mailed: true });
    expect(db.create).toHaveBeenCalledWith(CREATE.owner, CREATE.pet);
    const [to, mail] = (send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(to).toBe('ole@x.de');
    expect(mail.subject).toBe('Praxis Ostpark lädt Sie zu PetConnect24 ein');
    expect(mail.text).toContain('PC-7KQ3-M9XZ');
    expect(mail.text).toContain('https://petconnect24.com/app/praxiseinladung?code=PC-7KQ3-M9XZ');
    expect(mail.html).toContain('Bello');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://petconnect24.com');
  });
  it('Versand schlägt fehl: Einladung bleibt, mailed = false', async () => {
    const { deps } = setup({}, vi.fn(async () => { throw new Error('brevo'); }));
    const res = await handle(req(CREATE), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).mailed).toBe(false);
  });
  it('erneut senden', async () => {
    const { deps, db, send } = setup();
    const res = await handle(req({ action: 'resend', id: ROW.invite_id, lang: 'en' }), deps);
    expect(res.status).toBe(200);
    expect(db.resend).toHaveBeenCalledWith(ROW.invite_id);
    expect((send as ReturnType<typeof vi.fn>).mock.calls[0]![1].subject).toBe('Praxis Ostpark invites you to PetConnect24');
  });
  it('Fehler der Datenbank → Code und Status, keine Mail', async () => {
    const send = vi.fn(async () => {});
    for (const [message, status] of [['invite_exists', 409], ['forbidden', 403], ['practice_pending', 403], ['email_invalid', 400], ['too_soon', 429]] as const) {
      const { deps } = setup({ create: async () => ({ data: null, error: { message } }), resend: async () => ({ data: null, error: { message } }) }, send);
      const res = await handle(req(CREATE), deps);
      expect(res.status, message).toBe(status);
      expect(await res.json()).toEqual({ error: message });
    }
    expect(send).not.toHaveBeenCalled();
    expect(dbCode({ message: 'duplicate key value violates…', code: '23505' })).toBe('db_error');
    expect(dbCode({ message: 'permission denied for table x', code: '42501' })).toBe('forbidden');
  });
  it('ohne Anmeldung, fremde Herkunft, falsche Eingaben', async () => {
    const { deps } = setup();
    expect((await handle(req(CREATE, { token: null }), deps)).status).toBe(401);
    expect((await handle(req(CREATE, { token: 'bad' }), deps)).status).toBe(401);
    expect((await handle(req(CREATE, { origin: 'https://evil.example' }), deps)).status).toBe(403);
    expect((await handle(req({ action: 'create', owner: 'x', pet: {} }), deps)).status).toBe(400);
    expect((await handle(req({ action: 'resend', id: 'nope' }), deps)).status).toBe(400);
    expect((await handle(req({ action: 'delete' }), deps)).status).toBe(400);
    expect((await handle(req(null, { method: 'OPTIONS', origin: 'https://petconnect24.com' }), deps)).status).toBe(204);
    expect((await handle(new Request('https://x', { method: 'GET' }), deps)).status).toBe(405);
  });
  it('schreibt keine Adressen oder Codes ins Log', async () => {
    const { deps, log } = setup();
    await handle(req(CREATE), deps);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/ole@x\.de|PC-7KQ3/);
  });
});

describe('Mail', () => {
  it('alle Sprachen vollständig, Platzhalter ersetzt, Eingaben maskiert', () => {
    for (const lang of LANGS) {
      const t = TEXTS[lang];
      expect(t.subject, lang).toContain('{practice}');
      expect(t.intro, lang).toContain('{pet}');
      expect(t.code, lang).toContain('{code}');
      expect(t.code, lang).toContain('{date}');
      const m = buildMail({ lang, practice: 'Praxis <b>Ost</b>', owner: 'Ole', pet: 'Bello & Co', code: 'PC-AAAA-BBBB', expiresAt: '2026-12-15T10:00:00Z', link: 'https://petconnect24.com/app/praxiseinladung?code=PC-AAAA-BBBB' });
      expect(m.html + m.text + m.subject, lang).not.toMatch(/\{(practice|pet|name|code|date)\}/);
      expect(m.html, lang).not.toContain('<b>');
      expect(m.html, lang).toContain('Bello &amp; Co');
      expect(m.html, lang).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
    }
    expect(LANGS).toHaveLength(11);
    expect(pickLang('xx')).toBe('de');
    expect(cleanName('  A\u0000B  ')).toBe('A B');
  });
});
