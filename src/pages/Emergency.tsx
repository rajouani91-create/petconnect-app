import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { usePets } from '../pets/PetsProvider';
import { extractPhone } from '../lib/validate';
import { PetSwitcher } from '../components/PetSwitcher';
import { IconBack, IconEmergency, IconPhone } from '../components/Icons';
import { PetAvatar } from '../components/PetAvatar';

/** Vorläufige Notfall-Seite: keine erfundenen Praxen oder Nummern, nur der eigene Notfallkontakt. */
export function Emergency() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { active } = usePets();
  const contact = active?.emergency_contact?.trim() || null;
  const phone = contact ? extractPhone(contact) : null;

  return (
    <div className="page stack-lg">
      <button type="button" className="link back-link" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <IconBack size={20} />
        {t('back')}
      </button>

      <section className="card emergency-card" aria-labelledby="em-h">
        <span className="emergency-icon">
          <IconEmergency size={32} />
        </span>
        <h1 id="em-h">{t('emergCall')}</h1>
        <p>{t('emergHint')}</p>
      </section>

      <PetSwitcher />

      {active && (
        <section className="card stack" aria-labelledby="ec-h">
          <div className="em-pet">
            <PetAvatar pet={active} size={48} fallback={false} />
            <h2 id="ec-h">{t('emergContactH', { n: active.name })}</h2>
          </div>
          {contact ? (
            <>
              <p className="pre contact-text">{contact}</p>
              {phone && (
                <a className="btn btn-emergency btn-block" href={`tel:${phone}`}>
                  <IconPhone size={20} />
                  {t('callX', { x: phone })}
                </a>
              )}
            </>
          ) : (
            <>
              <p className="muted">{t('emergNoContact', { n: active.name })}</p>
              <Link to="/tier" className="btn btn-secondary">
                {t('emergAddContact')}
              </Link>
            </>
          )}
        </section>
      )}
    </div>
  );
}
