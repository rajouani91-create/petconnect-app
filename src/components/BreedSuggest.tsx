// src/components/BreedSuggest.tsx
// Autocomplete-Dropdown für Rassenname im PetNew-Formular
// Verwendung: <BreedSuggest species="dog" value={breed} onChange={setBreed} />

import { useState, useEffect, useRef } from 'react';
import { useBreedList, filterBreedSuggestions, type BreedSpecies } from '../hooks/useBreedInfo';

interface Props {
  species: BreedSpecies | null;    // 'dog' | 'cat' — bei anderen Tierarten null
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function BreedSuggest({ species, value, onChange, placeholder = 'Rasse eingeben…', label = 'Rasse' }: Props) {
  const { breeds, loading } = useBreedList(species);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync nach außen
  useEffect(() => { setQuery(value); }, [value]);

  // Schließen bei Klick außerhalb
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const suggestions = species ? filterBreedSuggestions(breeds, query) : [];

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
  }

  function handleSelect(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  // Bei Tierarten ohne API (Pferd etc.) einfaches Textfeld
  if (!species) {
    return (
      <div className="form-field">
        <label className="form-label">{label}</label>
        <input
          type="text"
          className="form-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="form-field breed-suggest" ref={containerRef}>
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-input"
        value={query}
        placeholder={loading ? 'Lädt Rassen…' : placeholder}
        disabled={loading}
        onChange={handleInput}
        onFocus={() => query.length >= 2 && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="breed-suggest-list" role="listbox">
          {suggestions.map((b) => (
            <li
              key={b.id}
              className="breed-suggest-item"
              role="option"
              onMouseDown={() => handleSelect(b.name)}
            >
              {b.name}
              {b.origin ? <span className="breed-suggest-origin"> · {b.origin}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
