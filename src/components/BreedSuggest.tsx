// src/components/BreedSuggest.tsx
// Autocomplete-Dropdown für Rassenname im PetNew-Formular
// Verwendung: <BreedSuggest species="dog" value={breed} onChange={setBreed} />

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBreedList, filterBreedSuggestions, type BreedSpecies } from '../hooks/useBreedInfo';

interface Props {
  species: BreedSpecies | null;    // 'dog' | 'cat' — bei anderen Tierarten null
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
}

export function BreedSuggest({ species, value, onChange, placeholder = 'Rasse eingeben…', label = 'Rasse' }: Props) {
  const { breeds, loading } = useBreedList(species);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync nach außen
  useEffect(() => { setQuery(value); }, [value]);

  // Position des Dropdowns berechnen (fixed, relativ zum Viewport)
  const updatePos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

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

  // Position aktualisieren beim Scrollen / Resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  const suggestions = species ? filterBreedSuggestions(breeds, query) : [];

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    updatePos();
    setOpen(true);
  }

  function handleFocus() {
    if (query.length >= 2) {
      updatePos();
      setOpen(true);
    }
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
        ref={inputRef}
        type="text"
        className="form-input"
        value={query}
        placeholder={loading ? 'Lädt Rassen…' : placeholder}
        disabled={loading}
        onChange={handleInput}
        onFocus={handleFocus}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && pos && (
        <ul
          className="breed-suggest-list"
          role="listbox"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
        >
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
