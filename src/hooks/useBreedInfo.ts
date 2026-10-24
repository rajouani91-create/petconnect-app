// src/hooks/useBreedInfo.ts
// Rassen-Informationen von The Dog API / The Cat API abrufen
// API-Keys: VITE_DOG_API_KEY / VITE_CAT_API_KEY (optional – funktioniert auch ohne)

import { useState, useEffect } from 'react';

export interface BreedInfo {
  id: string;
  name: string;
  // Q&A Felder
  temperament: string | null;       // Charakter
  life_span: string | null;         // Lebenserwartung
  weight: string | null;            // Gewicht
  height: string | null;            // Größe
  origin: string | null;            // Herkunft
  energy_level: number | null;      // Energie-Level (1–5)
  grooming: number | null;          // Pflegeaufwand (1–5)
  description: string | null;       // Beschreibung (nur Cat API)
}

export type BreedSpecies = 'dog' | 'cat';

// ---- interner Typ für rohe API-Antwort ----
interface RawBreed {
  id: string | number;
  name: string;
  temperament?: string;
  life_span?: string;
  weight?: { metric?: string; imperial?: string };
  height?: { metric?: string; imperial?: string };
  origin?: string;
  energy_level?: number;
  grooming?: number;
  description?: string;
}

function mapBreed(raw: RawBreed): BreedInfo {
  return {
    id: String(raw.id),
    name: raw.name,
    temperament: raw.temperament ?? null,
    life_span: raw.life_span ?? null,
    weight: raw.weight?.metric ?? raw.weight?.imperial ?? null,
    height: raw.height?.metric ?? raw.height?.imperial ?? null,
    origin: raw.origin ?? null,
    energy_level: raw.energy_level ?? null,
    grooming: raw.grooming ?? null,
    description: raw.description ?? null,
  };
}

// Cache damit nicht bei jedem Render neu geladen wird
const cache: Record<string, BreedInfo[]> = {};

async function fetchBreeds(species: BreedSpecies): Promise<BreedInfo[]> {
  const cacheKey = species;
  if (cache[cacheKey]) return cache[cacheKey];

  const dogKey = import.meta.env.VITE_DOG_API_KEY ?? '';
  const catKey = import.meta.env.VITE_CAT_API_KEY ?? '';

  const baseUrl =
    species === 'dog'
      ? 'https://api.thedogapi.com/v1/breeds'
      : 'https://api.thecatapi.com/v1/breeds';

  const apiKey = species === 'dog' ? dogKey : catKey;
  const headers: HeadersInit = apiKey ? { 'x-api-key': apiKey } : {};

  const res = await fetch(baseUrl, { headers });
  if (!res.ok) throw new Error(`Breed API error: ${res.status}`);
  const data: RawBreed[] = await res.json();
  const mapped = data.map(mapBreed);
  cache[cacheKey] = mapped;
  return mapped;
}

// ---- Hook: alle Rassen für eine Tierart ----
export function useBreedList(species: BreedSpecies | null) {
  const [breeds, setBreeds] = useState<BreedInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!species || (species !== 'dog' && species !== 'cat')) {
      setBreeds([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBreeds(species)
      .then((data) => { if (!cancelled) { setBreeds(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [species]);

  return { breeds, loading, error };
}

// ---- Hook: eine einzelne Rasse anhand des Namens suchen ----
export function useBreedInfo(species: BreedSpecies | null, breedName: string | null) {
  const { breeds, loading, error } = useBreedList(species);
  const [info, setInfo] = useState<BreedInfo | null>(null);

  useEffect(() => {
    if (!breedName || breeds.length === 0) { setInfo(null); return; }
    const q = breedName.toLowerCase().trim();
    const match =
      breeds.find((b) => b.name.toLowerCase() === q) ??
      breeds.find((b) => b.name.toLowerCase().includes(q)) ??
      null;
    setInfo(match);
  }, [breeds, breedName]);

  return { info, loading, error };
}

// ---- Hilfsfunktion: Rassen-Vorschläge für Autocomplete ----
export function filterBreedSuggestions(breeds: BreedInfo[], query: string): BreedInfo[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return breeds
    .filter((b) => b.name.toLowerCase().includes(q))
    .slice(0, 8);
}
