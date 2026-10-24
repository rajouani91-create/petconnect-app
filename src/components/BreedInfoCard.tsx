// src/components/BreedInfoCard.tsx
// Zeigt Rassen-Infos als Q&A-Karte auf der Pet-Detailseite

import React from 'react';
import type { BreedInfo } from '../hooks/useBreedInfo';

interface Props {
  info: BreedInfo;
  loading?: boolean;
}

// Energie- und Pflegelevel als Punkte darstellen (● leer ○)
function DotScale({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="breed-dot-scale" aria-label={`${value} von ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'dot dot-filled' : 'dot dot-empty'}>
          {i < value ? '●' : '○'}
        </span>
      ))}
    </span>
  );
}

export function BreedInfoCard({ info, loading }: Props) {
  if (loading) {
    return (
      <div className="breed-info-card breed-info-loading">
        <p>Rassendaten werden geladen…</p>
      </div>
    );
  }

  const rows: { label: string; value: React.ReactNode }[] = [
    info.temperament
      ? { label: 'Charakter', value: info.temperament }
      : null,
    info.origin
      ? { label: 'Herkunft', value: info.origin }
      : null,
    info.life_span
      ? { label: 'Lebenserwartung', value: `${info.life_span} Jahre` }
      : null,
    info.weight
      ? { label: 'Gewicht', value: `${info.weight} kg` }
      : null,
    info.height
      ? { label: 'Größe', value: `${info.height} cm` }
      : null,
    info.energy_level != null
      ? {
          label: 'Energie-Level',
          value: <DotScale value={info.energy_level} />,
        }
      : null,
    info.grooming != null
      ? {
          label: 'Pflegeaufwand',
          value: <DotScale value={info.grooming} />,
        }
      : null,
  ].filter(Boolean) as { label: string; value: React.ReactNode }[];

  return (
    <div className="breed-info-card">
      <h3 className="breed-info-title">
        Rassenprofil: {info.name}
      </h3>

      {info.description && (
        <p className="breed-info-description">{info.description}</p>
      )}

      <dl className="breed-info-list">
        {rows.map(({ label, value }) => (
          <div key={label} className="breed-info-row">
            <dt className="breed-info-label">{label}</dt>
            <dd className="breed-info-value">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="breed-info-source">
        Quelle: The Dog API / The Cat API
      </p>
    </div>
  );
}

// ---- Skeleton während des Ladens ----
export function BreedInfoSkeleton() {
  return (
    <div className="breed-info-card breed-info-skeleton">
      <div className="skeleton-line skeleton-title" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-line skeleton-label" />
          <div className="skeleton-line skeleton-value" />
        </div>
      ))}
    </div>
  );
}
