import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { MAX_REASON, reasonError } from '../../lib/staff';
import { TITLE_TEXT, isPracticeTitle } from '../../lib/practiceCatalog';
import { decideProof, proofUrl, rereadProof, staffProofs, type ProofReading, type StaffProofRow } from '../../lib/practiceAccount';

const yesNo = (v: boolean | undefined) => (v === undefined ? '–' : v ? 'ja' : 'nein');

function readingText(status: string, r: ProofReading | null): string {
  if (status === 'pending') return 'Wird noch vorgelesen.';
  if (status === 'skipped') return r?.note === 'scan' ? 'Gescanntes PDF ohne Text – bitte selbst ansehen.' : 'Bild ohne Bildmodell – bitte selbst ansehen.';
  if (status === 'failed' || !r) return 'Konnte nicht vorgelesen werden – bitte selbst ansehen.';
  return `${r.matches ? 'Passt' : 'Passt nicht ganz'} (${r.method === 'vision' ? 'Bildmodell' : 'Text, ohne KI'}): Urkunde ${yesNo(r.is_certificate)}, Titel ${yesNo(r.title_match)}, Name ${yesNo(r.name_match)}, Kammer ${yesNo(r.chamber_found)}`;
}

/** Nur Admin: Fachtierarzt-Urkunden ansehen, die Vorprüfung lesen, bestätigen oder ablehnen. Danach wird die Datei gelöscht. */
export function PracticeProofs() {
  const { t } = useI18n();
  const [rows, setRows] = useState<StaffProofRow[] | null>(null);
  const [open, setOpen] = useState<{ id: string; approve: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    staffProofs(true)
      .then(setRows)
      .catch(() => setMsg('Die Nachweise konnten nicht geladen werden.'));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function view(path: string) {
    try {
      window.open(await proofUrl(path), '_blank', 'noopener');
    } catch {
      setMsg('Die Datei konnte nicht geöffnet werden.');
    }
  }

  async function apply() {
    if (!open) return;
    if (reasonError(reason)) {
      setMsg(`Bitte einen Grund angeben (höchstens ${MAX_REASON} Zeichen).`);
      return;
    }
    setBusy(true);
    try {
      await decideProof(open.id, open.approve, reason);
      setMsg(open.approve ? 'Bestätigt. Der Titel gilt als geprüft, die Urkunde wurde gelöscht.' : 'Abgelehnt. Die Urkunde wurde gelöscht.');
      setOpen(null);
      setReason('');
      load();
    } catch {
      setMsg('Die Entscheidung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pp-proofs" className="team">
      <h2 id="pp-proofs">Nachweise für Fachtitel {rows && rows.length > 0 && <span className="pill pill-warn">{rows.length} offen</span>}</h2>
      <p>Die App vergleicht die Urkunde mit dem angegebenen Titel und Namen (Text-PDFs ohne KI-Dienst). Das ist nur eine Vorprüfung: Bitte sehen Sie die Urkunde an und entscheiden Sie. Danach wird sie gelöscht.</p>
      {msg && <p role="status">{msg}</p>}
      {rows && rows.length === 0 && <p>Keine offenen Nachweise.</p>}
      <ul aria-label="Offene Nachweise">
        {(rows ?? []).map((r) => (
          <li key={r.id}>
            <strong>{r.practice_name}</strong> · {isPracticeTitle(r.title) ? t(TITLE_TEXT[r.title]) : r.title} · {r.person_name}
            <br />
            <span className="small">{readingText(r.read_status, r.reading)}</span>
            {r.reading?.method === 'vision' && (
              <>
                <br />
                <span className="muted small">Gelesen: „{r.reading.title_text || '–'}“, {r.reading.holder_name || '–'}, {r.reading.issuer || '–'}, {r.reading.issue_date || '–'}</span>
              </>
            )}
            <div className="row-actions">
              <button type="button" onClick={() => void view(r.path)}>Urkunde ansehen</button>
              {r.read_status !== 'done' && <button type="button" disabled={busy} onClick={() => void rereadProof(r.id).then(load).catch(() => setMsg('Vorlesen fehlgeschlagen.'))}>Erneut vorlesen</button>}
              <button type="button" disabled={busy} onClick={() => { setOpen({ id: r.id, approve: true }); setReason(''); }}>Bestätigen</button>
              <button type="button" disabled={busy} onClick={() => { setOpen({ id: r.id, approve: false }); setReason(''); }}>Ablehnen</button>
            </div>
            {open?.id === r.id && (
              <div role="group" aria-label="Entscheidung bestätigen">
                <label htmlFor="pp-reason">Grund (Pflicht, wird protokolliert; bei Ablehnung sieht die Praxis ihn)</label>
                <input id="pp-reason" value={reason} maxLength={MAX_REASON + 50} onChange={(e) => setReason(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void apply()}>{open.approve ? 'Bestätigen' : 'Ablehnen'}</button>
                <button type="button" onClick={() => setOpen(null)}>Abbrechen</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
