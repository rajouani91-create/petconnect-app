import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { Loading } from '../components/Loading';
import {
  EMPTY_FORM, EMPTY_OFFER, errorCode, formFromDirectory, joinStreet, joinZipCity, practiceErrorKey, registerPractice, searchDirectory,
  type DirectoryHit, type PracticeForm, type PracticeOffer,
} from '../lib/practiceAccount';
import { PracticeFormFields } from './PracticeFormFields';
import { OfferQuestionnaire } from './OfferQuestionnaire';
import { usePractice } from './PracticeProvider';

/** Schritt 2 der Registrierung: Eintrag im Praxisverzeichnis suchen und übernehmen (oder neu anlegen), dann Profil speichern. */
export function PracticeSetup() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const { me, refresh } = usePractice();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<DirectoryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(false);
  const [chosen, setChosen] = useState<DirectoryHit | null>(null);
  const [mode, setMode] = useState<'search' | 'form' | 'offer'>('search');
  const [form, setForm] = useState<PracticeForm | null>(null);
  const [offer, setOffer] = useState<PracticeOffer>(EMPTY_OFFER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headRef.current?.focus();
  }, [mode]);

  if (!me) return <Loading />;
  if (me.kind !== 'practice') return <Navigate to="/" replace />;
  if (me.practice) return <Navigate to="/praxis" replace />;
  if (me.invite) return <Navigate to="/praxis/einladung" replace />;

  const prefill: PracticeForm = form ?? (chosen
    ? formFromDirectory(chosen)
    : { ...EMPTY_FORM, name: typeof user?.user_metadata?.practice_name === 'string' ? user.user_metadata.practice_name : '' });

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) {
      setHits(null);
      return;
    }
    setSearching(true);
    setSearchErr(false);
    try {
      setHits(await searchDirectory(q));
    } catch {
      setSearchErr(true);
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await registerPractice(chosen?.id ?? null, form, offer);
      await refresh();
      navigate('/praxis', { replace: true });
    } catch (e) {
      setError(t(practiceErrorKey(errorCode(e))));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t('prac_title')} sub={t('prac_sub')}>
      <p className="muted small">{t('pp_step2')}</p>
      {mode === 'search' ? (
        <div className="stack">
          <h2 ref={headRef} tabIndex={-1} className="h-sub">{t('pd_title')}</h2>
          <p className="muted">{t('pd_intro')}</p>
          <form className="stack" role="search" onSubmit={onSearch}>
            <div className="field">
              <label htmlFor="pd-q">{t('pd_label')}</label>
              <input id="pd-q" className="practice-search" type="search" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} aria-describedby="pd-q-hint" />
              <p className="hint" id="pd-q-hint">{t('pd_hint')}</p>
            </div>
            <button type="submit" className="btn btn-secondary btn-block" disabled={searching} aria-busy={searching}>{t('pd_search')}</button>
          </form>
          <div aria-live="polite">
            {searchErr && <p className="notice notice-crit">{t('pe_generic')}</p>}
            {hits && hits.length === 0 && <p className="muted">{t('pd_none')}</p>}
            {hits && hits.length > 0 && (
              <ul className="choose-list" aria-label={t('pd_results')}>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="dir-hit" onClick={() => { setChosen(h); setForm(null); setMode('form'); }}>
                      <strong>{h.name}</strong>
                      <span className="muted small">{[joinStreet(h.street, h.housenumber), joinZipCity(h.postcode, h.city)].filter(Boolean).join(', ') || '–'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setChosen(null); setForm(null); setMode('form'); }}>{t('pd_new')}</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void signOut()}>{t('logout')}</button>
        </div>
      ) : mode === 'form' ? (
        <div className="stack">
          <h2 ref={headRef} tabIndex={-1} className="h-sub">{chosen ? t('pd_chosen') : t('pd_newTitle')}</h2>
          {chosen && <p className="notice notice-info">{t('pd_chosenHint')}</p>}
          <PracticeFormFields key={chosen?.id ?? 'new'} idPrefix="ps" initial={prefill} submitLabel={t('oqNext')} busy={false} error={null}
            onSubmit={(f) => { setForm(f); setMode('offer'); }}>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => { setMode('search'); setError(null); }}>{t('pd_back')}</button>
          </PracticeFormFields>
        </div>
      ) : (
        <div className="stack">
          <h2 ref={headRef} tabIndex={-1} className="h-sub">{t('oqTitle')}</h2>
          <p className="muted">{t('oqIntro')}</p>
          <OfferQuestionnaire value={offer} onChange={setOffer} />
          {error && <p className="notice notice-crit" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy} onClick={() => void save()}>{t('savePractice')}</button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => { setMode('form'); setError(null); }}>{t('oqBack')}</button>
          <p className="muted small">{t('pp_reviewNote')}</p>
        </div>
      )}
    </AuthLayout>
  );
}
