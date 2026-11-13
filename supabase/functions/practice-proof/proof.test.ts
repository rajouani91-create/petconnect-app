import { describe, expect, it, vi } from 'vitest';
import { checkText, checkVision, lastName, simple } from './check.ts';
import { handle, readProof, type Admin, type Deps, type ProofRow, type UserDb } from './handler.ts';

const CERT = `Landestierärztekammer Hessen
Urkunde
Frau Dr. med. vet. Lea Brandt
ist berechtigt, die Bezeichnung
Fachtierärztin für Chirurgie
zu führen. Wiesbaden, 3. März 2021`;

describe('Prüfung des Textes', () => {
  it('vereinfacht Umlaute und Titel', () => {
    expect(simple('Fachtierärztin für Vögel')).toBe('fachtierarztin fur vogel');
    expect(lastName('Dr. med. vet. Lea Brandt')).toBe('brandt');
  });
  it('passende Urkunde', () => {
    expect(checkText(CERT, 'surgery', 'Dr. Lea Brandt')).toMatchObject({ method: 'text', is_certificate: true, title_match: true, name_match: true, chamber_found: true, matches: true });
  });
  it('falscher Titel oder falscher Name passt nicht', () => {
    expect(checkText(CERT, 'horses', 'Dr. Lea Brandt')).toMatchObject({ title_match: false, matches: false });
    expect(checkText(CERT, 'surgery', 'Jonas Weber')).toMatchObject({ name_match: false, matches: false });
    expect(checkText('Rechnung Nr. 12, Kammer', 'surgery', 'Brandt')).toMatchObject({ is_certificate: false, matches: false });
  });
  it('Bildmodell: JSON wird geprüft, Felder gekürzt und bereinigt', () => {
    const r = checkVision('Hier: {"is_certificate": true, "title_text": "Fachtierarzt für Zier-, Zoo- und Wildvögel", "holder_name": "Dr. <b>Max Müller</b>", "issuer": "Tierärztekammer Berlin", "issue_date": "2020"}', 'birds', 'Max Müller');
    expect(r).toMatchObject({ method: 'vision', matches: true, holder_name: 'Dr.  b Max Müller /b' });
    expect(checkVision('kein json', 'birds', 'X')).toBeNull();
    expect(checkVision('{"is_certificate": false, "title_text": "Fachtierarzt für Pferde", "issuer": "Tierärztekammer"}', 'horses', 'X')?.matches).toBe(false);
  });
});

const row: ProofRow = { id: '11111111-1111-4111-8111-111111111111', path: 'p/1.pdf', mime: 'application/pdf', title: 'surgery', person_name: 'Lea Brandt', practice_name: 'Ost', read_status: 'pending' };

function setup(over: { db?: Partial<UserDb>; admin?: Partial<Admin>; vision?: Deps['vision']; pdf?: string } = {}) {
  const db: UserDb = { proofForRead: vi.fn(async () => ({ data: row, error: null })), decide: vi.fn(async () => ({ data: 'p/1.pdf', error: null })), ...over.db };
  const admin: Admin = { download: vi.fn(async () => new Uint8Array([1, 2, 3])), remove: vi.fn(async () => {}), setReading: vi.fn(async () => {}), fileDeleted: vi.fn(async () => {}), ...over.admin };
  const deps: Deps = { userDb: async () => db, admin, pdfText: async () => over.pdf ?? CERT, vision: over.vision ?? null, allowedOrigins: [], log: () => {} };
  return { db, admin, deps };
}
const req = (body: unknown) => new Request('https://x/f', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) });

describe('Ablauf', () => {
  it('Text-PDF wird ohne KI geprüft und gespeichert', async () => {
    const vision = vi.fn(async () => '');
    const { deps, admin } = setup({ vision });
    const res = await handle(req({ action: 'read', id: row.id }), deps);
    expect(res.status).toBe(200);
    expect(vision).not.toHaveBeenCalled();
    expect(vi.mocked(admin.setReading).mock.calls[0]![1]).toBe('done');
  });
  it('Scan ohne Text oder Bild ohne Bildmodell: übersprungen (Betreiber sieht selbst nach)', async () => {
    expect((await readProof(row, setup({ pdf: '  ' }).deps)).status).toBe('skipped');
    expect((await readProof({ ...row, mime: 'image/jpeg' }, setup().deps)).status).toBe('skipped');
  });
  it('Bild mit Bildmodell', async () => {
    const vision = vi.fn(async () => '{"is_certificate": true, "title_text": "Fachtierärztin für Chirurgie", "holder_name": "Lea Brandt", "issuer": "Landestierärztekammer Hessen"}');
    const r = await readProof({ ...row, mime: 'image/png' }, setup({ vision }).deps);
    expect(r.status).toBe('done');
    expect(vision.mock.calls[0]![1]).toMatch(/^data:image\/png;base64,/);
  });
  it('Entscheidung löscht die Datei; ohne Rechte 403', async () => {
    const a = setup();
    expect((await handle(req({ action: 'decide', id: row.id, approve: true, reason: 'passt' }), a.deps)).status).toBe(200);
    expect(a.admin.remove).toHaveBeenCalledWith('p/1.pdf');
    expect(a.admin.fileDeleted).toHaveBeenCalledWith(row.id);
    const b = setup({ db: { decide: vi.fn(async () => ({ data: null, error: { code: '42501', message: 'forbidden' } })) } });
    expect((await handle(req({ action: 'decide', id: row.id, approve: true, reason: 'x' }), b.deps)).status).toBe(403);
    expect(b.admin.remove).not.toHaveBeenCalled();
  });
  it('fremder Nachweis: 404, nichts gelesen', async () => {
    const { deps, admin } = setup({ db: { proofForRead: vi.fn(async () => ({ data: null, error: { code: 'P0002', message: 'proof_not_found' } })) } });
    expect((await handle(req({ action: 'read', id: row.id }), deps)).status).toBe(404);
    expect(admin.download).not.toHaveBeenCalled();
  });
});
