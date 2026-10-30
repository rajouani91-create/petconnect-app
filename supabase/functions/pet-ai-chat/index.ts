/* Edge Function „pet-ai-chat“: KI-Assistent für Tierfragen.
   Meldet die Person mit ihrem eigenen Token an, liest Tierdaten ausschließlich über deren Zugriffsrechte (Row Level Security),
   schickt nur die für die Frage nötigen Angaben an den KI-Anbieter und gibt Antwort, Notfall-Kennzeichen und Quellen zurück.
   Secrets (Supabase → Edge Functions → Secrets): AI_API_KEY oder GROQ_API_KEY (Pflicht), AI_BASE_URL, AI_MODEL, AI_VISION_MODEL (optional, Bilder), DOG_API_KEY, CAT_API_KEY, ALLOWED_ORIGINS. */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type Deps, type UserCtx } from './handler.ts';
import type { Extras, HistoryRow, MedRow, PetCore, Topic } from './context.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const PET_COLUMNS = 'name,species,species_other,breed,sex,birth_date,allergies,medications,cat_outdoor,stable,deceased';
const MED_COLUMNS = 'name,amount,unit,frequency,times,intake_hint,note,reason,starts_on,ends_on,stopped_on';

function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticate(token: string): Promise<UserCtx | null> {
  const sb = userClient(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const uid = data.user.id;
  return {
    id: uid,
    async hit() {
      const { data: r, error: e } = await sb.rpc('ai_usage_hit');
      if (e || !r) throw new Error('hit_failed');
      const x = r as { allowed: boolean; reason?: string; day_left?: number };
      return { allowed: x.allowed, reason: x.reason, dayLeft: x.day_left };
    },
    async profileLang() {
      const { data: p } = await sb.from('profiles').select('language').eq('id', uid).maybeSingle();
      return (p as { language?: string } | null)?.language ?? null;
    },
    async loadPet(petId) {
      // RLS: nur Tiere, bei denen die Person Besitzer:in oder Mitglied ist. Sonst kommt nichts zurück.
      const { data: p, error: e } = await sb.from('pets').select(PET_COLUMNS).eq('id', petId).maybeSingle();
      if (e) throw new Error('pet_query_failed');
      return (p as PetCore | null) ?? null;
    },
    async loadExtras(petId, topics: Set<Topic>): Promise<Extras> {
      const q = async <T>(run: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> => {
        const { data: d, error: e } = await run;
        if (e) throw new Error('extras_query_failed');
        return (d ?? []) as T;
      };
      const [meds, vaccinations, weights, vitals, labs, historyRows, docs] = await Promise.all([
        q<MedRow[]>(sb.from('pet_medications').select(MED_COLUMNS).eq('pet_id', petId).order('starts_on', { ascending: false }).limit(30)),
        topics.has('vaccines')
          ? q(sb.from('vaccinations').select('name,given_on,valid_until').eq('pet_id', petId).order('given_on', { ascending: false }).limit(15))
          : Promise.resolve(undefined),
        topics.has('weight')
          ? q(sb.from('weights').select('measured_on,kg').eq('pet_id', petId).order('measured_on', { ascending: false }).limit(6))
          : Promise.resolve(undefined),
        topics.has('vitals')
          ? q(sb.from('vital_values').select('kind,value,context,measured_at').eq('pet_id', petId).order('measured_at', { ascending: false }).limit(15))
          : Promise.resolve(undefined),
        topics.has('labs')
          ? q(sb.from('lab_values').select('measured_on,parameter,value,unit,ref_min,ref_max').eq('pet_id', petId).order('measured_on', { ascending: false }).limit(20))
          : Promise.resolve(undefined),
        topics.has('history')
          ? q<HistoryRow[]>(sb.from('pet_history').select('neutered,housing,past_illness,surgeries,chronic,allergies,past_medication,other').eq('pet_id', petId).limit(1))
          : Promise.resolve(undefined),
        topics.has('docs')
          ? q(sb.from('pet_documents').select('title,category,doc_date').eq('pet_id', petId).order('doc_date', { ascending: false }).limit(15))
          : Promise.resolve(undefined),
      ]);
      return {
        meds,
        vaccinations: vaccinations as Extras['vaccinations'],
        weights: weights as Extras['weights'],
        vitals: vitals as Extras['vitals'],
        labs: labs as Extras['labs'],
        history: historyRows ? (historyRows[0] ?? null) : undefined,
        docs: docs as Extras['docs'],
      };
    },
  };
}

const deps: Deps = {
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ai: {
    apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('GROQ_API_KEY') || undefined,
    baseUrl: Deno.env.get('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1',
    model: Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b',
    // Bildmodell nur, wenn ausdrücklich gesetzt (Secret AI_VISION_MODEL, z. B. qwen/qwen3.8-27b). Ohne: Bilder werden abgelehnt.
    visionModel: Deno.env.get('AI_VISION_MODEL') || undefined,
  },
  breedKeys: { dog: Deno.env.get('DOG_API_KEY') || undefined, cat: Deno.env.get('CAT_API_KEY') || undefined },
  authenticate,
  fetchImpl: fetch,
  now: () => new Date(),
  // Nur Zahlen und Fehlercodes ins Log – niemals Fragen, Antworten oder Tierdaten.
  log: (entry) => console.log(JSON.stringify(entry)),
};

Deno.serve((req) => handle(req, deps));
