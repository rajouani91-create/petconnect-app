import type { MessageKey } from '../i18n';
import { localeOf } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { Switch } from '../components/Switch';
import { SERVICE_NEEDS_SPECIES, SERVICE_TEXT as SERVICE_LABEL, SPECIES_TEXT, TITLE_TEXT, languageName, type PracticeService } from '../lib/practiceCatalog';
import {
  PRACTICE_SERVICES, PRACTICE_SPECIES, PRACTICE_TITLES, TEAM_LANGUAGES, serviceAsked, setIn, toggleSpecies, type PracticeOffer,
} from '../lib/practiceAccount';

/** Eine Frage je Leistung (Ja/Nein), damit der Fragebogen wie ein Gespräch klingt. */
const SERVICE_QUESTION: Record<PracticeService, MessageKey> = {
  surgery: 'oqSurgery',
  dentistry: 'oqDentistry',
  imaging: 'oqImaging',
  ct_mri: 'oqCtMri',
  blood_bank: 'oqBlood',
  hibernation: 'oqHibernation',
  home_visits: 'oqHome',
  emergency_24h: 'oqEmergency',
  physio: 'oqPhysio',
  equine_mobile: 'oqEquine',
};

/** Angebots-Fragebogen der Praxis. Die Antworten sind genau die Filter der Praxissuche für Halter:innen. */
export function OfferQuestionnaire({ value, onChange }: { value: PracticeOffer; onChange: (o: PracticeOffer) => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const chip = (on: boolean, label: string, toggle: () => void, key: string) => (
    <button key={key} type="button" className="chip" aria-pressed={on} onClick={toggle}>{label}</button>
  );
  const q = (n: number) => t('oqStep', { n, of: 4 });

  return (
    <div className="stack-lg offer-q">
      <fieldset className="fieldset stack">
        <legend><span className="muted small oq-num">{q(1)}</span> {t('oqSpecies')}</legend>
        <div className="chips-wrap">
          {PRACTICE_SPECIES.map((s) => chip(value.species.includes(s), t(SPECIES_TEXT[s]), () => onChange(toggleSpecies(value, s)), s))}
        </div>
      </fieldset>

      <fieldset className="fieldset stack">
        <legend><span className="muted small oq-num">{q(2)}</span> {t('oqServices')}</legend>
        <ul className="oq-list">
          {PRACTICE_SERVICES.filter((v) => serviceAsked(value, v)).map((v) => (
            <li key={v} className={SERVICE_NEEDS_SPECIES[v] ? 'oq-follow' : undefined}>
              <Switch
                checked={value.services.includes(v)}
                label={t(SERVICE_QUESTION[v])}
                onChange={(on) => onChange({ ...value, services: setIn(PRACTICE_SERVICES, value.services, v, on) })}
              />
            </li>
          ))}
        </ul>
        <p className="hint">{t('oqFollowHint')}</p>
      </fieldset>

      <fieldset className="fieldset stack">
        <legend><span className="muted small oq-num">{q(3)}</span> {t('oqTitles')}</legend>
        <div className="chips-wrap">
          {PRACTICE_TITLES.map((s) => chip(value.titles.includes(s), t(TITLE_TEXT[s]), () => onChange({ ...value, titles: setIn(PRACTICE_TITLES, value.titles, s, !value.titles.includes(s)) }), s))}
        </div>
        <p className="hint">{t('oqTitlesHint')}</p>
      </fieldset>

      <fieldset className="fieldset stack">
        <legend><span className="muted small oq-num">{q(4)}</span> {t('oqLangs')}</legend>
        <div className="chips-wrap">
          {TEAM_LANGUAGES.map((l) => chip(value.languages.includes(l), languageName(l, locale), () => onChange({ ...value, languages: setIn(TEAM_LANGUAGES, value.languages, l, !value.languages.includes(l)) }), l))}
        </div>
      </fieldset>
    </div>
  );
}

/** Kurzfassung der Antworten für die Profilansicht */
export function OfferSummary({ value, verified }: { value: PracticeOffer; verified: boolean }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const dash = '–';
  return (
    <dl className="kv">
      <dt>{t('oqSpeciesShort')}</dt>
      <dd>{value.species.map((s) => t(SPECIES_TEXT[s])).join(', ') || dash}</dd>
      <dt>{t('oqServicesShort')}</dt>
      <dd>{value.services.length === 0 ? dash : (
        <span className="chips-wrap">{value.services.map((v) => <span key={v} className="pill pill-ok">{t(SERVICE_LABEL[v])}</span>)}</span>
      )}</dd>
      <dt>{t('oqTitlesShort')}</dt>
      <dd>{value.titles.length === 0 ? dash : (
        <>
          {value.titles.map((s) => t(TITLE_TEXT[s])).join(', ')}{' '}
          <span className={`pill ${verified ? 'pill-ok' : ''}`}>{t(verified ? 'psVerified' : 'psSelfReported')}</span>
        </>
      )}</dd>
      <dt>{t('oqLangsShort')}</dt>
      <dd>{value.languages.map((l) => languageName(l, locale)).join(', ') || dash}</dd>
    </dl>
  );
}
