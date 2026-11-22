import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate } from '../../i18n';
import { useDeepLink } from '../useDeepLink';
import { NO_PRACTICE_ENTRIES, petPracticeEntries, type PetPracticeEntries } from '../../lib/practiceRecord';

/** Einträge der Praxen zu einem Tier laden (Befunde, Ergänzungen zur Vorgeschichte). Fehler → leer, die Akte bleibt nutzbar. */
export function usePracticeEntries(petId: string): PetPracticeEntries & { loaded: boolean } {
  const [state, setState] = useState<{ petId: string; data: PetPracticeEntries; loaded: boolean }>({ petId, data: NO_PRACTICE_ENTRIES, loaded: false });
  useEffect(() => {
    let alive = true;
    petPracticeEntries(petId)
      .then((data) => { if (alive) setState({ petId, data, loaded: true }); })
      .catch(() => { if (alive) setState({ petId, data: NO_PRACTICE_ENTRIES, loaded: true }); });
    return () => { alive = false; };
  }, [petId]);
  return state.petId === petId ? { ...state.data, loaded: state.loaded } : { ...NO_PRACTICE_ENTRIES, loaded: false };
}

/** Befunde und Behandlungen, die eine Praxis eingetragen hat (nur lesen). Ohne Befunde erscheint nichts. */
export function PracticeFindings({ petId, heading = 'h2' }: { petId: string; heading?: 'h2' | 'h3' }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { findings, loaded } = usePracticeEntries(petId);
  // ?eintrag=<ID> aus einer Benachrichtigung: zum Befund springen
  const deep = useDeepLink('eintrag', loaded ? findings.map((f) => f.id) : null);
  if (findings.length === 0) return deep.missing ? <p className="notice notice-warn" role="alert">{t('ncGone')}</p> : null;
  const H = heading;
  return (
    <section className={heading === 'h2' ? 'card stack' : 'vault-section'} aria-labelledby={`${uid}-h`} id="befunde">
      <H id={`${uid}-h`}>{t('rcFindH')}</H>
      {deep.missing && <p className="notice notice-warn" role="alert">{t('ncGone')}</p>}
      <ul className="record-list">
        {findings.map((f) => (
          <li key={f.id} id={`dl-${f.id}`} className="record-row">
            <div className="record-main">
              <span className="record-title">{f.title}</span>
              <span className="muted small">{formatIsoDate(f.date, lang)}</span>
              {f.text && <span className="pre-line">{f.text}</span>}
              <span className="small practice-note">{t('rcFromPractice', { p: f.practice_name })}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">{t('omPracOnly')}</p>
    </section>
  );
}
