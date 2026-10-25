// Position der schwebenden KI-Schaltfläche: Begrenzung auf den sichtbaren Bereich und sicheres Lesen aus dem Browser-Speicher.

export interface FabPos {
  /** Abstand vom linken Rand in Pixeln */
  x: number;
  /** Abstand vom oberen Rand in Pixeln */
  y: number;
}
export interface FabBox {
  width: number;
  height: number;
  /** Platz oben (Kopfzeile) und unten (Navigation), den der Button nicht verdecken soll */
  top: number;
  bottom: number;
  /** Seitenabstand */
  side: number;
  /** Eigener linker Rand (z. B. breite Seitenleiste am Computer); ohne Angabe gilt `side` */
  left?: number;
}

export const FAB_STORAGE_KEY = 'pc.ai.fab';
export const FAB_SIZE = 56;

/** Hält die Position innerhalb des Fensters (abzüglich Kopfzeile, Navigation und Seitenabstand). */
export function clampPos(p: FabPos, box: FabBox, size = FAB_SIZE): FabPos {
  const minX = box.left ?? box.side;
  const maxX = Math.max(minX, box.width - size - box.side);
  const maxY = Math.max(box.top, box.height - size - box.bottom);
  return {
    x: Math.min(Math.max(p.x, minX), maxX),
    y: Math.min(Math.max(p.y, box.top), maxY),
  };
}

/** Startposition: unten rechts über der Navigation. */
export function defaultPos(box: FabBox, size = FAB_SIZE): FabPos {
  return clampPos({ x: box.width - size - box.side, y: box.height - size - box.bottom }, box, size);
}

/** Liest eine gespeicherte Position. Ungültige oder fremde Werte ergeben null. */
export function parsePos(raw: string | null): FabPos | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y };
  } catch {
    /* ungültig */
  }
  return null;
}

/** Wie weit der Zeiger bewegt werden muss, bevor es als Ziehen und nicht mehr als Tippen zählt. */
export const DRAG_THRESHOLD = 6;
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD;
}
