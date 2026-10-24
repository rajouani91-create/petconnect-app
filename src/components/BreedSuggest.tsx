// src/components/BreedSuggest.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBreedList, filterBreedSuggestions, type BreedSpecies } from '../hooks/useBreedInfo';

interface Props {
  species: BreedSpecies | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  above: boolean;
  maxHeight: number;
}

export function BreedSuggest({ species, value, onChange, placeholder = 'Rasse eingeben…', label = 'Rasse' }: Props) {
  const { breeds, loading } = useBreedList(species);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const updatePos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const vv = window.visualViewport;
    const visTop = vv ? vv.offsetTop : 0;
    const visBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const below = visBottom - rect.bottom - 8;
    const above = rect.top - visTop - 8;
    const placeAbove = below < 160 && above > below;
    const space = placeAbove ? above : below;
    setPos({
      top: placeAbove ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      above: placeAbove,
      maxHeight: Math.max(120, Math.min(260, space)),
    });
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inList = listRef.current?.contains(target);
      if (!inContainer && !inList) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    window.visualViewport?.addEventListener('resize', updatePos);
    window.visualViewport?.addEventListener('scroll', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
      window.visualViewport?.removeEventListener('resize', updatePos);
      window.visualViewport?.removeEventListener('scroll', updatePos);
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
      {open && suggestions.length > 0 && pos && createPortal(
        <ul
          ref={listRef}
          className="breed-suggest-list"
          role="listbox"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            transform: pos.above ? 'translateY(-100%)' : undefined,
            zIndex: 99999,
          }}
        >
          {suggestions.map((b) => (
            <li
              key={b.id}
              className="breed-suggest-item"
              role="option"
              onMouseDown={() => handleSelect(b.name)}
              onTouchEnd={(e) => { e.preventDefault(); handleSelect(b.name); }}
            >
              {b.name}
              {b.origin ? <span className="breed-suggest-origin"> · {b.origin}</span> : null}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}