import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang, type Lang } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { updateLanguage } from '../lib/api';
import {
  STAFF_ROLE_LABEL, errorCode, formFromPractice, joinStreet, joinZipCity, offerIsEmpty, practiceErrorKey, updatePracticeProfile, type PracticeForm, type PracticeOffer,
} from '../lib/practiceAccount';
import { PracticeFormFields } from './PracticeFormFields';
import { OfferQuestionnaire, OfferSummary } from './OfferQuestionnaire';
import { TitleProofs } from './TitleProofs';
import { usePractice } from './PracticeProvider';

/** „Mein Profil“ der Praxis wie im Prototyp: Karte Konto und Karte Praxisprofil (Bearbeiten nur Praxisleitung). */
export function PracticeProfile() {
  const { t, lang, setLang } = useI18n();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { me, refresh } = usePractice();
  const [editing, setEditing] = useState(false);
  const [editingOffer, setEditingOffer] = useState(false);
  const [offer, setOffer] = useState<PracticeOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const p = me?.practice;
  if (!me || !p || !me.role) return null;
  const isLead = me.role === 'lead';

  async function changeLang(next: Lang) {
    if (!user) return;
    const prev = lang;
    setLang(next);
    try {
      await updateLanguage(user.id, next);
      await refreshProfile();
    } catch {
      setLang(prev);
      setStatus(t('pe_generic'));
    }
  }

  async function save(f: PracticeForm, o: PracticeOffer) {
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      await updatePracticeProfile(f, o, p.country);
      await refresh();
      setEditing(false);
      setEditingOffer(false);
      setStatus(t('pp_saved'));
    } catch (e) {
      setError(t(practiceErrorKey(errorCode(e))));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <h1>{t('profileTitle')}</h1>
      {p.status === 'pending' && (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('pp_pending')}</p>
        </div>
      )}
      <p role="status" aria-live="polite" className={status ? 'notice notice-ok' : 'sr-only'}>{status}</p>
      <div className="practice-cards">
        <section className="card stack" aria-labelledby="pp-account">
          <h2 id="pp-account">{t('account')}</h2>
          <dl className="kv">
            <dt>{t('pp_name')}</dt>
            <dd>{profile?.display_name ?? '–'}</dd>
            <dt>{t('email')}</dt>
            <dd>{user?.email ?? '–'}</dd>
            <dt>{t('pp_role')}</dt>
            <dd>{t(STAFF_ROLE_LABEL[me.role])}</dd>
          </dl>
          <div className="field">
            <label htmlFor="pp-lang">{t('prefLang')}</label>
            <select id="pp-lang" value={lang} onChange={(e) => isLang(e.target.value) && void changeLang(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>{t('logout')}</button>
          </div>
          <p className="small">
            <Link to="/impressum" className="link">{t('legalImprint')}</Link>
            {' · '}
            <Link to="/datenschutz" className="link">{t('legalPrivacy')}</Link>
          </p>
        </section>

        <section className="card stack" aria-labelledby="pp-practice">
          <div className="card-head">
            <h2 id="pp-practice">{t('pp_practiceProfile')}</h2>
            {isLead && !editing && (
              <button type="button" className="btn btn-secondary" onClick={() => { setEditing(true); setEditingOffer(false); setStatus(''); }}>{t('pp_edit')}</button>
            )}
          </div>
          {editing ? (
            <PracticeFormFields idPrefix="pe" initial={formFromPractice(p)} submitLabel={t('savePractice')} busy={busy} error={error} onSubmit={(f) => void save(f, p.offer)}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => { setEditing(false); setError(null); }}>{t('pp_cancel')}</button>
            </PracticeFormFields>
          ) : (
            <dl className="kv">
              <dt>{t('practiceName')}</dt>
              <dd>{p.name}</dd>
              <dt>{t('pf_address')}</dt>
              <dd>{joinStreet(p.street, p.housenumber) || '–'}</dd>
              <dt>{t('pf_zipCity')}</dt>
              <dd>{joinZipCity(p.postcode, p.city) || '–'}</dd>
              <dt>{t('pf_phone')}</dt>
              <dd>{p.phone ?? '–'}</dd>
              <dt>{t('pf_email')}</dt>
              <dd>{p.email ?? '–'}</dd>
              <dt>{t('pf_website')}</dt>
              <dd>{p.website ?? '–'}</dd>
              <dt>{t('pf_hours')}</dt>
              <dd>{p.hours_text ?? '–'}</dd>
              <dt>{t('pp_directory')}</dt>
              <dd>{p.status === 'active' && p.directory_id ? t('pp_directoryListed') : p.directory_id ? t('pp_directoryLinked') : t('pp_directoryNone')}</dd>
            </dl>
          )}
        </section>

        <section className="card stack" aria-labelledby="pp-offer">
          <div className="card-head">
            <h2 id="pp-offer">{t('oqTitle')}</h2>
            {isLead && !editingOffer && (
              <button type="button" className="btn btn-secondary" onClick={() => { setOffer(p.offer); setEditingOffer(true); setEditing(false); setStatus(''); }}>{t('pp_edit')}</button>
            )}
          </div>
          {editingOffer && offer ? (
            <div className="stack">
              <p className="muted">{t('oqIntro')}</p>
              <OfferQuestionnaire value={offer} onChange={setOffer} />
              {error && <p className="notice notice-crit" role="alert">{error}</p>}
              <button type="button" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy} onClick={() => void save(formFromPractice(p), offer)}>{t('oqSave')}</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => { setEditingOffer(false); setError(null); }}>{t('pp_cancel')}</button>
            </div>
          ) : (
            <>
              {offerIsEmpty(p.offer) && <p className="notice notice-info">{t('oqEmpty')}</p>}
              <OfferSummary value={p.offer} />
              <TitleProofs practiceId={p.id} titles={p.offer.titles} verified={p.verified_titles} isLead={isLead} onChanged={() => void refresh()} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
