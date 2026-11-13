import { useCallback, useEffect, useState } from 'react';
import { MAX_REASON, reasonError } from '../../lib/staff';
import { errorCode, setPracticeStatus, setTitlesVerified, staffPractices, type PracticeStatus, type StaffPracticeRow } from '../../lib/practiceAccount';
import { TITLE_TEXT, isPracticeTitle } from '../../lib/practiceCatalog';
import { useI18n } from '../../i18n/I18nProvider';

const STATUS_LABEL: Record<PracticeStatus, string> = { pending: 'Wartet auf Freischaltung', active: 'Freigeschaltet', suspended: 'Gesperrt' };
const FILTERS: { v: PracticeStatus | 'all'; l: string }[] = [
  { v: 'pending', l: 'Wartend' },
  { v: 'active', l: 'Freigeschaltet' },
  { v: 'suspended', l: 'Gesperrt' },
  { v: 'all', l: 'Alle' },
];

/** Betreiber: neue Praxen prüfen und freischalten, Praxen sperren. Support sieht die Liste, ändern darf nur Admin. */
export function PracticeAccounts({ canChange }: { canChange: boolean }) {
  const [rows, setRows] = useState<StaffPracticeRow[] | null>(null);
  const [filter, setFilter] = useState<PracticeStatus | 'all'>('pending');
  const { t } = useI18n();
  const [open, setOpen] = useState<{ id: string; to: 'active' | 'suspended' | 'verify' | 'unverify' } | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    staffPractices()
      .then(setRows)
      .catch(() => setMsg('Die Praxen konnten nicht geladen werden.'));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function apply() {
    if (!open) return;
    if (reasonError(reason)) {
      setMsg(`Bitte einen Grund angeben (höchstens ${MAX_REASON} Zeichen).`);
      return;
    }
    setBusy(true);
    try {
      if (open.to === 'verify' || open.to === 'unverify') {
        await setTitlesVerified(open.id, open.to === 'verify', reason);
        setMsg(open.to === 'verify' ? 'Fachtitel als geprüft markiert.' : 'Markierung „geprüft“ entfernt.');
        setOpen(null);
        setReason('');
        load();
        return;
      }
      const dir = await setPracticeStatus(open.id, open.to, reason);
      setMsg(open.to === 'active'
        ? dir ? 'Praxis freigeschaltet. Sie erscheint im Verzeichnis als „bei PetConnect“.' : 'Praxis freigeschaltet. Ohne gültige Postleitzahl steht sie noch nicht im Verzeichnis.'
        : 'Praxis gesperrt.');
      setOpen(null);
      setReason('');
      load();
    } catch (e) {
      setMsg(errorCode(e) === 'forbidden' ? 'Dafür fehlt die Berechtigung.' : 'Die Änderung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  const shown = rows?.filter((r) => filter === 'all' || r.status === filter) ?? [];
  const pending = rows?.filter((r) => r.status === 'pending').length ?? 0;

  return (
    <section aria-labelledby="pa-title" className="team">
      <h2 id="pa-title">Praxen {pending > 0 && <span className="pill pill-warn">{pending} wartend</span>}</h2>
      <p>Neue Praxen können Profil und Team anlegen, sehen aber keine Patientendaten, bis sie hier freigeschaltet sind. Beim Freischalten wird der Verzeichniseintrag als „bei PetConnect“ markiert. Fachtitel zählen sofort als „Angabe der Praxis“; „geprüft“ setzen Sie erst nach einem Blick in das Register der Tierärztekammer oder auf die Urkunde.</p>
      <div className="dash-seg" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.v} type="button" className={filter === f.v ? 'on' : undefined} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.l}</button>
        ))}
      </div>
      {msg && <p role="status">{msg}</p>}
      {rows && shown.length === 0 && <p>Keine Praxen in dieser Ansicht.</p>}
      <ul aria-label="Praxen">
        {shown.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong> · {[r.postcode, r.city].filter(Boolean).join(' ') || '–'} · {STATUS_LABEL[r.status]}
            <br />
            <span className="muted small">
              Leitung: {r.lead_email ?? '–'} · {r.members} Mitglied(er) · Telefon: {r.phone ?? '–'} · registriert am {new Date(r.created_at).toLocaleDateString('de-DE')}
              {r.directory_id ? ' · mit Verzeichniseintrag' : ' · neuer Eintrag'}
            </span>
            {r.titles.length > 0 && (
              <>
                <br />
                <span className="small">
                  Fachtitel: {r.titles.filter(isPracticeTitle).map((x) => t(TITLE_TEXT[x])).join(', ')} · {r.titles_verified ? 'geprüft' : 'Angabe der Praxis (nicht geprüft)'}
                </span>
              </>
            )}
            {canChange && (
              <div className="row-actions">
                {r.status !== 'active' && <button type="button" disabled={busy} onClick={() => { setOpen({ id: r.id, to: 'active' }); setReason(''); }}>Freischalten</button>}
                {r.status !== 'suspended' && <button type="button" disabled={busy} onClick={() => { setOpen({ id: r.id, to: 'suspended' }); setReason(''); }}>Sperren</button>}
                {r.titles.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => { setOpen({ id: r.id, to: r.titles_verified ? 'unverify' : 'verify' }); setReason(''); }}>
                    {r.titles_verified ? 'Fachtitel: „geprüft“ entfernen' : 'Fachtitel als geprüft markieren'}
                  </button>
                )}
              </div>
            )}
            {open?.id === r.id && (
              <div role="group" aria-label="Bestätigen">
                <label htmlFor="pa-reason">Grund (Pflicht, wird protokolliert, höchstens {MAX_REASON} Zeichen)</label>
                <input id="pa-reason" value={reason} maxLength={MAX_REASON + 50} onChange={(e) => setReason(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void apply()}>{open.to === 'active' ? 'Freischalten bestätigen' : open.to === 'suspended' ? 'Sperren bestätigen' : 'Bestätigen'}</button>
                <button type="button" onClick={() => setOpen(null)}>Abbrechen</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
