/* Logik der Edge Function „practice-invite“: Praxisleitung lädt Mitarbeitende ein, sendet erneut oder zieht zurück.
   Rechte prüft die Datenbank (Funktionen practice_*_invite, nur Praxisleitung). Diese Datei verbindet das mit dem
   Einladungsversand von Supabase Auth. Netzwerk kommt von außen (deps), damit alles ohne Server testbar ist. */

export type Action = 'invite' | 'resend' | 'revoke';
export const LANGS = ['de', 'en', 'fr', 'es', 'nl', 'no', 'sv', 'da', 'tr', 'ru', 'ar'] as const;

export interface InviteRow { invite_id: string; email: string; name: string; role: string; practice_name: string }
export interface DbError { code?: string; message?: string }

/** Aufrufe im Namen der angemeldeten Person (Rechte prüft die Datenbank). */
export interface UserDb {
  createInvite(email: string, name: string, role: string): Promise<{ data: InviteRow | null; error: DbError | null }>;
  resendInvite(id: string): Promise<{ data: InviteRow | null; error: DbError | null }>;
  revokeInvite(id: string): Promise<{ data: string | null; error: DbError | null }>;
}
/** Aufrufe mit der Service-Rolle. */
export interface AdminApi {
  inviteUser(email: string, meta: Record<string, string>, redirectTo: string): Promise<{ error: DbError | null }>;
  orphanUser(email: string): Promise<string | null>;
  deleteUser(id: string): Promise<void>;
}
export interface Deps {
  userDb(token: string): Promise<UserDb | null>;
  admin: AdminApi;
  allowedOrigins: string[];
  redirectTo: string;
  log(entry: Record<string, unknown>): void;
}

const ROLES = ['lead', 'vet', 'team'];
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

/** Fehler aus der Datenbank → kurzer Code für die App (Meldungstext der Funktion, z. B. 'invite_exists'). */
export function dbCode(e: DbError): string {
  const m = (e.message ?? '').trim();
  return /^[a-z_]+$/.test(m) ? m : e.code === '42501' ? 'forbidden' : 'db_error';
}

/** Supabase meldet ein bereits bestätigtes Konto als Fehler; das ist kein Versandproblem. */
function isExistingAccount(e: DbError): boolean {
  return e.code === 'email_exists' || /already been registered/i.test(e.message ?? '');
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const originOk = origin === null || deps.allowedOrigins.includes(origin);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: headersFor(origin, originOk) });
  const fail = (status: number, error: string) => {
    deps.log({ event: 'practice-invite', status, error });
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
  const action = body.action as Action;
  const lang = typeof body.language === 'string' && (LANGS as readonly string[]).includes(body.language) ? body.language : 'de';

  const send = async (row: InviteRow) =>
    deps.admin.inviteUser(row.email, { account_type: 'practice', display_name: row.name, language: lang, practice_name: row.practice_name }, deps.redirectTo);

  if (action === 'invite') {
    const email = typeof body.email === 'string' ? body.email : '';
    const name = typeof body.name === 'string' ? body.name : '';
    const role = typeof body.role === 'string' && ROLES.includes(body.role) ? body.role : '';
    if (!email || !name || !role) return fail(400, 'bad_request');
    const { data, error } = await db.createInvite(email, name, role);
    if (error || !data) return fail(error?.code === '42501' ? 403 : 400, error ? dbCode(error) : 'db_error');
    const sent = await send(data);
    if (sent.error) {
      // Einladung ohne Mail nicht offen stehen lassen
      await db.revokeInvite(data.invite_id);
      return fail(isExistingAccount(sent.error) ? 409 : 502, isExistingAccount(sent.error) ? 'account_exists' : 'mail_failed');
    }
    deps.log({ event: 'practice-invite', status: 200, action });
    return reply(200, { ok: true, invite_id: data.invite_id });
  }

  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : '';
  if (!id) return fail(400, 'bad_request');

  if (action === 'resend') {
    const { data, error } = await db.resendInvite(id);
    if (error || !data) return fail(error?.code === '42501' ? 403 : 400, error ? dbCode(error) : 'db_error');
    const sent = await send(data);
    // Bereits bestätigt, aber noch nicht angenommen: Die Person meldet sich an (oder setzt das Passwort zurück).
    if (sent.error) return fail(isExistingAccount(sent.error) ? 409 : 502, isExistingAccount(sent.error) ? 'already_confirmed' : 'mail_failed');
    deps.log({ event: 'practice-invite', status: 200, action });
    return reply(200, { ok: true });
  }

  if (action === 'revoke') {
    const { data, error } = await db.revokeInvite(id);
    if (error || !data) return fail(error?.code === '42501' ? 403 : 400, error ? dbCode(error) : 'db_error');
    // Nie benutztes Konto der eingeladenen Adresse aufräumen (die Datenbank prüft, dass es wirklich unbenutzt ist).
    try {
      const orphan = await deps.admin.orphanUser(data);
      if (orphan) await deps.admin.deleteUser(orphan);
    } catch {
      deps.log({ event: 'practice-invite', action, cleanup: 'failed' });
    }
    deps.log({ event: 'practice-invite', status: 200, action });
    return reply(200, { ok: true });
  }

  return fail(400, 'bad_request');
}
