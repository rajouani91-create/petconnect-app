/* Logik der Edge Function „patient-invite“: Praxis nimmt einen Patienten auf oder sendet die Einladung erneut.
   Rechte und Prüfung liegen in der Datenbank (practice_create_patient_invite / practice_resend_patient_invite);
   diese Datei verschickt danach die Einladungs-Mail. Netzwerk kommt von außen (deps), damit alles ohne Server testbar ist.
   Schlägt der Versand fehl, bleibt die Einladung bestehen – die Praxis kann den Code persönlich weitergeben. */
import { buildMail, pickLang, type Mail } from './mail.ts';

export interface InviteRow { invite_id: string; code: string; email: string; owner_name: string; pet_name: string; practice_name: string; expires_at: string }
export interface DbError { code?: string; message?: string }
export interface UserDb {
  create(owner: Record<string, unknown>, pet: Record<string, unknown>): Promise<{ data: InviteRow | null; error: DbError | null }>;
  resend(id: string): Promise<{ data: InviteRow | null; error: DbError | null }>;
}
export interface Deps {
  userDb(token: string): Promise<UserDb | null>;
  send(to: string, mail: Mail): Promise<void>;
  allowedOrigins: string[];
  appOrigin: string;
  log(entry: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

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

/** Fehler aus der Datenbank → kurzer Code für die App (Meldungstext der Funktion, z. B. 'invite_exists'). */
export function dbCode(e: DbError): string {
  const m = (e.message ?? '').trim();
  return /^[a-z_]+$/.test(m) ? m : e.code === '42501' ? 'forbidden' : 'db_error';
}
const STATUS: Record<string, number> = { forbidden: 403, practice_pending: 403, practice_suspended: 403, invite_exists: 409, invite_not_found: 404, too_many_requests: 429, too_soon: 429, db_error: 500 };

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const originOk = origin === null || deps.allowedOrigins.includes(origin);
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: headersFor(origin, originOk) });
  const fail = (status: number, error: string) => {
    deps.log({ event: 'patient-invite', status, error });
    return reply(status, { error });
  };

  if (!originOk) return fail(403, 'origin_not_allowed');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin, true) });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
  if (!token) return fail(401, 'unauthenticated');
  let db: UserDb | null = null;
  try { db = await deps.userDb(token); } catch { db = null; }
  if (!db) return fail(401, 'unauthenticated');

  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, 'bad_request'); }
  if (!isObj(body)) return fail(400, 'bad_request');
  const lang = pickLang(body.lang);

  let res: { data: InviteRow | null; error: DbError | null };
  if (body.action === 'create') {
    if (!isObj(body.owner) || !isObj(body.pet)) return fail(400, 'bad_request');
    res = await db.create(body.owner, body.pet);
  } else if (body.action === 'resend') {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return fail(400, 'bad_request');
    res = await db.resend(body.id);
  } else {
    return fail(400, 'bad_request');
  }
  if (res.error || !res.data) {
    const code = res.error ? dbCode(res.error) : 'db_error';
    return fail(STATUS[code] ?? 400, code);
  }

  const inv = res.data;
  let mailed = true;
  try {
    await deps.send(inv.email, buildMail({
      lang, practice: inv.practice_name, owner: inv.owner_name, pet: inv.pet_name, code: inv.code, expiresAt: inv.expires_at,
      link: `${deps.appOrigin}/app/praxiseinladung?code=${encodeURIComponent(inv.code)}`,
    }));
  } catch {
    mailed = false;
  }
  /* Keine Adressen und keine Codes ins Log */
  deps.log({ event: 'patient-invite', status: 200, action: body.action, mailed });
  return reply(200, { invite: { id: inv.invite_id, code: inv.code, email: inv.email, pet_name: inv.pet_name, expires_at: inv.expires_at }, mailed });
}
