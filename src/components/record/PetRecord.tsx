import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { usePets } from '../../pets/PetsProvider';
import { profileNames } from '../../lib/api';
import { canEdit } from '../../lib/sharing';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { DocumentSection } from './DocumentSection';
import { VaccinationSection } from './VaccinationSection';
import { WeightSection } from './WeightSection';

const TABS = ['weight', 'vacc', 'docs'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, MessageKey> = { weight: 'recWeight', vacc: 'recVacc', docs: 'recDocs' };

/** Tierakte unter dem Profil: Reiter Gewicht, Impfungen, Dokumente. Nur ansehen: ohne Knöpfe, mit Hinweis. */
export function PetRecord({ pet }: { pet: PetRow }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { myRole, memberships } = usePets();
  const uid = useId();
  const [tab, setTab] = useState<Tab>('weight');
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const today = zonedNow(useNow()).date;
  const editable = canEdit(myRole(pet));
  const { hash, key: locKey } = useLocation();

  // „Gewicht & Verlauf“ unter „Mehr zu …“: Reiter Gewicht wählen und dorthin springen
  useEffect(() => {
    if (hash !== '#gewicht') return;
    setTab('weight');
    const el = tabRefs.current.get('weight');
    el?.scrollIntoView({ block: 'start' });
    el?.focus();
  }, [hash, locKey]);

  // Namen für „eingetragen von …“: alle Betreuer dieses Tiers (nicht lesbare Profile fehlen einfach)
  const memberKey = memberships.filter((m) => m.pet_id === pet.id).map((m) => m.user_id).sort().join(',');
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    const ids = memberKey ? memberKey.split(',') : [];
    if (ids.length < 2) {
      setNames(new Map());
      return;
    }
    profileNames(ids)
      .then((n) => alive && setNames(n))
      .catch(() => alive && setNames(new Map()));
    return () => {
      alive = false;
    };
  }, [memberKey]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current.get(next)?.focus();
  }

  const common = { petId: pet.id, editable, today, myId: user?.id, names };

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('recTitle')}</h2>
      {!editable && <p className="notice notice-info">{t('recViewOnly')}</p>}
      <div className="tabs" role="tablist" aria-labelledby={`${uid}-h`}>
        {TABS.map((k) => (
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
            onKeyDown={onKey}
          >
            {t(TAB_LABEL[k])}
          </button>
        ))}
      </div>
      {TABS.map((k) => (
        <div key={k} role="tabpanel" id={`${uid}-panel-${k}`} aria-labelledby={`${uid}-tab-${k}`} hidden={tab !== k}>
          {tab === k && k === 'weight' && <WeightSection key={pet.id} {...common} />}
          {tab === k && k === 'vacc' && <VaccinationSection key={pet.id} {...common} />}
          {tab === k && k === 'docs' && <DocumentSection key={pet.id} {...common} />}
        </div>
      ))}
    </section>
  );
}
