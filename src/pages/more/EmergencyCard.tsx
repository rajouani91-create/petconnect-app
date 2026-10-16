import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../../auth/AuthProvider';
import { usePets } from '../../pets/PetsProvider';
import { profileNames, updateEmergency } from '../../lib/api';
import { PHONE_MAX, VET_NAME_MAX, telHref } from '../../lib/care';
import { recordErrorKey } from '../../lib/record';
import { normalizeChip } from '../../lib/validate';
import type { PetRow } from '../../lib/supabase';
import type { MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import { IconEmergency, IconPhone } from '../../components/Icons';
import { PetAvatar } from '../../components/PetAvatar';
import { BackToRecord, PetSubpage, Phone, Val, speciesName } from '../../components/more/shared';
import { StatusLine, useFocusAfter, useStatus } from '../../components/record/shared';

/** Notfallkarte: das Wichtigste auf einen Blick, druckbar im Kartenformat. */
export function EmergencyCard() {
  return <PetSubpage>{(pet, _role, editable) => <EmergencyCardView key={pet.id} pet={pet} editable={editable} />}</PetSubpage>;
}

function EmergencyCardView({ pet, editable }: { pet: PetRow; editable: boolean }) {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const { upsertLocal } = usePets();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useStatus();
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const { register, focusLater } = useFocusAfter();

  // Anzeigename der Haupthalter:in (bei Mitbetreuenden ein anderes Profil)
  useEffect(() => {
    if (pet.owner_id === user?.id) {
      setOwnerName(profile?.display_name ?? null);
      return;
    }
    let alive = true;
    profileNames([pet.owner_id])
      .then((m) => alive && setOwnerName(m.get(pet.owner_id) ?? null))
      .catch(() => alive && setOwnerName(null));
    return () => {
      alive = false;
    };
  }, [pet.owner_id, user?.id, profile?.display_name]);

  const vetHref = pet.vet_phone ? telHref(pet.vet_phone) : null;

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <section className="card stack print-card" aria-labelledby="ec-h">
        <div className="ec-head">
          <span className="emergency-icon no-print" aria-hidden="true">
            <IconEmergency size={28} />
          </span>
          <div>
            <h1 id="ec-h">{t('cTitle', { n: pet.name })}</h1>
            <p className="muted">{t('cSub')}</p>
          </div>
        </div>

        <div className="ec-pet">
          <span className="pet-ava-sm" aria-hidden="true">
            <PetAvatar pet={pet} size={56} iconSize={30} />
          </span>
          <div>
            <p className="ec-pet-name">{pet.name}</p>
            <p className="muted">{[speciesName(pet, t), pet.breed].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        <dl className="kv ec-kv">
          <dt>{t('cOwner')}</dt>
          <dd><Val v={ownerName} /></dd>
          <dt>{t('cOwnerPhone')}</dt>
          <dd><Phone v={pet.owner_phone} /></dd>
          <dt>{t('chip')}</dt>
          <dd className="mono"><Val v={pet.chip_no} /></dd>
          <dt>{t('cAllergies')}</dt>
          <dd><Val v={pet.allergies} pre /></dd>
          <dt>{t('medications')}</dt>
          <dd><Val v={pet.medications} pre /></dd>
          <dt>{t('cVet')}</dt>
          <dd><Val v={pet.vet_name} /></dd>
          <dt>{t('cVetPhone')}</dt>
          <dd><Phone v={pet.vet_phone} /></dd>
          <dt>{t('emergencyContact')}</dt>
          <dd><Val v={pet.emergency_contact} pre /></dd>
        </dl>

        {vetHref ? (
          <a className="btn btn-emergency btn-block no-print" href={vetHref}>
            <IconPhone size={20} />
            {t('sosCall')}
          </a>
        ) : (
          <p className="notice notice-warn">{t('sosNoPrac')}</p>
        )}
      </section>

      <div className="actions actions-start no-print">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>{t('cPrint')}</button>
        {editable && !editing && (
          <button type="button" ref={register('edit')} className="btn btn-primary" onClick={() => { setEditing(true); setStatus(''); }}>
            {t('editBtn')}
          </button>
        )}
      </div>

      {editable && editing && (
        <section className="card no-print">
          <EmergencyForm
            pet={pet}
            onCancel={() => {
              setEditing(false);
              focusLater('edit');
            }}
            onSaved={(p) => {
              upsertLocal(p);
              setEditing(false);
              setStatus(t('savedShort'));
              focusLater('edit');
            }}
          />
        </section>
      )}

      <section className="card stack" aria-labelledby="ec-way-h">
        <h2 id="ec-way-h">{t('sosTipsT')}</h2>
        <ul className="tip-list">
          <li>{t('sosTip1')}</li>
          <li>{t('sosTip2')}</li>
          <li>{t('sosTip3')}</li>
        </ul>
        <p className="muted small">{t('sosNote')}</p>
      </section>
      <StatusLine status={status} />
    </div>
  );
}

type F = 'ownerPhone' | 'chip' | 'allergies' | 'medications' | 'vetName' | 'vetPhone' | 'contact';

function EmergencyForm({ pet, onSaved, onCancel }: { pet: PetRow; onSaved: (p: PetRow) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<Record<F, string>>({
    ownerPhone: pet.owner_phone ?? '',
    chip: pet.chip_no ?? '',
    allergies: pet.allergies ?? '',
    medications: pet.medications ?? '',
    vetName: pet.vet_name ?? '',
    vetPhone: pet.vet_phone ?? '',
    contact: pet.emergency_contact ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<F, MessageKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, []);

  const set = (k: F, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const fe = (k: F) => (errors[k] ? { key: errors[k] } : undefined);
  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: Partial<Record<F, MessageKey>> = {};
    if (v.ownerPhone.length > PHONE_MAX) errs.ownerPhone = 'cErrPhone';
    if (v.vetPhone.length > PHONE_MAX) errs.vetPhone = 'cErrPhone';
    if (v.vetName.length > VET_NAME_MAX) errs.vetName = 'apErrTitleLong';
    const chip = normalizeChip(v.chip);
    if (chip && !/^\d{15}$/.test(chip)) errs.chip = 'err_chip';
    setErrors(errs);
    const first = (['ownerPhone', 'chip', 'vetName', 'vetPhone'] as F[]).find((k) => errs[k]);
    if (first) {
      form.current?.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${first}`)}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const p = await updateEmergency(pet.id, {
        owner_phone: orNull(v.ownerPhone),
        chip_no: orNull(normalizeChip(v.chip)),
        allergies: orNull(v.allergies),
        medications: orNull(v.medications),
        vet_name: orNull(v.vetName),
        vet_phone: orNull(v.vetPhone),
        emergency_contact: orNull(v.contact),
      });
      onSaved(p);
    } catch (err) {
      console.error(err);
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  const text = (k: F, label: MessageKey, opts: { type?: string; max?: number; area?: boolean; hint?: MessageKey; inputMode?: 'tel' | 'numeric' } = {}) => (
    <Field id={`${uid}-${k}`} label={t(label)} hint={opts.hint ? t(opts.hint) : undefined} error={fe(k)} optional>
      {(a) =>
        opts.area ? (
          <textarea {...a} rows={3} value={v[k]} onChange={(e) => set(k, e.target.value)} />
        ) : (
          <input {...a} type={opts.type ?? 'text'} inputMode={opts.inputMode} maxLength={opts.max} autoComplete="off" value={v[k]} onChange={(e) => set(k, e.target.value)} />
        )
      }
    </Field>
  );

  return (
    <form ref={form} className="stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('cEditTitle')}</h2>
      {text('ownerPhone', 'cOwnerPhone', { type: 'tel', max: PHONE_MAX, inputMode: 'tel' })}
      {text('chip', 'chip', { inputMode: 'numeric', hint: 'cChipHint' })}
      {text('allergies', 'cAllergies', { area: true })}
      {text('medications', 'medications', { area: true })}
      {text('vetName', 'cVet', { max: VET_NAME_MAX })}
      {text('vetPhone', 'cVetPhone', { type: 'tel', max: PHONE_MAX, inputMode: 'tel' })}
      {text('contact', 'emergencyContact', { area: true, hint: 'emergencyContactHint' })}
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
