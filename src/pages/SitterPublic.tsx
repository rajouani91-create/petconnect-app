import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDateShort } from '../i18n';
import { sitterView } from '../lib/api';
import { isSitterToken, telHref, type SitterView } from '../lib/care';
import { LogoMark, IconPhone } from '../components/Icons';
import { Loading } from '../components/Loading';
import { Phone, Val, speciesName } from '../components/more/shared';

/** Meta-Tag setzen und beim Verlassen der Seite wiederherstellen */
function useMeta(name: string, content: string) {
  useEffect(() => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    const created = !el;
    const before = el?.content ?? null;
    if (!el) {
      el = document.createElement('meta');
      el.name = name;
      document.head.prepend(el);
    }
    el.content = content;
    return () => {
      if (created) el?.remove();
      else if (el && before !== null) el.content = before;
    };
  }, [name, content]);
}

/**
 * Öffentliche Sitter-Ansicht: ohne Anmeldung, ruft nur sitter_view auf.
 * Der Code aus der Adresse wird nirgends ausgegeben (keine Logs, keine Fehlertexte).
 */
export function SitterPublic() {
  const { t, lang } = useI18n();
  const { token } = useParams();
  const [view, setView] = useState<SitterView | 'loading' | 'error'>('loading');
  useMeta('robots', 'noindex, nofollow');
  useMeta('referrer', 'no-referrer');

  useEffect(() => {
    if (!isSitterToken(token)) {
      setView({ status: 'invalid' });
      return;
    }
    let alive = true;
    sitterView(token)
      .then((v) => alive && setView(v))
      .catch(() => alive && setView('error'));
    return () => {
      alive = false;
    };
  }, [token]);

  const date = (iso: string) => formatIsoDateShort(iso, lang);

  return (
    <div className="public-page">
      <header className="auth-top">
        <span className="brand">
          <LogoMark />
          <span>PetConnect</span>
        </span>
      </header>
      <main id="main" className="public-main">
        {view === 'loading' && <Loading />}
        {view === 'error' && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
        {view !== 'loading' && view !== 'error' && view.status === 'invalid' && (
          <section className="card stack">
            <h1>{t('svTitleShort')}</h1>
            <p className="notice notice-warn" role="status">{t('svInvalid')}</p>
          </section>
        )}
        {view !== 'loading' && view !== 'error' && view.status === 'not_yet' && (
          <section className="card stack">
            <h1>{t('svTitle', { n: view.pet_name })}</h1>
            <p className="notice notice-info" role="status">{t('svNotYet', { d: date(view.valid_from) })}</p>
          </section>
        )}
        {view !== 'loading' && view !== 'error' && view.status === 'ok' && (
          <div className="stack-lg">
            <section className="card stack" aria-labelledby="sv-h">
              <h1 id="sv-h">{t('svTitle', { n: view.pet.name })}</h1>
              <p className="muted">{t('svFor', { x: view.sitter_name, d: date(view.valid_to) })}</p>
              <p className="muted">{[speciesName(view.pet, t), view.pet.breed].filter(Boolean).join(' · ')}</p>
            </section>

            <section className="card stack" aria-labelledby="sv-feed">
              <h2 id="sv-feed">{t('sitFeed')}</h2>
              <p><Val v={view.feeding} pre /></p>
            </section>
            <section className="card stack" aria-labelledby="sv-care">
              <h2 id="sv-care">{t('sitMeds')}</h2>
              <p><Val v={view.care_notes} pre /></p>
            </section>

            <section className="card stack" aria-labelledby="sv-health">
              <h2 id="sv-health">{t('svHealth')}</h2>
              <dl className="kv">
                <dt>{t('cAllergies')}</dt>
                <dd><Val v={view.pet.allergies} pre /></dd>
                <dt>{t('svMedsRecord')}</dt>
                <dd><Val v={view.pet.medications} pre /></dd>
                <dt>{t('chip')}</dt>
                <dd className="mono"><Val v={view.pet.chip_no} /></dd>
              </dl>
            </section>

            <section className="card stack" aria-labelledby="sv-contacts">
              <h2 id="sv-contacts">{t('svContacts')}</h2>
              <dl className="kv">
                <dt>{t('cOwner')}</dt>
                <dd><Val v={view.owner_name} /></dd>
                <dt>{t('cOwnerPhone')}</dt>
                <dd><Phone v={view.owner_phone} /></dd>
                <dt>{t('emergencyContact')}</dt>
                <dd><Val v={view.emergency_contact} pre /></dd>
                <dt>{t('cVet')}</dt>
                <dd><Val v={view.vet_name} /></dd>
                <dt>{t('cVetPhone')}</dt>
                <dd><Phone v={view.vet_phone} /></dd>
              </dl>
              {view.vet_phone && telHref(view.vet_phone) && (
                <a className="btn btn-emergency btn-block no-print" href={telHref(view.vet_phone)!}>
                  <IconPhone size={20} />
                  {t('svCallVet')}
                </a>
              )}
            </section>
            <p className="muted small">{t('svFoot')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
