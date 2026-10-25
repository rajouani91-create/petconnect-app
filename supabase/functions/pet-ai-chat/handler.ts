/* Ablauf der Anfrage. Alle Abhängigkeiten (Anmeldung, Datenbank, KI-Anbieter, Uhr) werden hineingereicht, damit der Ablauf
   ohne Netzwerk testbar ist. Die echte Verdrahtung steht in index.ts. */
import type { Attachment } from './safety.ts';
import { MAX_ATTACH_BODY_BYTES, MAX_BODY_BYTES, cleanReply, cleanText, detectEmergency, isUuid, validateAttachment, validateMessages } from './safety.ts';
import { hardPiiKinds } from './pii.ts';
import { buildPetContext, selectTopics, type Extras, type PetCore, type Topic } from './context.ts';
import { buildSystemPrompt, REMINDER, SUPPORTED_LANGS } from './prompt.ts';
import { fetchBreed } from './breed.ts';
import { chat, ProviderFailure, type ContentPart, type ProviderMessage } from './provider.ts';

export interface UserCtx {
  id: string;
  hit(): Promise<{ allowed: boolean; reason?: string; dayLeft?: number }>;
  profileLang(): Promise<string | null>;
  loadPet(petId: string): Promise<PetCore | null>;
  loadExtras(petId: string, topics: Set<Topic>): Promise<Extras>;
}

export interface Deps {
  allowedOrigins: string[];
  ai: { apiKey?: string; baseUrl: string; model: string; visionModel?: string; maxOutputTokens?: number };
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

function userContent(question: string, attachment: Attachment | null): string | ContentPart[] {
  if (!attachment) return question;
  if (attachment.kind === 'text') return `${question}\n\n<document>\n${attachment.text.replace(/<\/?document>/gi, '')}\n</document>`;
  return [
    { type: 'text', text: question },
    { type: 'image_url', image_url: { url: `data:${attachment.mime};base64,${attachment.data}` } },
  ];
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
  if (declared > MAX_ATTACH_BODY_BYTES) return fail(413, 'payload_too_large');

  let user: UserCtx | null = null;
  try {
    user = await deps.authenticate(token);
  } catch {
    user = null;
  }
  if (!user) return fail(401, 'unauthenticated');

  const raw = await req.text();
  if (raw.length > MAX_ATTACH_BODY_BYTES) return fail(413, 'payload_too_large');
  let body: { messages?: unknown; petId?: unknown; lang?: unknown; attachment?: unknown; consent?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return fail(400, 'invalid_body');
  }
  if (typeof body !== 'object' || body === null) return fail(400, 'invalid_body');
  const checked = validateMessages(body.messages);
  if (!checked.ok) return fail(400, checked.error);
  // Große Anfragen sind nur mit Anhang erlaubt
  if (raw.length > MAX_BODY_BYTES && (body.attachment === undefined || body.attachment === null)) return fail(413, 'payload_too_large');
  const att = validateAttachment(body.attachment, body.consent);
  if (!att.ok) return fail(att.error === 'consent_required' ? 403 : 400, att.error);
  const attachment = att.attachment;
  if (attachment?.kind === 'text') {
    // Zweite Kontrolle auf dem Server: eindeutige persönliche Angaben (E-Mail, Telefon, IBAN, Chip-Nr., Links) dürfen nicht mehr enthalten sein
    const kinds = hardPiiKinds(attachment.text);
    if (kinds.length > 0) return fail(422, 'pii_detected', { kinds });
  }
  if (attachment?.kind === 'image' && !deps.ai.visionModel) return fail(503, 'vision_not_configured');
  const petId = body.petId === undefined || body.petId === null ? null : body.petId;
  if (petId !== null && !isUuid(petId)) return fail(400, 'invalid_pet');

  if (!deps.ai.apiKey) return fail(503, 'not_configured');

  // Bilder sind teurer: sie zählen dreifach gegen das Limit
  const cost = attachment?.kind === 'image' ? 3 : 1;
  let limit: Awaited<ReturnType<UserCtx['hit']>> = { allowed: true };
  try {
    for (let i = 0; i < cost && limit.allowed; i++) limit = await user.hit();
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

  const system = buildSystemPrompt({ lang, petContext, species, breed: breed.facts, breedStatus: breed.status, emergencyHint: emergencyWords, attachment: attachment?.kind ?? null });
  const history = messages.slice(0, -1);
  const providerMessages: ProviderMessage[] = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'system', content: REMINDER },
    { role: 'user', content: userContent(cleanText(lastUser), attachment) },
  ];

  let result;
  try {
    result = await chat(
      { apiKey: deps.ai.apiKey, baseUrl: deps.ai.baseUrl, model: attachment?.kind === 'image' ? deps.ai.visionModel! : deps.ai.model, maxOutputTokens: deps.ai.maxOutputTokens ?? 1200, timeoutMs: 40_000 },
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
    used: attachment ? [...used, attachment.kind === 'image' ? 'attachment_image' : 'attachment_text'] : used,
    breedStatus: breed.status,
    dayLeft: limit.dayLeft ?? null,
  });
}
