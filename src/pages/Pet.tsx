import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { deletePet, removePhotoFile, updatePet } from '../lib/api';
import { isSpecies } from '../lib/domain';
import { canEdit } from '../lib/sharing';
import { petToForm } from '../lib/validate';
import type { PetRow } from '../lib/supabase';
import { Dialog } from '../components/Dialog';
import { PetForm } from '../components/PetForm';
import { PetSwitcher } from '../components/PetSwitcher';
import { PetAvatar } from '../components/PetAvatar';
import { PetPhotoControls } from '../components/PetPhotoControls';
import { PetSharedWith } from '../components/PetSharedWith';
import { PetRecord } from '../components/record/PetRecord';
import { MedicationCard } from '../components/record/MedicationCard';
import { MoreAboutPet } from '../components/more/MoreAboutPet';
import { IconAssistant, IconBack, IconCalendar, IconEmergency, IconList, IconPlus, KindIcon } from '../components/Icons';
import { VaccChip } from '../components/VaccChip';
import { useVaccStatus } from '../hooks/useVaccStatus';
import { SPECIES_LABEL } from '../components/SpeciesPicker';
import { BreedInfoCard, BreedInfoSkeleton } from '../components/BreedInfoCard';
import { useBreedInfo } from '../hooks/useBreedInfo';

const PET_TABS = ['overview', 'health', 'more'] as const;
type PetTab = (typeof PET_TABS)[number];
const PET_TAB_LABEL: Record<PetTab, MessageKey> = { overview: 'petTabOverview', health: 'petTabHealth', more: 'petTabMore' };

/** Stammdaten und Foto ansehen und bearbeiten, Tierakte (Gewicht, Impfungen, Dokumente), weiteres Tier anlegen, Tier löschen. */
export function Pet() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { active, upsertLocal, myRole, reload } = usePets();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { hash, key: locKey } = useLocation();
  const [tab, setTab] = useState<PetTab>(hash === '#gewicht' || hash === '#dokumente' || hash === '#medikation' ? 'health' : 'overview');
  const tabRefs = useRef(new Map<PetTab, HTMLButtonElement>());
  const uid = useId();
  const [photoOpen, setPhotoOpen] = useState(false);
  const vacc = useVaccStatus(active ? [active.id] : []);

  // „Gewicht & Verlauf“ unter „Mehr“ springt zum Reiter Gesundheit
  useEffect(() => {
    if (hash === '#gewicht' || hash === '#dokumente' || hash === '#medikation') setTab('health');
  }, [hash, locKey]);

  // „Medikament“ in den Schnellaktionen: nach dem Wechsel zum Reiter Gesundheit zur Medikation springen
  useEffect(() => {
    if (hash !== '#medikation' || tab !== 'health') return;
    document.getElementById('medikation')?.scrollIntoView({ block: 'start' });
  }, [hash, locKey, tab]);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = PET_TABS.indexOf(tab);
    const next =
      e.key === 'ArrowRight' ? PET_TABS[(i + 1) % PET_TABS.length] : e.key === 'ArrowLeft' ? PET_TABS[(i + PET_TABS.length - 1) % PET_TABS.length] : e.key === 'Home' ? PET_TABS[0] : e.key === 'End' ? PET_TABS[PET_TABS.length - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current.get(next)?.focus();
  }

  if (!active) return null;
  const role = myRole(active);
  const editable = canEdit(role);
  const pet = active;

  async function removePet() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      // Erst das Foto aus dem Speicher, danach das Tier (sonst bleibt die Datei verwaist und ist nicht mehr löschbar).
      if (pet.photo_path) await removePhotoFile(pet.photo_path);
      await deletePet(pet.id);
      await reload();
      navigate('/', { replace: true, state: { flash: t('petDeleted', { pet: pet.name }) } });
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'));
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <Link to="/tiere" className="back-link">
        <IconBack size={20} />
        {t('myPetsTitle')}
      </Link>

      <section className="card pet-hero" aria-labelledby={`${uid}-name`}>
        <div className="pet-ava pet-ava-hero">
          <PetAvatar key={pet.id} pet={pet} size={84} iconSize={40} alt={t('photoAlt', { n: pet.name })} />
        </div>
        <div className="pet-hero-text">
          <h1 id={`${uid}-name`}>{pet.name}</h1>
          <p className="muted">{speciesText(pet, t)}</p>
          <VaccChip status={vacc.get(pet.id)} />
        </div>
        {editable && (
          <button type="button" className="btn btn-ghost pet-hero-edit" aria-expanded={photoOpen} onClick={() => setPhotoOpen((o) => !o)}>
            {t('photoChange')}
          </button>
        )}
      </section>

      {editable && photoOpen && <PetPhotoControls key={`photo-${pet.id}`} pet={pet} onChange={upsertLocal} />}

      {(pet.allergies?.trim() || pet.emergency_contact?.trim()) && (
        <aside className="notice notice-warn pet-alert" aria-label={t('healthH')}>
          {pet.allergies?.trim() && <p><strong>{t('allergies')}:</strong> {pet.allergies.trim()}</p>}
          {pet.emergency_contact?.trim() && <p className="small pre"><strong>{t('emergencyContact')}:</strong> {pet.emergency_contact.trim()}</p>}
        </aside>
      )}

      <PetSharedWith pet={pet} />

      <PetSwitcher />

      <div className="tabs" role="tablist" aria-label={t('petTabsL')}>
        {PET_TABS.map((k) => (
          <button
            key={k}
            ref={(el) => {
              if (el) tabRefs.current.set(k, el);
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`${uid}-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            className="tab"
            onClick={() => setTab(k)}
            onKeyDown={onTabKey}
          >
            {t(PET_TAB_LABEL[k])}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div role="tabpanel" id={`${uid}-panel-overview`} aria-labelledby={`${uid}-tab-overview`} className="stack-lg">
          {!editing && (
            <section aria-labelledby={`${uid}-qa`} className="stack">
              <h2 id={`${uid}-qa`}>{t('qaTitle')}</h2>
              <ul className="quick-grid">
                <li><Link to="/termine" className="quick-btn"><IconCalendar size={26} />{t('apAdd')}</Link></li>
                <li><Link to={{ hash: 'medikation' }} className="quick-btn"><KindIcon kind="med" size={26} />{t('qaMed')}</Link></li>
                <li><Link to={{ hash: 'dokumente' }} className="quick-btn"><IconList size={26} />{t('qaDoc')}</Link></li>
                <li><Link to={{ hash: 'gewicht' }} className="quick-btn"><IconPlus size={26} />{t('wkAdd')}</Link></li>
                <li><Link to={`/tier/${encodeURIComponent(pet.id)}/notfallkarte`} className="quick-btn"><IconEmergency size={26} />{t('mCard')}</Link></li>
                <li><Link to="/mehr/assistent" className="quick-btn"><IconAssistant size={26} />{t('qaAi')}</Link></li>
              </ul>
            </section>
          )}
          {editing && editable ? (
            <PetForm
              key={`form-${pet.id}`}
              initial={petToForm(pet)}
              withTemplate={false}
              submitLabel={t('saveBtn')}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                const updated = await updatePet(pet.id, values);
                upsertLocal(updated);
                setEditing(false);
                setStatus(t('savedShort'));
              }}
            />
          ) : (
            <>
              <PetDetails pet={pet} />
              {(pet.species === 'dog' || pet.species === 'cat') && pet.breed && (
                <BreedInfoSection species={pet.species} breed={pet.breed} />
              )}
              <div className="actions actions-start">
                {editable && (
                  <button type="button" className="btn btn-primary" onClick={() => { setEditing(true); setStatus(''); }}>
                    {t('editBtn')}
                  </button>
                )}
                <Link to="/tier/neu" className="btn btn-secondary">
                  <IconPlus size={20} />
                  {t('addAnother')}
                </Link>
              </div>
            </>
          )}
          <p className="sr-only" role="status" aria-live="polite">{status}</p>

          {role === 'owner' && !editing && (
            <div className="danger-zone">
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy} aria-busy={busy}>
                {t('petDelete')}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'health' && (
        <div role="tabpanel" id={`${uid}-panel-health`} aria-labelledby={`${uid}-tab-health`} className="stack-lg">
          <PetRecord key={`record-${pet.id}`} pet={pet} />
          <MedicationCard key={`med-${pet.id}`} pet={pet} editable={editable} />
        </div>
      )}

      {tab === 'more' && (
        <div role="tabpanel" id={`${uid}-panel-more`} aria-labelledby={`${uid}-tab-more`} className="stack-lg">
          <MoreAboutPet pet={pet} />
        </div>
      )}

      <Dialog
        open={confirmDelete}
        title={t('petDeleteTitle', { pet: pet.name })}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-danger" onClick={() => void removePet()}>{t('petDeleteYes')}</button>
          </>
        }
      >
        <p>{t('petDeleteAsk', { pet: pet.name })}</p>
      </Dialog>
    </div>
  );
}

function BreedInfoSection({ species, breed }: { species: 'dog' | 'cat'; breed: string }) {
  const { info, loading } = useBreedInfo(species, breed);
  if (loading) return <BreedInfoSkeleton />;
  if (!info) return null;
  return <BreedInfoCard info={info} />;
}

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function speciesText(p: PetRow, t: T): string {
  const sp = isSpecies(p.species) ? (p.species === 'other' && p.species_other ? p.species_other : t(SPECIES_LABEL[p.species])) : p.species;
  return [sp, p.breed].filter(Boolean).join(' · ');
}

function PetDetails({ pet }: { pet: PetRow }) {
  const { t, lang } = useI18n();
  const dash = <span className="muted">{t('notSet')}</span>;
  const val = (v: string | null | undefined) => (v && v.trim() ? v : dash);
  const sex = pet.sex === 'female' ? t('sexF') : pet.sex === 'male' ? t('sexM') : null;

  return (
    <>
      <section className="card" aria-labelledby="master-h">
        <h2 id="master-h">{t('masterH')}</h2>
        <dl className="kv">
          <dt>{t('nav_pet')}</dt>
          <dd>{speciesText(pet, t) || dash}</dd>
          {pet.species === 'cat' && (
            <>
              <dt>{t('keeping')}</dt>
              <dd>{pet.cat_outdoor === null ? dash : t(pet.cat_outdoor ? 'spCatOut' : 'spCatIn')}</dd>
            </>
          )}
          {pet.species === 'horse' && (
            <>
              <dt>{t('stable')}</dt>
              <dd>{val(pet.stable)}</dd>
            </>
          )}
          <dt>{t('sex')}</dt>
          <dd>{sex ?? dash}</dd>
          <dt>{t('birth')}</dt>
          <dd>{pet.birth_date ? formatIsoDate(pet.birth_date, lang) : dash}</dd>
          <dt>{t('chip')}</dt>
          <dd className="mono">{val(pet.chip_no)}</dd>
        </dl>
      </section>
      <section className="card" aria-labelledby="health-h">
        <h2 id="health-h">{t('healthH')}</h2>
        <dl className="kv">
          <dt>{t('allergies')}</dt>
          <dd>{val(pet.allergies)}</dd>
          <dt>{t('emergencyContact')}</dt>
          <dd className="pre">{val(pet.emergency_contact)}</dd>
        </dl>
      </section>
    </>
  );
}
