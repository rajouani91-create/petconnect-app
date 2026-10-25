import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { IconAssistant } from './Icons';
import { FAB_SIZE, FAB_STORAGE_KEY, clampPos, defaultPos, isDrag, parsePos, type FabBox, type FabPos } from '../lib/fab';

/** Seiten, auf denen der Button nichts zu suchen hat (der Assistent selbst, Notfall). */
const HIDDEN_ON = ['/mehr/assistent', '/notfall'];

function measure(): FabBox {
  const wide = window.matchMedia('(min-width: 900px)').matches;
  // Kopfzeile oben; unten die Navigation (Handy) bzw. nur ein kleiner Rand (Computer, Navigation steht links)
  return { width: window.innerWidth, height: window.innerHeight, top: 72, bottom: wide ? 16 : 76, side: 12, left: wide ? 232 + 12 : 12 };
}

function readSaved(): FabPos | null {
  try {
    return parsePos(localStorage.getItem(FAB_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Schwebender KI-Button: auf jeder Seite sichtbar, per Finger oder Maus verschiebbar, merkt sich seinen Platz. */
export function AssistantFab() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [pos, setPos] = useState<FabPos>(() => {
    const box = measure();
    return clampPos(readSaved() ?? defaultPos(box), box);
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Bei Drehen oder Größenänderung im sichtbaren Bereich halten
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p, measure()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (HIDDEN_ON.includes(pathname)) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && !isDrag(dx, dy)) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setPos(clampPos({ x: d.originX + dx, y: d.originY + dy }, measure()));
  };

  const finish = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) {
      // Das anschließende Klick-Ereignis soll die Seite nicht öffnen
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      setDragging(false);
      setPos((p) => {
        const next = clampPos(p, measure());
        try {
          localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* Speicher nicht verfügbar: Position gilt nur für diese Sitzung */
        }
        return next;
      });
    }
  };

  return (
    <Link
      to="/mehr/assistent"
      className={`ai-fab${dragging ? ' is-dragging' : ''}`}
      style={{ left: pos.x, top: pos.y, width: FAB_SIZE, height: FAB_SIZE }}
      aria-label={t('aiMenu')}
      title={t('aiMenu')}
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(e) => {
        if (suppressClick.current) e.preventDefault();
      }}
    >
      <IconAssistant size={28} />
    </Link>
  );
}
