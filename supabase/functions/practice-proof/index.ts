/* Edge Function „practice-proof“: Fachtierarzt-Urkunde vorlesen (read) und Entscheidung des Admins umsetzen (decide).
   Text-PDFs werden ohne KI-Dienst im Code geprüft. Fotos/Scans nur mit Bildmodell (Secrets wie beim KI-Assistenten:
   AI_API_KEY oder GROQ_API_KEY, AI_BASE_URL, AI_VISION_MODEL); ohne Bildmodell prüft der Betreiber selbst.
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY stellt Supabase bereit. ALLOWED_ORIGINS optional. */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.9.1';
import { handle, type Deps, type ProofRow } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_KEY = Deno.env.get('AI_API_KEY') || Deno.env.get('GROQ_API_KEY') || '';
const AI_BASE = (Deno.env.get('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const VISION_MODEL = Deno.env.get('AI_VISION_MODEL') || '';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, opts);
const BUCKET = 'practice-proofs';

const deps: Deps = {
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean),
  log: (entry) => console.log(JSON.stringify(entry)),
  async userDb(token) {
    const sb = createClient(SUPABASE_URL, ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      async proofForRead(id) {
        const r = await sb.rpc('practice_proof_for_read', { p_id: id });
        return { data: ((r.data as ProofRow[] | null)?.[0] ?? null), error: r.error };
      },
      async decide(id, approve, reason) {
        const r = await sb.rpc('staff_decide_proof', { p_id: id, approve, reason });
        return { data: (r.data as string | null) ?? null, error: r.error };
      },
    };
  },
  admin: {
    async download(path) {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) throw error ?? new Error('download');
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(path) {
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    },
    async setReading(id, status, reading) {
      const { error } = await admin.rpc('practice_proof_set_reading', { p_id: id, p_status: status, p_reading: reading });
      if (error) throw error;
    },
    async fileDeleted(id) {
      const { error } = await admin.rpc('practice_proof_file_deleted', { p_id: id });
      if (error) throw error;
    },
  },
  async pdfText(bytes) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  },
  vision: AI_KEY && VISION_MODEL
    ? async (prompt, dataUrl) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try {
          const r = await fetch(`${AI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${AI_KEY}` },
            body: JSON.stringify({
              model: VISION_MODEL,
              temperature: 0,
              max_completion_tokens: 300,
              messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
            }),
            signal: ctrl.signal,
          });
          if (!r.ok) throw new Error(`vision ${r.status}`);
          const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
          return j.choices?.[0]?.message?.content ?? '';
        } finally {
          clearTimeout(timer);
        }
      }
    : null,
};

Deno.serve((req) => handle(req, deps));
