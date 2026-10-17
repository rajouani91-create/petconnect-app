import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { geocodePlace, type PlaceHit } from '../../lib/api';

export const placeLabel = (h: PlaceHit) => [h.postcode, h.place].filter(Boolean).join(' ');

/**
 * „Ort oder PLZ“ als Combobox (WAI-ARIA 1.2, Liste mit Vorschlägen aus geocode_place).
 * Pfeiltasten wählen, Enter übernimmt (ohne Auswahl: erster Vorschlag), Escape schließt.
 */
export function PlaceCombobox({
  value,
  onValue,
  onPick,
  onError,
}: {
  value: string;
  onValue: (v: string) => void;
  onPick: (hit: PlaceHit) => void;
  onError: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const listId = `${uid}-list`;
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [noHit, setNoHit] = useState(false);
  const typed = useRef(false);
  const seq = useRef(0);

  // Vorschläge laden, sobald getippt wird (kurz warten, damit nicht jeder Buchstabe eine Abfrage auslöst)
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 2 || /^\d{1,4}$/.test(q)) {
      setHits([]);
      setOpen(false);
      setNoHit(false);
      return;
    }
    const my = ++seq.current;
    const timer = setTimeout(() => {
      geocodePlace(q)
        .then((h) => {
          if (my !== seq.current) return;
          setHits(h);
          setOpen(h.length > 0);
          setActive(-1);
          setNoHit(h.length === 0);
        })
        .catch((e: unknown) => {
          console.error(e);
          if (my === seq.current) onError();
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, onError]);

  function pick(h: PlaceHit) {
    typed.current = false;
    seq.current++;
    setOpen(false);
    setActive(-1);
    setHits([]);
    setNoHit(false);
    onPick(h);
  }

  async function pickFirst() {
    const q = value.trim();
    if (!q) return;
    try {
      const h = hits.length > 0 ? hits : await geocodePlace(q);
      if (h[0]) pick(h[0]);
      else {
        setNoHit(true);
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
      onError();
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && hits.length > 0) setOpen(true);
      setActive((a) => (hits.length === 0 ? -1 : (a + 1) % hits.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (hits.length === 0 ? -1 : a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = open && active >= 0 ? hits[active] : undefined;
      if (h) pick(h);
      else void pickFirst();
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  return (
    <div className="field combo">
      <label htmlFor={`${uid}-in`}>{t('psPlace')}</label>
      <div className="combo-row">
        <input
          id={`${uid}-in`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
          aria-describedby={noHit ? `${uid}-none` : undefined}
          autoComplete="postal-code"
          inputMode="search"
          value={value}
          onChange={(e) => {
            typed.current = true;
            onValue(e.target.value);
          }}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button type="button" className="btn btn-primary" onClick={() => void pickFirst()}>{t('psSearch')}</button>
      </div>
      <div id={listId} role="listbox" aria-label={t('psPlaceList')} className="combo-list" hidden={!open}>
        {hits.map((h, i) => (
          <div
            key={`${h.postcode}-${h.place ?? ''}`}
            id={`${uid}-opt-${i}`}
            role="option"
            tabIndex={-1}
            aria-selected={i === active}
            className={i === active ? 'is-active' : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(h);
            }}
          >
            {placeLabel(h)}
          </div>
        ))}
      </div>
      {noHit && <p className="error" id={`${uid}-none`}>{t('psPlaceNone')}</p>}
    </div>
  );
}
