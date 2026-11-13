/* Edge Function „practice-invite“: Mitarbeitende einer Praxis per E-Mail einladen, Einladung erneut senden oder zurückziehen.
   Die angemeldete Person ruft die Datenbankfunktionen mit ihrem eigenen Token auf (nur Praxisleitung darf das);
   der Versand nutzt die Einladungs-Mail von Supabase Auth (Text und Sprache über den Hook „auth-mail“).
   Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (stellt Supabase bereit),
   APP_ORIGIN (optional, Standard https://petconnect24.com), ALLOWED_ORIGINS (optional). */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type Deps, type InviteRow } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') ?? 'https://petconnect24.com').replace(/\/+$/, '');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, opts);

const deps: Deps = {
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean),
  redirectTo: `${APP_ORIGIN}/app/praxis/einladung`,
  log: (entry) => console.log(JSON.stringify(entry)),
  async userDb(token) {
    const sb = createClient(SUPABASE_URL, ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    const one = (rows: unknown) => ((rows as InviteRow[] | null)?.[0] ?? null);
    return {
      async createInvite(email, name, role) {
        const r = await sb.rpc('practice_create_invite', { p_email: email, p_name: name, p_role: role });
        return { data: one(r.data), error: r.error };
      },
      async resendInvite(id) {
        const r = await sb.rpc('practice_resend_invite', { p_id: id });
        return { data: one(r.data), error: r.error };
      },
      async revokeInvite(id) {
        const r = await sb.rpc('practice_revoke_invite', { p_id: id });
        return { data: (r.data as string | null) ?? null, error: r.error };
      },
    };
  },
  admin: {
    async inviteUser(email, meta, redirectTo) {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo });
      return { error: error ? { code: (error as { code?: string }).code, message: error.message } : null };
    },
    async orphanUser(email) {
      const { data, error } = await admin.rpc('practice_invite_orphan', { p_email: email });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
  },
};

Deno.serve((req) => handle(req, deps));
