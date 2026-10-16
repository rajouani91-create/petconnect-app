// Tierfoto: Größe berechnen und im Browser verkleinern, bevor es hochgeladen wird.

export const PHOTO_MAX_SIDE = 1200;
export const PHOTO_QUALITY = 0.85;
/** Grenze des Speichers (Bucket pet-photos) */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Vor dem Verkleinern: größere Dateien lehnen wir gleich ab (Handyfotos liegen meist bei 2–8 MB). */
export const PHOTO_MAX_INPUT_BYTES = 30 * 1024 * 1024;

export type PhotoErrorCode = 'type' | 'tooBig' | 'decode';

export class PhotoError extends Error {
  readonly code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) {
    super(`photo_${code}`);
    this.name = 'PhotoError';
    this.code = code;
  }
}

/** Zielgröße: längste Seite höchstens `max`, Seitenverhältnis bleibt, nie vergrößern. */
export function fitSize(width: number, height: number, max: number = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const f = max / longest;
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) };
}

/** Bilddateien, die der Browser als Bild meldet (HEIC kann je nach Browser fehlschlagen → 'decode'). */
export function isImageFile(file: { type: string }): boolean {
  return file.type.startsWith('image/');
}

/**
 * Datei → JPEG-Blob, längste Seite ≤ 1200 px, Ausrichtung aus EXIF übernommen.
 * Wirft PhotoError mit verständlichem Code.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (!isImageFile(file)) throw new PhotoError('type');
  if (file.size > PHOTO_MAX_INPUT_BYTES) throw new PhotoError('tooBig');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('decode');
  }
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height);
    if (width === 0) throw new PhotoError('decode');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('decode');
    // Weißer Grund, damit transparente PNGs im JPEG nicht schwarz werden
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    if (!blob) throw new PhotoError('decode');
    if (blob.size > PHOTO_MAX_BYTES) throw new PhotoError('tooBig');
    return blob;
  } finally {
    bitmap.close();
  }
}
