/* Logik des Send-Email-Hooks von Supabase Auth: Signatur prüfen, Sprache aus dem Konto lesen, Mail bauen, über den Versanddienst senden.
   Netzwerk und Signaturprüfung kommen von außen (deps), damit alles ohne Server testbar ist. */
import { buildMail, cleanName, pickLang, type Mail } from './build.ts';
import { KINDS, type MailKind } from './mailTexts.ts';

export interface HookPayload {
  user: { email?: string; user_metadata?: { language?: unknown; display_name?: unknown } | null };
  email_data: { token_hash?: string; redirect_to?: string; email_action_type?: string };
}
export interface Deps {
  verify(body: string, headers: Record<string, string>): HookPayload;
  send(to: string, mail: Mail): Promise<void>;
  supabaseUrl: string;
}
export interface HookResult { status: number; body: unknown }

const fail = (status: number, message: string): HookResult => ({ status, body: { error: { http_code: status, message } } });

export function verifyUrl(base: string, tokenHash: string, kind: MailKind, redirectTo?: string): string {
  const u = `${base.replace(/\/+$/, '')}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${kind}`;
  return redirectTo ? `${u}&redirect_to=${encodeURIComponent(redirectTo)}` : u;
}

export async function handleHook(body: string, headers: Record<string, string>, deps: Deps): Promise<HookResult> {
  let payload: HookPayload;
  try {
    payload = deps.verify(body, headers);
  } catch {
    return fail(401, 'Signatur ungültig');
  }
  const kind = payload.email_data?.email_action_type as MailKind | undefined;
  if (!kind || !KINDS.includes(kind)) return fail(400, `Mailart nicht unterstützt: ${String(kind)}`);
  const to = payload.user?.email;
  const hash = payload.email_data?.token_hash;
  if (!to || !hash) return fail(400, 'Empfänger oder Token fehlt');
  const meta = payload.user.user_metadata ?? {};
  const mail = buildMail({
    lang: pickLang(meta.language),
    kind,
    link: verifyUrl(deps.supabaseUrl, hash, kind, payload.email_data.redirect_to),
    name: cleanName(meta.display_name),
  });
  try {
    await deps.send(to, mail);
  } catch {
    return fail(502, 'Mailversand fehlgeschlagen');
  }
  return { status: 200, body: {} };
}
