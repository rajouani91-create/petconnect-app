/* Edge Function „patient-invite“: Praxis nimmt einen Patienten auf; die Halter:in bekommt eine Einladung per E-Mail (Brevo).
   Die angemeldete Person ruft die Datenbankfunktionen mit ihrem eigenen Token auf (Rechte prüft die Datenbank).
   Secrets: SUPABASE_URL, SUPABASE_ANON_KEY (stellt Supabase bereit), BREVO_API_KEY (wie bei auth-mail),
   MAIL_FROM, MAIL_FROM_NAME, APP_ORIGIN, ALLOWED_ORIGINS (alle optional). */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type Deps, type InviteRow } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BREVO_KEY = (Deno.env.get('BREVO_API_KEY') ?? '').trim();
const FROM = Deno.env.get('MAIL_FROM') ?? 'hello@petconnect24.com';
const FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'PetConnect24';
const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') ?? 'https://petconnect24.com').replace(/\/+$/, '');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const deps: Deps = {
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean),
  appOrigin: APP_ORIGIN,
  log: (entry) => console.log(JSON.stringify(entry)),
  async userDb(token) {
    const sb = createClient(SUPABASE_URL, ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    const one = (rows: unknown) => ((rows as InviteRow[] | null)?.[0] ?? null);
    return {
      async create(owner, pet) {
        const r = await sb.rpc('practice_create_patient_invite', { p_owner: owner, p_pet: pet });
        return { data: one(r.data), error: r.error };
      },
      async resend(id) {
        const r = await sb.rpc('practice_resend_patient_invite', { p_id: id });
        return { data: one(r.data), error: r.error };
      },
    };
  },
  async send(to, mail) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM }, to: [{ email: to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text }),
    });
    if (!r.ok) {
      console.error('brevo', r.status, (await r.text().catch(() => '')).slice(0, 300));
      throw new Error('brevo');
    }
  },
};

Deno.serve((req) => handle(req, deps));
