/* Welche Tierdaten braucht die Frage? Und wie werden sie kompakt als Text an die KI gegeben? Reine Funktionen (testbar). */

export type Topic = 'meds' | 'vaccines' | 'weight' | 'labs' | 'history' | 'docs';

/* Stichwörter in den App-Sprachen. Erkennt nichts → es gehen nur Kerndaten raus (Name, Tierart, Rasse, Alter, Allergien, Medikamentennamen). */
const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  meds: /medik|tablette|dosi|dosis|wurmkur|schmerzmittel|antibiot|tropfen|salbe|medicat|medicin|\bmeds?\b|\bdrugs?\b|\bdose|\bpills?\b|m[ée]dicament|medicamento|ila[cç]|лекарств|دواء|medicijn|läkemedel|medisin/i,
  vaccines: /impf|vaccin|vacun|aşı|прививк|لقاح|booster|titer|tollwut|rabies|staupe|parvo|katzenschnupfen|seuche/i,
  weight: /gewicht|abnehm|zunehm|übergewicht|zu dick|diät|weight|overweight|obes|diet\b|poids|peso\b|kilo|вес\b|وزن|vikt|vægt|vekt|füttern|futter|ernähr|food|feed|nutrition|alimentation|dieta|mama\b|корм|питани/i,
  labs: /labor|blutwert|blutbild|nierenwert|leberwert|blood (test|work|value)|\blab\b|bilan|analítica|kreatinin|creatinin|bloedwaarde|кровь|анализ/i,
  history: /vorerkrank|erkrank|krank|symptom|durchfall|erbrech|husten|humpel|lahm|juck|schmerz|operation|\bop\b|kastr|chronisch|allerg|illness|sick|vomit|diarrh|cough|limp|itch|pain|surgery|neuter|chronic|malad|enfermedad|hastal|болезн|مرض|sjuk|\bsyg|\bsyk|ziek|appetit|trink|urin|kot\b|stool/i,
  docs: /dokument|befund|diagnos|arztbrief|bericht|document|report|diagnosis|rapport|informe|rapor/i,
};

export function selectTopics(text: string, emergency = false): Set<Topic> {
  const out = new Set<Topic>();
  for (const [topic, re] of Object.entries(TOPIC_PATTERNS) as [Topic, RegExp][]) if (re.test(text)) out.add(topic);
  if (emergency) {
    out.add('history');
    out.add('meds');
  }
  // Medikamente und Vorgeschichte hängen medizinisch zusammen (Wechselwirkungen, chronische Leiden)
  if (out.has('meds')) out.add('history');
  return out;
}

/* ---- Datenformen (entsprechen den abgefragten Spalten) ---- */
export interface PetCore {
  name: string;
  species: string;
  species_other: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  allergies: string | null;
  medications: string | null;
  cat_outdoor: boolean | null;
  stable: string | null;
  deceased: boolean | null;
}
export interface MedRow {
  name: string;
  amount: number | null;
  unit: string | null;
  frequency: string | null;
  times: string[] | null;
  intake_hint: string | null;
  note: string | null;
  reason: string | null;
  prescribed_by?: string | null; // wird bewusst nicht mehr abgefragt und nie an die KI gegeben
  starts_on: string | null;
  ends_on: string | null;
  stopped_on: string | null;
}
export interface VaccRow { name: string; given_on: string | null; valid_until: string | null }
export interface WeightRow { measured_on: string; kg: number }
export interface LabRow { measured_on: string; parameter: string; value: number; unit: string | null; ref_min: number | null; ref_max: number | null }
export interface HistoryRow {
  neutered: string | null; housing: string | null; past_illness: string | null; surgeries: string | null;
  chronic: string | null; allergies: string | null; past_medication: string | null; other: string | null;
}
export interface DocRow { title: string; category: string | null; doc_date: string | null }

export interface Extras {
  meds: MedRow[];            // laufende Medikamente (immer geladen, Details nur bei Thema „meds“)
  vaccinations?: VaccRow[];
  weights?: WeightRow[];
  labs?: LabRow[];
  history?: HistoryRow | null;
  docs?: DocRow[];
}

/** Freitext aus der Datenbank: kürzen, Zeilenumbrüche und spitze Klammern entfernen (kein Ausbrechen aus dem Datenblock). */
export function flat(v: unknown, max = 300): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function ageText(birth: string | null, now: Date): string | null {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  let months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + (now.getUTCMonth() - b.getUTCMonth());
  if (now.getUTCDate() < b.getUTCDate()) months -= 1;
  if (months < 0) return null;
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years ${months % 12} months`;
}

export function isActive(m: MedRow, todayIso: string): boolean {
  if (m.stopped_on && m.stopped_on < todayIso) return false;
  if (m.ends_on && m.ends_on < todayIso) return false;
  return true;
}

export interface BuiltContext {
  text: string;
  /** Welche Angaben wurden an die KI übergeben (für die Anzeige „Verwendete Angaben“). Nur Gruppen, keine Inhalte. */
  used: string[];
}

export function buildPetContext(pet: PetCore, extras: Extras, topics: Set<Topic>, now: Date): BuiltContext {
  const today = now.toISOString().slice(0, 10);
  const used: string[] = ['profile'];
  const lines: string[] = [];
  const species = pet.species === 'other' && pet.species_other ? `other (${flat(pet.species_other, 40)})` : pet.species;
  lines.push(`name: ${flat(pet.name, 60)}`);
  lines.push(`species: ${species}`);
  lines.push(`breed: ${pet.breed ? flat(pet.breed, 60) : 'not documented'}`);
  lines.push(`sex: ${pet.sex ?? 'not documented'}`);
  const age = ageText(pet.birth_date, now);
  lines.push(`age: ${age ?? 'not documented'}`);
  if (pet.deceased) lines.push('status: the pet is marked as deceased in the profile');
  if (pet.species === 'cat' && pet.cat_outdoor !== null) lines.push(`outdoor access: ${pet.cat_outdoor ? 'yes' : 'no'}`);
  if (pet.species === 'horse' && pet.stable) lines.push(`stabling: ${flat(pet.stable, 80)}`);
  lines.push(`allergies (free text): ${pet.allergies ? flat(pet.allergies) : 'none documented'}`);
  used.push('allergies');

  const active = extras.meds.filter((m) => isActive(m, today));
  if (active.length === 0) {
    lines.push('current medication: none documented');
  } else if (topics.has('meds')) {
    lines.push('current medication (documented by the owner, not verified by a vet):');
    for (const m of active.slice(0, 12)) {
      const parts = [
        flat(m.name, 80),
        m.amount !== null ? `${m.amount} ${m.unit ?? ''}`.trim() : null,
        m.frequency === 'as_needed' ? 'as needed' : m.times && m.times.length ? `daily at ${m.times.map((t) => t.slice(0, 5)).join(', ')}` : null,
        m.intake_hint && m.intake_hint !== 'none' ? m.intake_hint.replace('_', ' ') : null,
        m.reason ? `reason: ${flat(m.reason, 80)}` : null,
        m.note ? `note: ${flat(m.note, 100)}` : null,
        m.ends_on ? `until ${m.ends_on}` : 'ongoing',
      ].filter(Boolean);
      lines.push(`- ${parts.join(' | ')}`);
    }
    if (pet.medications) lines.push(`further medication notes (free text): ${flat(pet.medications)}`);
    used.push('medication');
  } else {
    lines.push(`current medication (names only): ${active.slice(0, 12).map((m) => flat(m.name, 60)).join(', ')}`);
    used.push('medication_names');
  }

  if (topics.has('vaccines')) {
    const v = extras.vaccinations ?? [];
    lines.push(v.length ? 'vaccinations:' : 'vaccinations: none documented');
    for (const x of v.slice(0, 15)) lines.push(`- ${flat(x.name, 60)} | given ${x.given_on ?? '?'} | valid until ${x.valid_until ?? 'not documented'}`);
    used.push('vaccinations');
  }
  if (topics.has('weight')) {
    const w = extras.weights ?? [];
    lines.push(w.length ? 'weight history (newest first):' : 'weight: none documented');
    for (const x of w.slice(0, 6)) lines.push(`- ${x.measured_on}: ${x.kg} kg`);
    used.push('weight');
  }
  if (topics.has('labs')) {
    const l = extras.labs ?? [];
    lines.push(l.length ? 'lab values (newest first; the owner entered these, reference ranges as entered):' : 'lab values: none documented');
    for (const x of l.slice(0, 20)) {
      const range = x.ref_min !== null || x.ref_max !== null ? ` (ref ${x.ref_min ?? '?'}–${x.ref_max ?? '?'})` : '';
      lines.push(`- ${x.measured_on} ${flat(x.parameter, 40)}: ${x.value} ${flat(x.unit, 20)}${range}`);
    }
    used.push('labs');
  }
  if (topics.has('history')) {
    const h = extras.history;
    if (!h) {
      lines.push('medical history: none documented');
    } else {
      lines.push('medical history (free text entered by the owner):');
      const entries: [string, string | null][] = [
        ['neutered', h.neutered], ['housing', h.housing], ['past illnesses', h.past_illness], ['surgeries', h.surgeries],
        ['chronic conditions', h.chronic], ['allergies', h.allergies], ['past medication', h.past_medication], ['other', h.other],
      ];
      for (const [k, v] of entries) if (v) lines.push(`- ${k}: ${flat(v)}`);
    }
    used.push('history');
  }
  if (topics.has('docs')) {
    const d = extras.docs ?? [];
    lines.push(
      d.length
        ? 'uploaded documents (only title, category and date are visible to you; you cannot read the content):'
        : 'uploaded documents: none',
    );
    for (const x of d.slice(0, 15)) lines.push(`- ${flat(x.title, 80)} | ${flat(x.category, 30)} | ${x.doc_date ?? '?'}`);
    used.push('documents');
  }
  return { text: lines.join('\n'), used };
}
