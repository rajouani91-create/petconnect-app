// Notfallkarte, Versicherung, Betreuung: reine Hilfsfunktionen (ohne Supabase und React), damit sie testbar sind.
import type { MessageKey } from '../i18n';
import { daysBetween, isIsoDate } from './record';

// ---------- Geld ----------

export const MONEY_MAX_EXCLUSIVE = 100_000;

/** „1.234,50 €“ (Locale-abhängig, immer Euro) */
export function formatEuro(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

export type MoneyResult = { ok: true; value: number } | { ok: false; error: 'required' | 'format' | 'range' };

/**
 * Betrag lesen: „1.234,50“, „1234,5“, „1234.50“, „12 €“. Höchstens 2 Nachkommastellen.
 * `allowZero`: Selbstbeteiligung darf 0 sein, Rechnungsbeträge nicht.
 */
export function parseMoney(input: string, allowZero = false): MoneyResult {
  let s = input.replace(/€|\s/g, '');
  if (!s) return { ok: false, error: 'required' };
  if (s.includes(',') && s.includes('.')) {
    // 1.234,50 → Punkt ist Tausendertrenner
    if (!/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) return { ok: false, error: 'format' };
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // 1.234 ohne Nachkommastellen
  } else {
    s = s.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'format' };
  const value = Math.round(Number(s) * 100) / 100;
  if (!Number.isFinite(value) || value >= MONEY_MAX_EXCLUSIVE || value < 0 || (!allowZero && value === 0)) return { ok: false, error: 'range' };
  return { ok: true, value };
}

export const MONEY_ERROR: Record<Exclude<MoneyResult, { ok: true }>['error'], MessageKey> = {
  required: 'insErrAmount',
  format: 'insErrMoney',
  range: 'insErrRange',
};

/** Zahl für ein Eingabefeld: 1234.5 → „1234,50“ (de) */
export function moneyInput(v: number | null, locale: string): string {
  if (v === null) return '';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(v);
}

/** Unverbindliche Schätzung der Erstattung: Betrag × Quote, ohne Selbstbeteiligung, auf Cent gerundet */
export function estimateReimbursement(amount: number, pct: number | null): number | null {
  if (pct === null || !Number.isFinite(amount)) return null;
  return Math.round(amount * pct) / 100;
}

// ---------- Versicherung ----------

export const SUBMISSIONS = ['portal', 'email', 'post', 'app', 'other'] as const;
export type Submission = (typeof SUBMISSIONS)[number];
export const SUBMISSION_LABEL: Record<Submission, MessageKey> = {
  portal: 'insSubPortal',
  email: 'insSubEmail',
  post: 'insSubPost',
  app: 'insSubApp',
  other: 'insSubOther',
};
export function isSubmission(v: unknown): v is Submission {
  return typeof v === 'string' && (SUBMISSIONS as readonly string[]).includes(v);
}

export const CLAIM_STATUS = ['open', 'submitted', 'query', 'partial', 'reimbursed', 'rejected'] as const;
export type ClaimStatus = (typeof CLAIM_STATUS)[number];
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, MessageKey> = {
  open: 'clStOpen',
  submitted: 'clStSubmitted',
  query: 'clStQuery',
  partial: 'clStPartial',
  reimbursed: 'clStReimbursed',
  rejected: 'clStRejected',
};
export function isClaimStatus(v: unknown): v is ClaimStatus {
  return typeof v === 'string' && (CLAIM_STATUS as readonly string[]).includes(v);
}
/** Noch nicht entschieden: offen, eingereicht, Rückfrage */
const UNDECIDED: readonly ClaimStatus[] = ['open', 'submitted', 'query'];

export interface ClaimLike {
  amount: number;
  status: string;
  reimbursed_amount: number | null;
}

export interface ClaimTotals {
  /** Rechnungsbeträge aller Einreichungen außer „offen“ (noch nicht eingereicht) */
  submitted: number;
  /** Summe der erstatteten Beträge */
  reimbursed: number;
  /** Rechnungsbeträge, über die noch nicht entschieden ist (offen, eingereicht, Rückfrage) */
  pending: number;
}

export function claimTotals(rows: readonly ClaimLike[]): ClaimTotals {
  const cents = (n: number) => Math.round(Number(n) * 100);
  let submitted = 0;
  let reimbursed = 0;
  let pending = 0;
  for (const c of rows) {
    if (c.status !== 'open') submitted += cents(c.amount);
    reimbursed += cents(c.reimbursed_amount ?? 0);
    if ((UNDECIDED as readonly string[]).includes(c.status)) pending += cents(c.amount);
  }
  return { submitted: submitted / 100, reimbursed: reimbursed / 100, pending: pending / 100 };
}

export const INSURER_MAX = 120;
export const POLICY_MAX = 60;
export const HOLDER_MAX = 120;
export const INS_NOTE_MAX = 500;
export const CLAIM_TITLE_MAX = 120;

export interface InsuranceFormValues {
  insurer: string;
  policyNo: string;
  holder: string;
  deductible: string;
  pct: string;
  submission: Submission | '';
  note: string;
}
export type InsuranceErrors = Partial<Record<keyof InsuranceFormValues, MessageKey>>;

export function validateInsurance(v: InsuranceFormValues): InsuranceErrors {
  const e: InsuranceErrors = {};
  const insurer = v.insurer.trim();
  if (!insurer) e.insurer = 'insErrInsurer';
  else if (insurer.length > INSURER_MAX) e.insurer = 'apErrTitleLong';
  const pol = v.policyNo.trim();
  if (!pol) e.policyNo = 'insErrPolicy';
  else if (pol.length > POLICY_MAX) e.policyNo = 'insErrPolicyLong';
  if (v.holder.length > HOLDER_MAX) e.holder = 'apErrTitleLong';
  if (v.deductible.trim()) {
    const d = parseMoney(v.deductible, true);
    if (!d.ok) e.deductible = d.error === 'range' ? 'insErrRange' : 'insErrMoney';
  }
  if (v.pct.trim()) {
    const s = v.pct.trim().replace(/\s*%$/, '');
    if (!/^\d{1,3}$/.test(s) || Number(s) > 100) e.pct = 'insErrPct';
  }
  if (v.note.length > INS_NOTE_MAX) e.note = 'insErrNote';
  return e;
}

export function parsePct(v: string): number | null {
  const s = v.trim().replace(/\s*%$/, '');
  return s ? Number(s) : null;
}

export interface ClaimFormValues {
  title: string;
  amount: string;
  date: string;
  status: ClaimStatus;
  reimbursed: string;
  documentId: string;
  note: string;
}
export type ClaimErrors = Partial<Record<keyof ClaimFormValues, MessageKey>>;

export function validateClaim(v: ClaimFormValues, today: string): ClaimErrors {
  const e: ClaimErrors = {};
  const title = v.title.trim();
  if (!title) e.title = 'clErrTitle';
  else if (title.length > CLAIM_TITLE_MAX) e.title = 'apErrTitleLong';
  const amount = parseMoney(v.amount);
  if (!amount.ok) e.amount = MONEY_ERROR[amount.error];
  if (!v.date) e.date = 'errDateRequired';
  else if (!isIsoDate(v.date)) e.date = 'errDate';
  else if (v.date > today) e.date = 'errFuture';
  if (v.reimbursed.trim()) {
    const r = parseMoney(v.reimbursed, true);
    if (!r.ok) e.reimbursed = r.error === 'range' ? 'insErrRange' : 'insErrMoney';
    else if (amount.ok && r.value > amount.value) e.reimbursed = 'clErrReimbursed';
  }
  if (v.note.length > INS_NOTE_MAX) e.note = 'insErrNote';
  return e;
}

// ---------- Betreuung (Sitter-Zugang) ----------

export const SITTER_MAX_DAYS = 92;
export const SITTER_NAME_MAX = 80;
export const SITTER_TEXT_MAX = 2000;

export type SitterState = 'upcoming' | 'active' | 'expired' | 'revoked';

/** Status in Worten: widerrufen geht vor; „heute“ zählt zum Zeitraum (beide Grenzen inklusive) */
export function sitterState(a: { valid_from: string; valid_to: string; revoked_at: string | null }, today: string): SitterState {
  if (a.revoked_at) return 'revoked';
  if (today < a.valid_from) return 'upcoming';
  if (today > a.valid_to) return 'expired';
  return 'active';
}

export const SITTER_STATE_LABEL: Record<SitterState, MessageKey> = {
  upcoming: 'sitStarts',
  active: 'sitActive',
  expired: 'sitExpired',
  revoked: 'sitRevoked',
};

export interface SitterFormValues {
  name: string;
  from: string;
  to: string;
  feeding: string;
  care: string;
}
export type SitterErrors = Partial<Record<keyof SitterFormValues, MessageKey>>;

export function validateSitter(v: SitterFormValues): SitterErrors {
  const e: SitterErrors = {};
  const name = v.name.trim();
  if (!name) e.name = 'sitNeed';
  else if (name.length > SITTER_NAME_MAX) e.name = 'sitErrNameLong';
  if (!v.from) e.from = 'sitNeed';
  else if (!isIsoDate(v.from)) e.from = 'errDate';
  if (!v.to) e.to = 'sitNeed';
  else if (!isIsoDate(v.to)) e.to = 'errDate';
  else if (isIsoDate(v.from)) {
    const d = daysBetween(v.from, v.to);
    if (d < 0) e.to = 'sitDateBad';
    else if (d > SITTER_MAX_DAYS) e.to = 'sitTooLong';
  }
  if (v.feeding.length > SITTER_TEXT_MAX) e.feeding = 'sitErrText';
  if (v.care.length > SITTER_TEXT_MAX) e.care = 'sitErrText';
  return e;
}

const SITTER_TOKEN_RE = /^[A-Za-z0-9]{64}$/;
export function isSitterToken(v: string | undefined | null): v is string {
  return typeof v === 'string' && SITTER_TOKEN_RE.test(v);
}

/** Öffentlicher Link: https://…/betreuung/{token} (ohne doppelte Schrägstriche) */
export function sitterLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/betreuung/${encodeURIComponent(token)}`;
}

/** WhatsApp- und E-Mail-Links für die Einladung */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
export function mailtoLink(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Öffentliche Sitter-Ansicht (JSON aus sitter_view) ----------

export interface SitterViewPet {
  name: string;
  species: string;
  species_other: string | null;
  breed: string | null;
  chip_no: string | null;
  allergies: string | null;
  medications: string | null;
}
/** Laufendes Medikament aus sitter_view (Uhrzeiten schon als HH:MM) */
export interface SitterMed {
  name: string;
  amount: number;
  unit: string;
  frequency: string;
  times: string[];
  intake_hint: string;
  note: string | null;
  ends_on: string | null;
}
export type SitterView =
  | { status: 'ok'; sitter_name: string; valid_from: string; valid_to: string; feeding: string | null; care_notes: string | null; pet: SitterViewPet; active_medications: SitterMed[]; owner_name: string | null; owner_phone: string | null; emergency_contact: string | null; vet_name: string | null; vet_phone: string | null }
  | { status: 'not_yet'; valid_from: string; pet_name: string }
  | { status: 'invalid' };

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Medikamentenliste sicher lesen: Unvollständiges wird übersprungen */
function parseMeds(v: unknown): SitterMed[] {
  if (!Array.isArray(v)) return [];
  const out: SitterMed[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const m = x as Record<string, unknown>;
    const name = str(m.name);
    const amount = Number(m.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0) continue;
    const times = Array.isArray(m.times) ? m.times.filter((y): y is string => typeof y === 'string' && /^\d{2}:\d{2}/.test(y)).map((y) => y.slice(0, 5)) : [];
    out.push({ name, amount, unit: str(m.unit) ?? '', frequency: str(m.frequency) ?? 'daily', times, intake_hint: str(m.intake_hint) ?? 'none', note: str(m.note), ends_on: str(m.ends_on) });
  }
  return out;
}

/** JSON sicher lesen; abgelaufen, widerrufen, unbekannt und alles Unerwartete → „invalid“ (ein Text für alle) */
export function parseSitterView(json: unknown): SitterView {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { status: 'invalid' };
  const o = json as Record<string, unknown>;
  if (o.status === 'not_yet' && str(o.valid_from)) return { status: 'not_yet', valid_from: str(o.valid_from)!, pet_name: str(o.pet_name) ?? '' };
  if (o.status !== 'ok') return { status: 'invalid' };
  const p = (o.pet && typeof o.pet === 'object' ? o.pet : {}) as Record<string, unknown>;
  const name = str(p.name);
  const from = str(o.valid_from);
  const to = str(o.valid_to);
  if (!name || !from || !to) return { status: 'invalid' };
  return {
    status: 'ok',
    sitter_name: str(o.sitter_name) ?? '',
    valid_from: from,
    valid_to: to,
    feeding: str(o.feeding),
    care_notes: str(o.care_notes),
    pet: { name, species: str(p.species) ?? 'other', species_other: str(p.species_other), breed: str(p.breed), chip_no: str(p.chip_no), allergies: str(p.allergies), medications: str(p.medications) },
    active_medications: parseMeds(o.active_medications),
    owner_name: str(o.owner_name),
    owner_phone: str(o.owner_phone),
    emergency_contact: str(o.emergency_contact),
    vet_name: str(o.vet_name),
    vet_phone: str(o.vet_phone),
  };
}

// ---------- Telefon ----------

/** Für tel:-Links: nur Ziffern und führendes + */
export function telHref(phone: string): string | null {
  const t = phone.trim();
  const digits = t.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : null;
}

export const PHONE_MAX = 40;
export const VET_NAME_MAX = 120;
