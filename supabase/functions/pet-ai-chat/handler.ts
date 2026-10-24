/* Ablauf der Anfrage. Alle Abhängigkeiten (Anmeldung, Datenbank, KI-Anbieter, Uhr) werden hineingereicht, damit der Ablauf
   ohne Netzwerk testbar ist. Die echte Verdrahtung steht in index.ts. */
import { MAX_BODY_BYTES, cleanReply, cleanText, detectEmergency, isUuid, validateMessages } from './safety.ts';
import { buildPetContext, selectTopics, type Extras, type PetCore, type Topic } from './context.ts';
import { buildSystemPrompt, REMINDER, SUPPORTED_LANGS } from './prompt.ts';
import { fetchBreed } from './breed.ts';
import { chat, ProviderFailure, type ProviderMessage } from './provider.ts';

export interface UserCtx {
  id: string;
  hit(): Promise<{ allowed: boolean; reason?: string; dayLeft?: number }>;
  profileLang(): Promise<string | null>;
  loadPet(petId: string): Promise<PetCore | null>;
  loadExtras(petId: string, topics: Set<Topic>): Promise<Extras>;
}

export interface Deps {
  allowedOrigins: string[];
  ai: { apiKey?: string; baseUrl: string; model: string; maxOutputTokens?: number };
  breedKeys: { dog?: string; cat?: string };
  authenticate(token: string): Promise<UserCtx | null>;
  fetchImpl: typeof fetch;
  now(): Date;
  log(entry: Record<string, unknown>): void;
}

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

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const started = Date.now();
  const origin = req.headers.get('origin');
  const originOk = origin === null || deps.allowedOrigins.includes(origin);
  const reply = (status: number, body: Record<string, unknown>): Response =>
    new Response(JSON.stringify(body), { status, headers: headersFor(origin, originOk) });
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Response => {
    deps.log({ event: 'chat', status, error, ms: Date.now() - started });
    return reply(status, { error, ...extra });
  };

  if (!originOk) return fail(403, 'origin_not_allowed');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin, true) });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const auth = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (!token) return fail(401, 'unauthenticated');

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail(413, 'payload_too_large');

  let user: UserCtx | null = null;
  try {
    user = await deps.authenticate(token);
  } catch {
    user = null;
  }
  if (!user) return fail(401, 'unauthenticated');

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'payload_too_large');
  let body: { messages?: unknown; petId?: unknown; lang?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return fail(400, 'invalid_body');
  }
  if (typeof body !== 'object' || body === null) return fail(400, 'invalid_body');
  const checked = validateMessages(body.messages);
  if (!checked.ok) return fail(400, checked.error);
  const petId = body.petId === undefined || body.petId === null ? null : body.petId;
  if (petId !== null && !isUuid(petId)) return fail(400, 'invalid_pet');

  if (!deps.ai.apiKey) return fail(503, 'not_configured');

  let limit: Awaited<ReturnType<UserCtx['hit']>>;
  try {
    limit = await user.hit();
  } catch {
    return fail(500, 'internal');
  }
  if (!limit.allowed) return fail(429, 'rate_limit', { reason: limit.reason ?? 'day' });

  const messages = checked.messages;
  const lastUser = messages[messages.length - 1]!.content;
  const emergencyWords = detectEmergency(lastUser);
  const topics = selectTopics(lastUser, emergencyWords);

  let petContext: string | null = null;
  let used: string[] = [];
  let species: string | null = null;
  let breed = { status: 'none' as 'none' | 'ok' | 'not_found' | 'unavailable', facts: null as Awaited<ReturnType<typeof fetchBreed>>['facts'] };
  if (petId !== null) {
    let pet: PetCore | null;
    try {
      pet = await user.loadPet(petId);
    } catch {
      return fail(500, 'data_unavailable');
    }
    // Kein Zugriff und „gibt es nicht“ sehen von außen gleich aus.
    if (!pet) return fail(404, 'pet_not_found');
    let extras: Extras;
    try {
      extras = await user.loadExtras(petId, topics);
    } catch {
      return fail(500, 'data_unavailable');
    }
    const built = buildPetContext(pet, extras, topics, deps.now());
    petContext = built.text;
    used = built.used;
    species = pet.species;
    const b = await fetchBreed(pet.species, pet.breed, { dogKey: deps.breedKeys.dog, catKey: deps.breedKeys.cat, fetchImpl: deps.fetchImpl });
    breed = b;
    if (b.status === 'ok') used.push('breed_database');
  }

  let lang = typeof body.lang === 'string' && SUPPORTED_LANGS.includes(body.lang) ? body.lang : null;
  if (!lang) {
    try {
      const p = await user.profileLang();
      lang = p && SUPPORTED_LANGS.includes(p) ? p : 'de';
    } catch {
      lang = 'de';
    }
  }

  const system = buildSystemPrompt({ lang, petContext, species, breed: breed.facts, breedStatus: breed.status, emergencyHint: emergencyWords });
  const history = messages.slice(0, -1);
  const providerMessages: ProviderMessage[] = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'system', content: REMINDER },
    { role: 'user', content: cleanText(lastUser) },
  ];

  let result;
  try {
    result = await chat(
      { apiKey: deps.ai.apiKey, baseUrl: deps.ai.baseUrl, model: deps.ai.model, maxOutputTokens: deps.ai.maxOutputTokens ?? 1200, timeoutMs: 40_000 },
      providerMessages,
      deps.fetchImpl,
    );
  } catch (e) {
    const code = e instanceof ProviderFailure ? e.code : 'provider_error';
    if (code === 'provider_rate') return fail(503, 'ai_busy');
    if (code === 'provider_auth') return fail(502, 'ai_misconfigured');
    return fail(502, 'ai_unavailable');
  }

  const cleaned = cleanReply(result.text);
  if (!cleaned) return fail(502, 'ai_unavailable');

  const sources = breed.status === 'ok' && species ? [{ title: species === 'dog' ? 'The Dog API' : 'The Cat API', url: species === 'dog' ? 'https://thedogapi.com' : 'https://thecatapi.com' }] : [];
  deps.log({
    event: 'chat', status: 200, ms: Date.now() - started, promptTokens: result.promptTokens, completionTokens: result.completionTokens,
    hasPet: petId !== null, topics: topics.size, emergency: cleaned.emergency || emergencyWords,
  });
  return reply(200, {
    reply: cleaned.text,
    emergency: cleaned.emergency || emergencyWords,
    sources,
    used,
    breedStatus: breed.status,
    dayLeft: limit.dayLeft ?? null,
  });
}
