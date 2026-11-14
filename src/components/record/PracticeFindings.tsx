import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate } from '../../i18n';
import { NO_PRACTICE_ENTRIES, petPracticeEntries, type PetPracticeEntries } from '../../lib/practiceRecord';

/** Einträge der Praxen zu einem Tier laden (Befunde, Ergänzungen zur Vorgeschichte). Fehler → leer, die Akte bleibt nutzbar. */
export function usePracticeEntries(petId: string): PetPracticeEntries {
  const [state, setState] = useState<{ petId: string; data: PetPracticeEntries }>({ petId, data: NO_PRACTICE_ENTRIES });
  useEffect(() => {
    let alive = true;
    petPracticeEntries(petId)
      .then((data) => { if (alive) setState({ petId, data }); })
      .catch(() => { if (alive) setState({ petId, data: NO_PRACTICE_ENTRIES }); });
    return () => { alive = false; };
  }, [petId]);
  return state.petId === petId ? state.data : NO_PRACTICE_ENTRIES;
}

/** Befunde und Behandlungen, die eine Praxis eingetragen hat (nur lesen). Ohne Befunde erscheint nichts. */
export function PracticeFindings({ petId, heading = 'h2' }: { petId: string; heading?: 'h2' | 'h3' }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { findings } = usePracticeEntries(petId);
  if (findings.length === 0) return null;
  const H = heading;
  return (
    <section className={heading === 'h2' ? 'card stack' : 'vault-section'} aria-labelledby={`${uid}-h`} id="befunde">
      <H id={`${uid}-h`}>{t('rcFindH')}</H>
      <ul className="record-list">
        {findings.map((f) => (
          <li key={f.id} className="record-row">
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
