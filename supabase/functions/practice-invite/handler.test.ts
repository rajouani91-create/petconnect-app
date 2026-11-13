import { describe, expect, it, vi } from 'vitest';
import { dbCode, handle, type AdminApi, type Deps, type UserDb } from './handler.ts';

const row = { invite_id: '11111111-1111-4111-8111-111111111111', email: 'vet@x.de', name: 'Dr. Vet', role: 'vet', practice_name: 'Praxis Ost' };

function setup(over: { db?: Partial<UserDb>; admin?: Partial<AdminApi>; noUser?: boolean } = {}) {
  const db: UserDb = {
    createInvite: vi.fn(async () => ({ data: row, error: null })),
    resendInvite: vi.fn(async () => ({ data: row, error: null })),
    revokeInvite: vi.fn(async () => ({ data: 'vet@x.de', error: null })),
    ...over.db,
  };
  const admin: AdminApi = {
    inviteUser: vi.fn(async () => ({ error: null })),
    orphanUser: vi.fn(async () => 'u-1'),
    deleteUser: vi.fn(async () => {}),
    ...over.admin,
  };
  const deps: Deps = { userDb: async () => (over.noUser ? null : db), admin, allowedOrigins: ['https://petconnect24.com'], redirectTo: 'https://petconnect24.com/app/praxis/einladung', log: () => {} };
  return { db, admin, deps };
}
const req = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer t', origin: 'https://petconnect24.com' }) =>
  new Request('https://x/functions/v1/practice-invite', { method: 'POST', headers, body: JSON.stringify(body) });

describe('practice-invite', () => {
  it('lädt ein und sendet die Mail mit Praxisdaten in der gewählten Sprache', async () => {
    const { deps, db, admin } = setup();
    const res = await handle(req({ action: 'invite', email: 'vet@x.de', name: 'Dr. Vet', role: 'vet', language: 'en' }), deps);
    expect(res.status).toBe(200);
    expect(db.createInvite).toHaveBeenCalledWith('vet@x.de', 'Dr. Vet', 'vet');
    expect(admin.inviteUser).toHaveBeenCalledWith('vet@x.de', { account_type: 'practice', display_name: 'Dr. Vet', language: 'en', practice_name: 'Praxis Ost' }, 'https://petconnect24.com/app/praxis/einladung');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://petconnect24.com');
  });

  it('unbekannte Sprache wird Deutsch', async () => {
    const { deps, admin } = setup();
    await handle(req({ action: 'invite', email: 'vet@x.de', name: 'V', role: 'team', language: 'xx' }), deps);
    expect(vi.mocked(admin.inviteUser).mock.calls[0]![1].language).toBe('de');
  });

  it('ohne Anmeldung 401, fremde Herkunft 403, falsche Rolle 400', async () => {
    expect((await handle(req({ action: 'invite' }, { origin: 'https://petconnect24.com' }), setup().deps)).status).toBe(401);
    expect((await handle(req({ action: 'invite' }), setup({ noUser: true }).deps)).status).toBe(401);
    expect((await handle(req({}, { authorization: 'Bearer t', origin: 'https://evil.example' }), setup().deps)).status).toBe(403);
    expect((await handle(req({ action: 'invite', email: 'a@b.de', name: 'A', role: 'admin' }), setup().deps)).status).toBe(400);
  });

  it('Fehler der Datenbank wird als Code weitergegeben (keine Mail)', async () => {
    const { deps, admin } = setup({ db: { createInvite: vi.fn(async () => ({ data: null, error: { code: '23505', message: 'invite_exists' } })) } });
    const res = await handle(req({ action: 'invite', email: 'vet@x.de', name: 'V', role: 'vet' }), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invite_exists' });
    expect(admin.inviteUser).not.toHaveBeenCalled();
  });

  it('nicht Praxisleitung: 403', async () => {
    const { deps } = setup({ db: { createInvite: vi.fn(async () => ({ data: null, error: { code: '42501', message: 'forbidden' } })) } });
    expect((await handle(req({ action: 'invite', email: 'vet@x.de', name: 'V', role: 'vet' }), deps)).status).toBe(403);
  });

  it('Mailversand scheitert: Einladung wird zurückgezogen, 502', async () => {
    const { deps, db } = setup({ admin: { inviteUser: vi.fn(async () => ({ error: { message: 'smtp down' } })) } });
    const res = await handle(req({ action: 'invite', email: 'vet@x.de', name: 'V', role: 'vet' }), deps);
    expect(res.status).toBe(502);
    expect(db.revokeInvite).toHaveBeenCalledWith(row.invite_id);
  });

  it('erneut senden: bestätigtes Konto meldet already_confirmed', async () => {
    const { deps } = setup({ admin: { inviteUser: vi.fn(async () => ({ error: { code: 'email_exists', message: 'x' } })) } });
    const res = await handle(req({ action: 'resend', id: row.invite_id }), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_confirmed' });
    expect((await handle(req({ action: 'resend', id: 'kein-uuid' }), setup().deps)).status).toBe(400);
  });

  it('zurückziehen löscht nur ein unbenutztes Konto', async () => {
    const a = setup();
    expect((await handle(req({ action: 'revoke', id: row.invite_id }), a.deps)).status).toBe(200);
    expect(a.admin.deleteUser).toHaveBeenCalledWith('u-1');
    const b = setup({ admin: { orphanUser: vi.fn(async () => null) } });
    await handle(req({ action: 'revoke', id: row.invite_id }), b.deps);
    expect(b.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('dbCode nimmt nur einfache Codes', () => {
    expect(dbCode({ message: 'last_lead' })).toBe('last_lead');
    expect(dbCode({ message: 'some long sentence', code: '42501' })).toBe('forbidden');
    expect(dbCode({ message: 'x y' })).toBe('db_error');
  });
});
