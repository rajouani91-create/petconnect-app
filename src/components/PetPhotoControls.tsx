import { useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { clearPetPhoto, replacePetPhoto } from '../lib/api';
import { PhotoError, shrinkPhoto } from '../lib/photo';
import type { PetRow } from '../lib/supabase';
import { IconTrash } from './Icons';

const PHOTO_ERR: Record<PhotoError['code'], MessageKey> = {
  type: 'photoErrType',
  tooBig: 'photoErrBig',
  decode: 'photoErrDecode',
};

/** Foto hinzufügen, ändern, entfernen (Besitzer und Mithalter:innen). */
export function PetPhotoControls({ pet, onChange }: { pet: PetRow; onChange: (pet: PetRow) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setStatus({ text: t('photoSaving'), ok: true });
    try {
      const jpeg = await shrinkPhoto(file);
      onChange(await replacePetPhoto(pet, jpeg));
      setStatus({ text: t('photoSaved', { n: pet.name }), ok: true });
    } catch (err) {
      if (err instanceof PhotoError) setStatus({ text: t(PHOTO_ERR[err.code]), ok: false });
      else {
        console.error(err);
        setStatus({ text: t('photoErrUpload'), ok: false });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChange(await clearPetPhoto(pet));
      setStatus({ text: t('photoRemoved', { n: pet.name }), ok: true });
    } catch (err) {
      console.error(err);
      setStatus({ text: t('errGeneric'), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack photo-controls">
      <div className="actions actions-start">
        <button type="button" className="btn btn-secondary" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
          {t(pet.photo_path ? 'photoChange' : 'photoAdd')}
        </button>
        {pet.photo_path && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>
            <IconTrash size={20} />
            {t('photoRemove')}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e)} />
      <p className={status.text ? `notice ${status.ok ? 'notice-ok' : 'notice-crit'}` : 'sr-only'} role="status" aria-live="polite">
        {status.text}
      </p>
    </div>
  );
}
