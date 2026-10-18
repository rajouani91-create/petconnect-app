import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { localeOf } from '../../i18n';
import { listMedications, type MedicationRow } from '../../lib/api';
import { doseText, isRunning } from '../../lib/medication';

/** Medikamente eines Tiers laden (null = lädt noch, [] bei Fehler) */
export function usePetMedications(petId: string): MedicationRow[] | null {
  const [rows, setRows] = useState<MedicationRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    listMedications([petId])
      .then((r) => alive && setRows(r))
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [petId]);
  return rows;
}

/** Laufende Medikamente mit Dosierung, eine Zeile je Medikament („Meloxicam – 0,5 ml · 2× täglich (…) · mit Futter“) */
export function RunningMeds({ rows, today }: { rows: readonly MedicationRow[]; today: string }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const running = rows.filter((m) => isRunning(m, today)).sort((a, b) => a.name.localeCompare(b.name));
  if (running.length === 0) return <span className="muted">{t('nothingSet')}</span>;
  return (
    <ul className="med-list-plain">
      {running.map((m) => (
        <li key={m.id}>
          <strong>{m.name}</strong> – {doseText(m, t, locale)}
        </li>
      ))}
    </ul>
  );
}
