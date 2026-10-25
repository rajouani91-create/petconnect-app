// Schwärzen auf dem Gerät: Muster-Erkennung (gemeinsam mit dem Server), Bild-Rechtecke, PDF-Text.
// Nichts davon verlässt das Gerät, bevor die Person in der Vorschau auf „Senden“ tippt.
export { findPii, redactText, labLines, hardPiiKinds, REDACTED } from '../../supabase/functions/pet-ai-chat/pii';
export type { PiiSpan, PiiKind } from '../../supabase/functions/pet-ai-chat/pii';

/** Begriffe, die aus jedem Text entfernt werden: Name und E-Mail der angemeldeten Person (und deren Wortteile ab 4 Zeichen). */
export function knownTerms(displayName: string | null | undefined, email: string | null | undefined): string[] {
  const out = new Set<string>();
  const name = (displayName ?? '').trim();
  if (name.length >= 3) {
    out.add(name);
    for (const part of name.split(/\s+/)) if (part.length >= 4) out.add(part);
  }
  const mail = (email ?? '').trim();
  if (mail.length >= 5) {
    out.add(mail);
    const local = mail.split('@')[0];
    if (local && local.length >= 4) out.add(local);
  }
  return [...out];
}

// ---------- Bilder ----------

export const IMG_MAX_SIDE = 1600;
export const IMG_MAX_BYTES = 1_400_000;
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Zielgröße: längste Seite höchstens `max`, nie vergrößern. */
export function fitSize(w: number, h: number, max = IMG_MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Rechteck aus zwei Punkten (beliebige Zugrichtung), auf die Bildfläche begrenzt; zu kleine Rechtecke fallen weg. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number, w: number, h: number, min = 4): Rect | null {
  const x0 = Math.max(0, Math.min(ax, bx));
  const y0 = Math.max(0, Math.min(ay, by));
  const x1 = Math.min(w, Math.max(ax, bx));
  const y1 = Math.min(h, Math.max(ay, by));
  if (x1 - x0 < min || y1 - y0 < min) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Zeichnet das Bild verkleinert und deckt die Rechtecke (in Bildkoordinaten der verkleinerten Fläche) mit Schwarz ab. */
export function paintRedacted(ctx: CanvasRenderingContext2D, img: CanvasImageSource, size: { w: number; h: number }, rects: readonly Rect[]): void {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.drawImage(img, 0, 0, size.w, size.h);
  ctx.fillStyle = '#000';
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Neu kodiertes JPEG: enthält keine Metadaten (Standort, Kamera) des Originals. Senkt die Qualität, bis es klein genug ist. */
export async function canvasToJpeg(canvas: HTMLCanvasElement, maxBytes = IMG_MAX_BYTES): Promise<Blob> {
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error('image_too_large');
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- PDF ----------

export const PDF_MAX_PAGES = 6;
/** Weniger Zeichen pro Seite als dies: wahrscheinlich ein Scan ohne Textebene. */
export const PDF_MIN_CHARS_PER_PAGE = 40;

export interface PdfInfo {
  readonly pages: number;
  readonly text: string;
  readonly scanned: boolean;
}

export async function readPdf(data: ArrayBuffer): Promise<PdfInfo> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const pages = Math.min(pdf.numPages, PDF_MAX_PAGES);
  let text = '';
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Zeilenumbrüche aus der Lage der Textstücke rekonstruieren (damit Laborzeilen als Zeilen erhalten bleiben)
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5] as number;
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      else if (lastY !== null) text += ' ';
      text += item.str;
      lastY = y;
    }
    text += '\n';
  }
  const scanned = text.replace(/\s+/g, '').length < PDF_MIN_CHARS_PER_PAGE * pages;
  return { pages, text, scanned };
}

/** Rendert die ersten Seiten als Bilddaten-URLs (für gescannte PDFs; danach wie Fotos manuell schwärzen). */
export async function renderPdfPages(data: ArrayBuffer, maxPages = 3): Promise<string[]> {
  const { getDocumentProxy, renderPageAsImage } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const out: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) out.push(await renderPageAsImage(pdf, p, { scale: 1.5, toDataURL: true }));
  return out;
}
