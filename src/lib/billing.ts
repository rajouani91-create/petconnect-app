// Abrechnung (Etappe P7a): Leistungskatalog mit Versionen, Rechnungsentwürfe, Freigabe, Zahlung, Storno.
// Beträge rechnet die Datenbank verbindlich; hier nur die Vorschau im Entwurf (gleiche Rundung).
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';

export interface BillingSettings {
  legal_name: string | null; tax_id: string | null; tax_number: string | null; iban: string | null; bic: string | null; bank: string | null;
  payment_days: number; small_business: boolean; allow_free: boolean; footer: string | null;
}
export interface CatalogItem {
  id: string; code: string; name: string; description: string | null; price: number; factor: number; factor_min: number; factor_max: number;
  tax_rate: number; valid_from: string | null; valid_to: string | null;
}
export interface Catalog { id: string; version: string; name: string; currency: string; valid_from: string; items: CatalogItem[] }
export interface CatalogVersion { id: string; version: string; name: string; valid_from: string; active: boolean; created_at: string; created_by_name: string | null; items: number; used: number }
export interface PracticeAddress { name: string; street: string | null; housenumber: string | null; postcode: string | null; city: string | null; phone: string | null; email: string | null }
export interface BillingData { can_edit: boolean; practice: PracticeAddress; settings: BillingSettings; catalog: Catalog | null; versions: CatalogVersion[] }

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'cancelled' | 'final';
export type PayMethod = 'transfer' | 'cash' | 'card';
export interface InvoiceRow {
  id: string; kind: 'invoice' | 'cancellation'; status: InvoiceStatus; number: string | null; pet_id: string | null; pet_label: string;
  recipient_name: string | null; treatment_date: string; invoice_date: string | null; due_date: string | null; paid_on: string | null;
  pay_method: PayMethod | null; gross: number; currency: string; first_item: string | null; item_count: number;
  cancels_number: string | null; cancelled_by_number: string | null; has_owner: boolean; created_at: string;
}
export interface InvoiceItem {
  id?: string; pos?: number; catalog_item_id: string | null; code: string | null; name: string; qty: number; factor: number;
  factor_min: number; factor_max: number; unit_price: number; tax_rate: number; net: number; free: boolean;
}
export interface Issuer {
  name: string; street: string | null; postcode: string | null; city: string | null; phone: string | null; email: string | null;
  tax_id: string | null; tax_number: string | null; iban: string | null; bic: string | null; bank: string | null; footer: string | null;
}
export interface TaxLine { rate: number; net: number; tax: number }
export interface Invoice {
  id: string; kind: 'invoice' | 'cancellation'; status: InvoiceStatus; number: string | null; pet_id: string | null; pet_label: string; has_owner: boolean;
  recipient_name: string | null; recipient_address: string | null; treatment_date: string; invoice_date: string | null; due_date: string | null;
  catalog_version: string | null; catalog_name: string | null; currency: string; note: string | null;
  net: number; tax: number; gross: number; taxes: TaxLine[]; small_business: boolean; issuer: Issuer;
  cancels_number: string | null; cancelled_by_number: string | null; cancel_reason: string | null;
  paid_on: string | null; pay_method: PayMethod | null; paid_by_name?: string | null;
  finalized_at: string | null; finalized_by_name: string | null; created_by_name?: string | null; items: InvoiceItem[];
}
export interface OwnerInvoiceRow {
  id: string; kind: 'invoice' | 'cancellation'; status: InvoiceStatus; number: string; practice_name: string; pet_id: string | null; pet_label: string;
  treatment_date: string; invoice_date: string; due_date: string | null; paid_on: string | null; gross: number; currency: string;
  cancels_number: string | null; cancelled_by_number: string | null;
}
export interface BillingAddress { name: string; street: string; postcode: string; city: string; country: string }

// ---------- Anzeige ----------

/** Status für Anzeige und Filter: „Überfällig“ ergibt sich aus offen + Fälligkeit vorbei */
export type ViewStatus = 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled' | 'final';
export function viewStatus(r: { status: InvoiceStatus; due_date: string | null }, today: string): ViewStatus {
  if (r.status === 'open' && r.due_date && r.due_date < today) return 'overdue';
  return r.status;
}
export const STATUS_LABEL: Record<ViewStatus, MessageKey> = {
  draft: 'blStDraft', open: 'blStOpen', overdue: 'blStOverdue', paid: 'blStPaid', cancelled: 'blStCancelled', final: 'blStCancellation',
};
export const STATUS_TONE: Record<ViewStatus, string> = { draft: '', open: 'pill-warn', overdue: 'pill-crit', paid: 'pill-ok', cancelled: '', final: '' };
export const PAY_LABEL: Record<PayMethod, MessageKey> = { transfer: 'blPayTransfer', cash: 'blPayCash', card: 'blPayCard' };
export const PAY_METHODS: PayMethod[] = ['transfer', 'cash', 'card'];

export type InvoiceFilter = 'all' | 'draft' | 'open' | 'overdue' | 'paid';
export const INVOICE_FILTERS: InvoiceFilter[] = ['all', 'draft', 'open', 'overdue', 'paid'];
export const FILTER_LABEL: Record<InvoiceFilter, MessageKey> = { all: 'hsAll', draft: 'blStDraft', open: 'blStOpen', overdue: 'blStOverdue', paid: 'blStPaid' };
export function matchesFilter(r: InvoiceRow, f: InvoiceFilter, today: string): boolean {
  const v = viewStatus(r, today);
  if (f === 'all') return true;
  if (f === 'open') return v === 'open' || v === 'overdue';
  return v === f;
}

export function money(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR' }).format(amount);
}
export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Kennzahlen: offene Forderungen, überfällig, bezahlt, Entwürfe */
export function kpis(rows: readonly InvoiceRow[], today: string) {
  const sum = (xs: InvoiceRow[]) => round2(xs.reduce((s, r) => s + Number(r.gross), 0));
  const open = rows.filter((r) => viewStatus(r, today) === 'open' || viewStatus(r, today) === 'overdue');
  const overdue = rows.filter((r) => viewStatus(r, today) === 'overdue');
  const paid = rows.filter((r) => r.status === 'paid');
  const drafts = rows.filter((r) => r.status === 'draft');
  return { open: { sum: sum(open), n: open.length }, overdue: { sum: sum(overdue), n: overdue.length }, paid: { sum: sum(paid), n: paid.length }, drafts: drafts.length };
}

/** Vorschau der Summen eines Entwurfs, gleiche Regeln wie die Datenbank (Steuer je Satz auf die Netto-Summe) */
export function totals(items: readonly Pick<InvoiceItem, 'qty' | 'factor' | 'unit_price' | 'tax_rate' | 'free'>[], smallBusiness: boolean) {
  const byRate = new Map<number, number>();
  let net = 0;
  for (const it of items) {
    const line = lineNet(it);
    net = round2(net + line);
    byRate.set(Number(it.tax_rate), round2((byRate.get(Number(it.tax_rate)) ?? 0) + line));
  }
  const taxes: TaxLine[] = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, n]) => ({ rate, net: n, tax: smallBusiness ? 0 : round2((n * rate) / 100) }));
  const tax = round2(taxes.reduce((s, x) => s + x.tax, 0));
  return { net, tax, gross: round2(net + tax), taxes };
}
export const lineNet = (it: Pick<InvoiceItem, 'qty' | 'factor' | 'unit_price' | 'free'>) =>
  round2(Number(it.qty) * (it.free ? 1 : Number(it.factor)) * Number(it.unit_price));

/** Leistung im Katalog am Behandlungstag gültig? */
export const validOn = (i: Pick<CatalogItem, 'valid_from' | 'valid_to'>, day: string) => (!i.valid_from || i.valid_from <= day) && (!i.valid_to || i.valid_to >= day);
export const clampFactor = (f: number, min: number, max: number) => Math.min(Math.max(Number.isFinite(f) ? f : min, min), max);

/** Fehlende Rechnungsdaten für die Freigabe */
export function missingForFinalize(inv: Pick<Invoice, 'recipient_name' | 'recipient_address' | 'items'>, b: Pick<BillingData, 'settings' | 'practice'>): MessageKey[] {
  const m: MessageKey[] = [];
  if (!inv.items.length) m.push('blErrItems');
  if (!inv.recipient_name?.trim() || !inv.recipient_address?.trim()) m.push('blErrRecipient');
  if (!b.settings.tax_id && !b.settings.tax_number) m.push('blErrTaxId');
  if (!b.practice.street || !b.practice.city) m.push('blErrAddress');
  return m;
}

export function formatAddress(a: BillingAddress | null): string {
  if (!a) return '';
  return [a.street, `${a.postcode} ${a.city}`, a.country && a.country !== 'DE' ? a.country : ''].filter(Boolean).join('\n');
}

export function formatIban(iban: string | null): string {
  return (iban ?? '').replace(/(.{4})/g, '$1 ').trim();
}

// ---------- Beispielkataloge (wie im Prototyp, ausdrücklich Beispielwerte) ----------

export type SampleKey = 'DE' | 'FR' | 'UK';
type SampleRow = [code: string, name: string, description: string, price: number, fmin: number, fmax: number, tax: number];
const SAMPLES: Record<SampleKey, { name: string; currency: string; rows: SampleRow[] }> = {
  DE: {
    name: 'Deutschland, GOT-basiert (Beispielwerte)', currency: 'EUR', rows: [
      ['G01', 'Allgemeine Untersuchung mit Beratung', 'Klinische Allgemeinuntersuchung inkl. Beratung', 24, 1, 3, 19],
      ['G02', 'Eingehende Untersuchung', 'Eingehende Untersuchung eines Organsystems', 34, 1, 3, 19],
      ['G03', 'Impfung (Injektion)', 'Verabreichung einer Impfung', 12, 1, 3, 19],
      ['G04', 'Impfstoff Tollwut', 'Material', 18.5, 1, 1, 19],
      ['G05', 'Impfstoff SHPPi', 'Material', 24, 1, 1, 19],
      ['G06', 'Blutentnahme', 'Venenpunktion', 9.5, 1, 3, 19],
      ['G07', 'Blutstatus (Labor)', 'Großes Blutbild und Organprofil', 42, 1, 1, 19],
      ['G08', 'Ohrenbehandlung', 'Reinigung und Behandlung des Gehörgangs', 16, 1, 3, 19],
      ['G09', 'Zahnsteinentfernung in Narkose', 'Zahnsanierung inkl. Politur', 89, 1, 3, 19],
      ['G10', 'Ultraschalluntersuchung', 'Bauchorgane', 38, 1, 3, 19],
      ['G11', 'Videosprechstunde', 'Beratung per Video', 25, 1, 3, 19],
      ['G12', 'Notdienstgebühr', 'Zuschlag außerhalb der Sprechzeiten', 50, 1, 1, 19],
      ['G13', 'Entwurmung (Tablette)', 'Medikament', 4.5, 1, 1, 19],
      ['G14', 'Ohrmedikament (Tube)', 'Medikament', 14.5, 1, 1, 19],
      ['G15', 'Diätfutter Niere (Beutel)', 'Futtermittel', 4.2, 1, 1, 7],
    ],
  },
  FR: {
    name: 'France, tarif libre (exemple)', currency: 'EUR', rows: [
      ['F01', 'Consultation', 'Consultation générale', 50, 1, 1, 20],
      ['F02', 'Vaccination', 'Acte vaccinal', 28, 1, 1, 20],
      ['F03', 'Prise de sang', 'Prélèvement sanguin', 18, 1, 1, 20],
      ['F04', 'Détartrage sous anesthésie', 'Soins dentaires', 190, 1, 2, 20],
      ['F05', 'Échographie', 'Abdominale', 60, 1, 1, 20],
      ['F06', 'Consultation d’urgence', 'Majoration hors horaires', 40, 1, 1, 20],
    ],
  },
  UK: {
    name: 'United Kingdom (example)', currency: 'GBP', rows: [
      ['U01', 'Consultation', 'General consultation', 45, 1, 1, 20],
      ['U02', 'Vaccination', 'Annual booster', 38, 1, 1, 20],
      ['U03', 'Blood test', 'In-house panel', 62, 1, 1, 20],
      ['U04', 'Dental scale and polish', 'Under anaesthetic', 240, 1, 1, 20],
      ['U05', 'Out-of-hours fee', 'Emergency surcharge', 75, 1, 1, 20],
    ],
  },
};
export const SAMPLE_KEYS: SampleKey[] = ['DE', 'FR', 'UK'];
export const SAMPLE_LABEL: Record<SampleKey, MessageKey> = { DE: 'blSampleDE', FR: 'blSampleFR', UK: 'blSampleUK' };
export function samplePayload(k: SampleKey) {
  const s = SAMPLES[k];
  return {
    mode: 'replace' as const, name: s.name, currency: s.currency,
    items: s.rows.map(([code, name, description, price, factor_min, factor_max, tax_rate]) => ({ code, name, description, price, factor: factor_min, factor_min, factor_max, tax_rate })),
  };
}

// ---------- Fehler ----------

const ERROR_KEYS: Record<string, MessageKey> = {
  forbidden: 'pe_forbidden', patient_not_found: 'blErrPatient', entry_not_found: 'scErrGone', invoice_final: 'blErrFinal',
  items_required: 'blErrItems', items_invalid: 'blErrLine', item_not_in_catalog: 'blErrNotInCatalog', free_not_allowed: 'blErrFree',
  recipient_required: 'blErrRecipient', tax_id_required: 'blErrTaxId', address_required: 'blErrAddress', date_invalid: 'blErrDate',
  catalog_missing: 'blErrNoCatalog', catalog_empty: 'blErrCatalogEmpty', catalog_row_invalid: 'blErrCatalogRow', iban_invalid: 'blErrIban',
  days_invalid: 'blErrDays', reason_required: 'blErrReason', address_invalid: 'blErrOwnerAddress', status_invalid: 'scErrGone',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function billingErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Praxis ----------

export async function practiceBilling(): Promise<BillingData> {
  const { data, error } = await supabase.rpc('practice_billing');
  if (error) throw error;
  return data as unknown as BillingData;
}
export async function saveBillingSettings(s: BillingSettings): Promise<void> {
  const { error } = await supabase.rpc('practice_save_billing_settings', { p: s as unknown as Json });
  if (error) throw error;
}
export interface CatalogChange { code: string; name: string; description?: string | null; price: number; factor?: number; factor_min?: number; factor_max?: number; tax_rate?: number; valid_from?: string | null; valid_to?: string | null; remove?: boolean }
export async function publishCatalog(p: { mode: 'merge' | 'replace'; name?: string; currency?: string; items: CatalogChange[] }): Promise<string> {
  const { data, error } = await supabase.rpc('practice_catalog_publish', { p: p as unknown as Json });
  if (error) throw error;
  return data;
}
export async function practiceInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase.rpc('practice_invoices');
  if (error) throw error;
  return (data ?? []) as unknown as InvoiceRow[];
}
export async function practiceInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase.rpc('practice_invoice', { p_id: id });
  if (error) throw error;
  return data as unknown as Invoice;
}
export async function createInvoice(petId: string, treatmentDate: string, itemIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('practice_invoice_create', { p: { pet_id: petId, treatment_date: treatmentDate, item_ids: itemIds } as unknown as Json });
  if (error) throw error;
  return data;
}
export interface DraftPayload {
  treatment_date: string; recipient_name: string; recipient_address: string; note: string;
  items: ({ catalog_item_id: string; qty: number; factor: number } | { free: true; name: string; qty: number; unit_price: number; tax_rate: number })[];
}
export async function saveInvoice(id: string, p: DraftPayload): Promise<void> {
  const { error } = await supabase.rpc('practice_invoice_save', { p_id: id, p: p as unknown as Json });
  if (error) throw error;
}
export async function discardInvoice(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_invoice_discard', { p_id: id });
  if (error) throw error;
}
export async function finalizeInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('practice_invoice_finalize', { p_id: id });
  if (error) throw error;
  return data;
}
export async function payInvoice(id: string, date: string, method: PayMethod): Promise<void> {
  const { error } = await supabase.rpc('practice_invoice_pay', { p_id: id, p_date: date, p_method: method });
  if (error) throw error;
}
export async function unpayInvoice(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_invoice_unpay', { p_id: id });
  if (error) throw error;
}
export async function cancelInvoice(id: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('practice_invoice_cancel', { p_id: id, p_reason: reason.trim() });
  if (error) throw error;
  return data;
}

// ---------- Halter:in ----------

export async function ownerInvoices(): Promise<OwnerInvoiceRow[]> {
  const { data, error } = await supabase.rpc('owner_invoices');
  if (error) throw error;
  return (data ?? []) as unknown as OwnerInvoiceRow[];
}
export async function ownerInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase.rpc('owner_invoice', { p_id: id });
  if (error) throw error;
  return data as unknown as Invoice;
}
export async function myBillingAddress(): Promise<BillingAddress | null> {
  const { data, error } = await supabase.rpc('my_billing_address');
  if (error) throw error;
  return (data as unknown as BillingAddress | null) ?? null;
}
export async function saveBillingAddress(a: BillingAddress): Promise<void> {
  const { error } = await supabase.rpc('save_billing_address', { p: a as unknown as Json });
  if (error) throw error;
}
