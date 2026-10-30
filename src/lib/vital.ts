// Vitalwerte (Temperatur, Herz- und Atemfrequenz): reine Hilfsfunktionen ohne Supabase und React, damit sie testbar sind.
import type { MessageKey } from '../i18n';
import { localDate } from './schedule';
import type { WeightLike } from './record';

export const VITAL_KINDS = ['temperature', 'heart_rate', 'resp_rate'] as const;
export type VitalKind = (typeof VITAL_KINDS)[number];

export const VITAL_CONTEXTS = ['rectal', 'ear', 'resting', 'active'] as const;
export type VitalContext = (typeof VITAL_CONTEXTS)[number];

/** Grenzen wie in der Datenbank (Plausibilität gegen Tippfehler, keine medizinische Bewertung) */
export const VITAL_RANGE: Record<VitalKind, { min: number; max: number }> = {
  temperature: { min: 30, max: 45 },
  heart_rate: { min: 10, max: 400 },
  resp_rate: { min: 2, max: 200 },
};

/** Übliche Ruhewerte erwachsener Tiere (Richtwerte zur Orientierung, keine Diagnose). Fehlt eine Tierart, gibt es keine allgemeinen Werte. */
const NORMAL_RANGE: Partial<Record<string, Partial<Record<VitalKind, { min: number; max: number }>>>> = {
  dog: { temperature: { min: 37.5, max: 39.2 }, heart_rate: { min: 60, max: 140 }, resp_rate: { min: 10, max: 30 } },
  cat: { temperature: { min: 38, max: 39.2 }, heart_rate: { min: 140, max: 220 }, resp_rate: { min: 20, max: 30 } },
  rabbit: { temperature: { min: 38.5, max: 40 }, heart_rate: { min: 130, max: 325 }, resp_rate: { min: 30, max: 60 } },
  guinea: { temperature: { min: 37.2, max: 39.5 }, heart_rate: { min: 230, max: 380 }, resp_rate: { min: 42, max: 104 } },
  horse: { temperature: { min: 37.2, max: 38.5 }, heart_rate: { min: 28, max: 44 }, resp_rate: { min: 8, max: 16 } },
};

export function normalRange(species: string, kind: VitalKind): { min: number; max: number } | null {
  return NORMAL_RANGE[species]?.[kind] ?? null;
}

/** Beispiel im Eingabefeld je Messwert */
export const KIND_EXAMPLE: Record<VitalKind, MessageKey> = { temperature: 'vtValueHint', heart_rate: 'vtHintHeart', resp_rate: 'vtHintResp' };

export const KIND_LABEL: Record<VitalKind, MessageKey> = { temperature: 'vtKindTemp', heart_rate: 'vtKindHeart', resp_rate: 'vtKindResp' };
export const CONTEXT_LABEL: Record<VitalContext, MessageKey> = { rectal: 'vtCtxRectal', ear: 'vtCtxEar', resting: 'vtCtxResting', active: 'vtCtxActive' };
/** Welche Messarten zu welchem Wert passen */
export const KIND_CONTEXTS: Record<VitalKind, readonly VitalContext[]> = {
  temperature: ['rectal', 'ear'],
  heart_rate: ['resting', 'active'],
  resp_rate: ['resting', 'active'],
};

export function isVitalKind(v: string): v is VitalKind {
  return (VITAL_KINDS as readonly string[]).includes(v);
}
export function isVitalContext(v: string | null): v is VitalContext {
  return v !== null && (VITAL_CONTEXTS as readonly string[]).includes(v);
}

export type VitalResult = { ok: true; value: number } | { ok: false; error: 'required' | 'format' | 'range' };

/** Eingabe lesen: Komma und Punkt, höchstens 2 Nachkommastellen, innerhalb der Grenzen der Art. */
export function parseVital(kind: VitalKind, input: string): VitalResult {
  const s = input.trim().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'required' };
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return { ok: false, error: 'format' };
  const value = Number(`${m[1]}.${m[2] ?? '0'}`);
  const { min, max } = VITAL_RANGE[kind];
  if (!Number.isFinite(value) || value < min || value > max) return { ok: false, error: 'range' };
  return { ok: true, value };
}

export const VITAL_ERROR: Record<Exclude<VitalResult, { ok: true }>['error'], MessageKey> = {
  required: 'vtErrRequired',
  format: 'vtErrFormat',
  range: 'vtErrRange',
};

/** Zeitpunkt aus Datum (YYYY-MM-DD): heute = jetzt, sonst 12 Uhr Ortszeit des Geräts. */
export function measuredAtFor(date: string, today: string, now: Date): string {
  if (date === today) return now.toISOString();
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export interface VitalLike {
  id: string;
  measured_at: string;
  value: number;
  created_at: string;
}

/** Für das Liniendiagramm: gleiche Form wie Gewichtsmessungen (Datum in Ortszeit, Wert als `kg`). */
export function toChartRows(rows: readonly VitalLike[]): (WeightLike & { id: string })[] {
  return rows.map((r) => ({ id: r.id, measured_on: localDate(new Date(r.measured_at)), kg: Number(r.value), created_at: r.created_at }));
}

/** Neueste Messung zuerst */
export function sortVitalsDesc<T extends VitalLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.measured_at.localeCompare(a.measured_at) || b.created_at.localeCompare(a.created_at));
}
