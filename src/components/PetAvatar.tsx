import { useState } from 'react';
import type { PetRow } from '../lib/supabase';
import { isSpecies } from '../lib/domain';
import { usePetPhoto } from '../lib/usePetPhoto';
import { SpeciesIcon } from './Icons';

/**
 * Rundes Tierfoto, ohne Foto das Tierart-Symbol.
 * `alt` leer lassen, wenn der Name direkt daneben steht (sonst liest der Screenreader ihn doppelt).
 */
export function PetAvatar({
  pet,
  size,
  alt = '',
  className = '',
  fallback = true,
  iconSize,
}: {
  pet: Pick<PetRow, 'photo_path' | 'species'>;
  size: number;
  alt?: string;
  className?: string;
  /** ohne Foto nichts zeigen statt des Symbols */
  fallback?: boolean;
  /** Größe des Tierart-Symbols ohne Foto */
  iconSize?: number;
}) {
  const url = usePetPhoto(pet);
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt={alt}
        width={size}
        height={size}
        className={`pet-photo ${className}`}
        style={{ width: size, height: size }}
        onError={() => setBroken(url)}
        decoding="async"
      />
    );
  }
  if (!fallback) return null;
  return <SpeciesIcon species={isSpecies(pet.species) ? pet.species : 'other'} size={iconSize ?? Math.round(size * 0.6)} />;
}
