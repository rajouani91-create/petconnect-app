import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { listDocuments, signedDocumentUrl, type DocumentRow } from '../../lib/api';
import type { AiAttachment } from '../../lib/ai';
import { checkDocFile, DOC_ACCEPT } from '../../lib/record';
import {
  blobToBase64, canvasToJpeg, fitSize, hardPiiKinds, knownTerms, labLines, paintRedacted, readPdf, rectFromPoints, redactText, renderPdfPages,
  type Rect,
} from '../../lib/redact';

/** Muss zum Server passen (safety.ts: MAX_ATTACH_TEXT). */
const TEXT_MAX = 6000;

export interface Prepared {
  readonly att: AiAttachment;
  readonly label: string;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'text'; name: string; raw: string; pages: number }
  | { kind: 'image'; name: string; pages: string[] };

interface Props {
  readonly petId: string;
  readonly disabled: boolean;
  readonly value: Prepared | null;
  readonly onChange: (v: Prepared | null) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('image_load')));
    img.src = src;
  });
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.addEventListener('load', () => resolve(String(r.result)));
    r.addEventListener('error', () => reject(new Error('read')));
    r.readAsDataURL(b);
  });
}

/** Anhang vorbereiten: alles Schwärzen passiert hier auf dem Gerät; erst „Übernehmen“ gibt den bereinigten Inhalt frei. */
export function AttachPanel({ petId, disabled, value, onChange }: Props) {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<MessageKey | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [consent, setConsent] = useState(false);
  // Text
  const [mode, setMode] = useState<'labs' | 'full'>('labs');
  const [preview, setPreview] = useState('');
  const [removed, setRemoved] = useState(0);
  // Bild
  const [pageIdx, setPageIdx] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [drag, setDrag] = useState<Rect | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const known = knownTerms(profile?.display_name, user?.email);
  const knownKey = known.join('|');

  useEffect(() => {
    if (!open || !petId) {
      setDocs([]);
      return;
    }
    let live = true;
    listDocuments(petId).then((d) => { if (live) setDocs(d); }, () => { if (live) setDocs([]); });
    return () => { live = false; };
  }, [open, petId]);

  // Textvorschau neu berechnen, wenn die Auswahl oder der Modus wechselt (Bearbeitungen der Person gehen dabei verloren – so gewollt)
  useEffect(() => {
    if (step.kind !== 'text') return;
    const base = mode === 'labs' ? labLines(step.raw).join('\n') : step.raw;
    const r = redactText(base, knownKey ? knownKey.split('|') : []);
    setPreview(r.text.slice(0, TEXT_MAX));
    setRemoved(r.count);
  }, [step, mode, knownKey]);

  // Bildfläche zeichnen
  useEffect(() => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (step.kind !== 'image' || !c || !img) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    paintRedacted(ctx, img, sizeRef.current, rects);
    if (drag) {
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.strokeRect(drag.x, drag.y, drag.w, drag.h);
    }
  }, [step, pageIdx, rects, drag]);

  function reset() {
    setStep({ kind: 'idle' });
    setError(null);
    setConsent(false);
    setRects([]);
    setDrag(null);
    setPageIdx(0);
    imgRef.current = null;
  }
  function close() {
    reset();
    setOpen(false);
  }

  async function showPage(src: string, idx: number) {
    const img = await loadImage(src);
    imgRef.current = img;
    sizeRef.current = fitSize(img.naturalWidth, img.naturalHeight);
    const c = canvasRef.current;
    if (c) {
      c.width = sizeRef.current.w;
      c.height = sizeRef.current.h;
    }
    setRects([]);
    setPageIdx(idx);
  }

  async function prepare(blob: Blob, name: string, mime: string) {
    setError(null);
    setStep({ kind: 'loading' });
    try {
      if (mime === 'application/pdf') {
        const data = await blob.arrayBuffer();
        const info = await readPdf(data);
        if (!info.scanned) {
          setMode('labs');
          setStep({ kind: 'text', name, raw: info.text, pages: info.pages });
          return;
        }
        const pages = await renderPdfPages(data, 3);
        setStep({ kind: 'image', name, pages });
        return;
      }
      setStep({ kind: 'image', name, pages: [await blobToDataUrl(blob)] });
    } catch {
      setStep({ kind: 'idle' });
      setError('aiAttErrRead');
    }
  }

  // Wenn ein Bild-Schritt beginnt, ist das Canvas erst nach dem Rendern da
  useEffect(() => {
    if (step.kind === 'image') void showPage(step.pages[0]!, 0).catch(() => { setStep({ kind: 'idle' }); setError('aiAttErrRead'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind === 'image' ? step.pages : null]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ck = checkDocFile(f);
    if (!ck.ok) {
      setError(ck.error);
      return;
    }
    await prepare(f, f.name, ck.mime);
  }

  async function onStored(id: string) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    setError(null);
    setStep({ kind: 'loading' });
    try {
      const url = await signedDocumentUrl(d.storage_path, 60);
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch');
      await prepare(await res.blob(), d.title, d.mime_type);
    } catch {
      setStep({ kind: 'idle' });
      setError('aiAttErrRead');
    }
  }

  function pos(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const b = c.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * c.width, y: ((e.clientY - b.top) / b.height) * c.height };
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = pos(e);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const s = startRef.current;
    if (!s) return;
    const p = pos(e);
    setDrag(rectFromPoints(s.x, s.y, p.x, p.y, sizeRef.current.w, sizeRef.current.h, 1));
  }
  function up(e: PointerEvent<HTMLCanvasElement>) {
    const s = startRef.current;
    startRef.current = null;
    setDrag(null);
    if (!s) return;
    const p = pos(e);
    const r = rectFromPoints(s.x, s.y, p.x, p.y, sizeRef.current.w, sizeRef.current.h);
    if (r) setRects((old) => [...old, r]);
  }

  const hard = step.kind === 'text' ? hardPiiKinds(preview) : [];
  const textBad = step.kind === 'text' && (preview.trim().length < 10 || hard.length > 0);
  const canTake = consent && step.kind !== 'idle' && step.kind !== 'loading' && !textBad;

  async function take() {
    if (step.kind === 'text') {
      onChange({ att: { kind: 'text', text: preview.trim() }, label: step.name });
      close();
    } else if (step.kind === 'image' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx || !imgRef.current) return;
      paintRedacted(ctx, imgRef.current, sizeRef.current, rects); // ohne Auswahlrahmen
      try {
        const data = await blobToBase64(await canvasToJpeg(canvasRef.current));
        onChange({ att: { kind: 'image', mime: 'image/jpeg', data }, label: step.name });
        close();
      } catch {
        setError('aiAttErrBig');
      }
    }
  }

  if (value) {
    return (
      <p className="ai-attached">
        <span>{t('aiAttReady', { name: value.label })}</span>
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => onChange(null)}>{t('aiAttRemove')}</button>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary ai-attach-open" disabled={disabled} onClick={() => setOpen(true)}>{t('aiAttOpen')}</button>
    );
  }

  return (
    <section className="ai-attach stack" aria-label={t('aiAttTitle')}>
      <h2>{t('aiAttTitle')}</h2>
      <p className="ai-meta">{t('aiAttIntro')}</p>

      <div className="ai-attach-pick">
        <label className="btn btn-secondary">
          {t('aiAttFile')}
          <input type="file" accept={DOC_ACCEPT} className="sr-only" onChange={(e) => void onFile(e)} />
        </label>
        {docs.length > 0 && (
          <label className="ai-pet">
            <span>{t('aiAttStored')}</span>
            <select value="" onChange={(e) => void onStored(e.target.value)}>
              <option value="">{t('aiAttChoose')}</option>
              {docs.map((d) => (<option key={d.id} value={d.id}>{d.title}</option>))}
            </select>
          </label>
        )}
      </div>

      {error && <p className="notice notice-crit" role="alert">{t(error)}</p>}
      {step.kind === 'loading' && <p role="status" className="ai-wait">{t('aiAttLoading')}</p>}

      {step.kind === 'text' && (
        <div className="stack">
          <fieldset className="ai-modes">
            <legend>{t('aiAttMode')}</legend>
            <label><input type="radio" name="ai-mode" checked={mode === 'labs'} onChange={() => setMode('labs')} /> {t('aiAttModeLabs')}</label>
            <label><input type="radio" name="ai-mode" checked={mode === 'full'} onChange={() => setMode('full')} /> {t('aiAttModeFull')}</label>
          </fieldset>
          <label className="ai-pet" htmlFor="ai-att-text">
            <span>{t('aiAttPreview')}</span>
            <textarea id="ai-att-text" rows={9} maxLength={TEXT_MAX} value={preview} onChange={(e) => setPreview(e.target.value)} />
          </label>
          <p className="ai-meta">{t('aiAttRemoved', { n: removed })}</p>
          {hard.length > 0 && <p className="notice notice-crit" role="alert">{t('aiAttHard')}</p>}
          {preview.trim().length < 10 && <p className="ai-meta">{t('aiAttEmpty')}</p>}
        </div>
      )}

      {step.kind === 'image' && (
        <div className="stack">
          <p className="ai-meta">{t('aiAttDraw')}</p>
          {step.pages.length > 1 && (
            <label className="ai-pet">
              <span>{t('aiAttPage')}</span>
              <select value={pageIdx} onChange={(e) => { const i = Number(e.target.value); void showPage(step.pages[i]!, i); }}>
                {step.pages.map((_, i) => (<option key={i} value={i}>{i + 1}</option>))}
              </select>
            </label>
          )}
          <canvas
            ref={canvasRef}
            className="ai-canvas"
            aria-label={t('aiAttCanvas')}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { startRef.current = null; setDrag(null); }}
          />
          <div className="ai-actions">
            <button type="button" className="btn btn-secondary" disabled={rects.length === 0} onClick={() => setRects((r) => r.slice(0, -1))}>{t('aiAttUndo')}</button>
            <span className="ai-meta">{t('aiAttBoxes', { n: rects.length })}</span>
          </div>
        </div>
      )}

      {(step.kind === 'text' || step.kind === 'image') && (
        <>
          <label className="ai-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('aiAttConsent')}</span>
          </label>
          <p className="ai-meta">{t('aiAttLimit')}</p>
        </>
      )}
      <div className="ai-actions">
        <button type="button" className="btn btn-primary" disabled={!canTake} onClick={() => void take()}>{t('aiAttTake')}</button>
        <button type="button" className="btn btn-secondary" onClick={close}>{t('aiAttCancel')}</button>
      </div>
    </section>
  );
}
