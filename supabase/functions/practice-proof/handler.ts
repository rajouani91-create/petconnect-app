/* Edge Function „practice-proof“: Urkunde vorlesen (Praxisleitung oder Admin) und Entscheidung des Admins umsetzen.
   Rechte prüft die Datenbank; hier nur Ablauf. Netzwerk kommt von außen (deps), damit alles ohne Server testbar ist. */
import { VISION_PROMPT, checkText, checkVision, type Reading, type Title } from './check.ts';

export interface ProofRow { id: string; path: string; mime: string; title: Title; person_name: string; practice_name: string; read_status: string }
export interface DbError { code?: string; message?: string }
export interface UserDb {
  proofForRead(id: string): Promise<{ data: ProofRow | null; error: DbError | null }>;
  decide(id: string, approve: boolean, reason: string): Promise<{ data: string | null; error: DbError | null }>;
}
export interface Admin {
  download(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
  setReading(id: string, status: 'done' | 'failed' | 'skipped', reading: Reading | { note: string }): Promise<void>;
  fileDeleted(id: string): Promise<void>;
}
export interface Deps {
  userDb(token: string): Promise<UserDb | null>;
  admin: Admin;
  pdfText(bytes: Uint8Array): Promise<string>;
  /** Bildmodell; null, wenn keins eingerichtet ist */
  vision: ((prompt: string, dataUrl: string) => Promise<string>) | null;
  allowedOrigins: string[];
  log(entry: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function headersFor(origin: string | null, allowed: boolean): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin && allowed) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-headers'] = 'authorization, content-type, apikey, x-client-info';
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-max-age'] = '600';
  }
  return h;
}

const dbCode = (e: DbError) => (/^[a-z_]+$/.test((e.message ?? '').trim()) ? (e.message ?? '').trim() : e.code === '42501' ? 'forbidden' : 'db_error');

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Datei lesen und prüfen. Text-PDF: nur lokaler Vergleich. Bild: Bildmodell, falls eingerichtet. Sonst „skipped“. */
export async function readProof(row: ProofRow, deps: Pick<Deps, 'admin' | 'pdfText' | 'vision'>): Promise<{ status: 'done' | 'failed' | 'skipped'; reading: Reading | { note: string } }> {
  let bytes: Uint8Array;
  try {
    bytes = await deps.admin.download(row.path);
  } catch {
    return { status: 'failed', reading: { note: 'download' } };
  }
  if (row.mime === 'application/pdf') {
    let text = '';
    try {
      text = await deps.pdfText(bytes);
    } catch {
      text = '';
    }
    // Gescannte PDFs haben keinen Text – dann bleibt der Blick des Betreibers
    if (text.replace(/\s/g, '').length < 30) return { status: 'skipped', reading: { note: 'scan' } };
    return { status: 'done', reading: checkText(text, row.title, row.person_name) };
  }
  if (!deps.vision) return { status: 'skipped', reading: { note: 'no_vision' } };
  try {
    const raw = await deps.vision(VISION_PROMPT, `data:${row.mime};base64,${toBase64(bytes)}`);
    const r = checkVision(raw, row.title, row.person_name);
    return r ? { status: 'done', reading: r } : { status: 'failed', reading: { note: 'unreadable' } };
  } catch {
    return { status: 'failed', reading: { note: 'vision_error' } };
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const originOk = origin === null || deps.allowedOrigins.includes(origin);
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: headersFor(origin, originOk) });
  const fail = (status: number, error: string) => {
    deps.log({ event: 'practice-proof', status, error });
    return reply(status, { error });
  };
  if (!originOk) return fail(403, 'origin_not_allowed');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin, true) });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
  if (!token) return fail(401, 'unauthenticated');
  let db: UserDb | null = null;
  try {
    db = await deps.userDb(token);
  } catch {
    db = null;
  }
  if (!db) return fail(401, 'unauthenticated');
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request');
  }
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : '';
  if (!id) return fail(400, 'bad_request');

  if (body.action === 'read') {
    const { data, error } = await db.proofForRead(id);
    if (error || !data) return fail(error?.code === '42501' ? 403 : 404, error ? dbCode(error) : 'proof_not_found');
    const res = await readProof(data, deps);
    await deps.admin.setReading(id, res.status, res.reading);
    deps.log({ event: 'practice-proof', action: 'read', status: res.status });
    return reply(200, { ok: true, status: res.status, reading: res.reading });
  }

  if (body.action === 'decide') {
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (typeof body.approve !== 'boolean') return fail(400, 'bad_request');
    const { data, error } = await db.decide(id, body.approve, reason);
    if (error || !data) return fail(error?.code === '42501' ? 403 : 400, error ? dbCode(error) : 'db_error');
    // Nach der Entscheidung wird die Urkunde gelöscht; das Ergebnis bleibt
    try {
      await deps.admin.remove(data);
      await deps.admin.fileDeleted(id);
    } catch {
      deps.log({ event: 'practice-proof', action: 'decide', cleanup: 'failed' });
    }
    deps.log({ event: 'practice-proof', action: 'decide', status: 200 });
    return reply(200, { ok: true });
  }
  return fail(400, 'bad_request');
}
