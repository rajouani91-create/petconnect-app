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
    setPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // Schließen bei Klick außerhalb
  useEffect(() => {
    function handle(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        listRef.current && !listRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, []);

  // Position bei Scroll/Resize/Keyboard aktualisieren
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    // Tastatur auf Mobile
    if (typeof window.visualViewport !== 'undefined') {
      window.visualViewport?.addEventListener('resize', updatePos);
      window.visualViewport?.addEventListener('scroll', updatePos);
    }
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

  // Dropdown-Position: nutze visualViewport für Mobile (Tastatur-Verschiebung)
  const getFixedStyle = (): React.CSSProperties => {
    if (!pos) return { display: 'none' };
    const vv = window.visualViewport;
    const offsetY = vv ? vv.offsetTop : 0;
    const offsetX = vv ? vv.offsetLeft : 0;
    return {
      position: 'fixed',
      top: pos.top - offsetY,
      left: pos.left - offsetX,
      width: pos.width,
      zIndex: 99999,
      maxHeight: '200px',
      overflowY: 'auto',
      backgroundColor: 'var(--color-surface, #1e1e2e)',
      border: '1px solid var(--color-border, #333)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      listStyle: 'none',
      margin: 0,
      padding: '4px 0',
    };
  };

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
          style={getFixedStyle()}
        >
          {suggestions.map((b) => (
            <li
              key={b.id}
              className="breed-suggest-item"
              role="option"
              onMouseDown={() => handleSelect(b.name)}
              onTouchEnd={(e) => { e.preventDefault(); handleSelect(b.name); }}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '15px' }}
            >
              {b.name}
              {b.origin ? <span className="breed-suggest-origin" style={{ opacity: 0.6, fontSize: '13px' }}> · {b.origin}</span> : null}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
