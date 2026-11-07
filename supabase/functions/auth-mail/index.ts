/* Edge Function „auth-mail“: Send-Email-Hook von Supabase Auth.
   Schickt Registrierungs-, Passwort-, Anmelde- und Einladungs-Mails in der Sprache des Kontos über Brevo.
   Einrichtung: Supabase → Authentication → Hooks → Send Email → diese Funktion wählen (Secret wird dort erzeugt).
   Secrets (Supabase → Edge Functions → Secrets): SEND_EMAIL_HOOK_SECRET (Pflicht, Format v1,whsec_…), BREVO_API_KEY (Pflicht),
   MAIL_FROM (optional, Standard hello@petconnect24.com), MAIL_FROM_NAME (optional, Standard PetConnect24). */
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { handleHook, type HookPayload } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const HOOK_SECRET = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
const BREVO_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const FROM = Deno.env.get('MAIL_FROM') ?? 'hello@petconnect24.com';
const FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'PetConnect24';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.text();
  const headers = Object.fromEntries(req.headers);
  const res = await handleHook(body, headers, {
    supabaseUrl: SUPABASE_URL,
    verify: (b, h) => new Webhook(HOOK_SECRET).verify(b, h) as HookPayload,
    send: async (to, mail) => {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM }, to: [{ email: to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text }),
      });
      if (!r.ok) {
        console.error('brevo', r.status);
        throw new Error('brevo');
      }
    },
  });
  return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'content-type': 'application/json' } });
});
