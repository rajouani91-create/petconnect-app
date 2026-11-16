import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { speciesName } from '../components/more/shared';
import { IconBack } from '../components/Icons';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { correctEntry, practiceRecord, recordErrorKey, voidEntry, type PatientRecord } from '../lib/practiceRecord';
import { EditDialog, LogDialog, VoidDialog, type EditTarget, type LogTarget, type RecordCtx, type VoidTarget } from './record/shared';
import { MasterCard } from './record/MasterCard';
import { VaccinationsCard } from './record/VaccinationsCard';
import { FindingsCard } from './record/FindingsCard';
import { MedicationsCard } from './record/MedicationsCard';
import { HistoryCard } from './record/HistoryCard';
import { TimelineCard, VoidedCard } from './record/MiscCards';
import { EntryForms } from './record/EntryForms';

/** Patientenakte (Etappe P3): links die Anzeige, rechts die Eingabe. Einträge erscheinen sofort bei der Halter:in. */
export function PracticePatient() {
  const { petId } = useParams();
  const { t } = useI18n();
  const today = zonedNow(useNow()).date;
  const [rec, setRec] = useState<PatientRecord | null>(null);
  const [loadErr, setLoadErr] = useState<MessageKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [voiding, setVoiding] = useState<VoidTarget | null>(null);
  const [log, setLog] = useState<LogTarget | null>(null);
  const flash = (useLocation().state as { flash?: unknown } | null)?.flash;

  const load = useCallback(async () => {
    if (!petId) return;
    try {
      setRec(await practiceRecord(petId));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(recordErrorKey(e));
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (fn: () => Promise<unknown>, okText: string | (() => string)) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ ok: true, text: typeof okText === 'function' ? okText() : okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: t(recordErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const back = <Link to="/praxis/patienten" className="back-link"><IconBack size={20} />{t('ptTitle')}</Link>;
  if (loadErr && !rec) return <div className="page stack-lg">{back}<p className="notice notice-warn" role="alert">{t(loadErr)}</p></div>;
  if (!rec || !petId) return <div className="page stack-lg">{back}<p className="muted">{t('loading')}</p></div>;

  const p = rec.pet;
  const ctx: RecordCtx = { rec, petId, today, busy, run, openEdit: setEdit, openVoid: setVoiding, openLog: setLog };

  return (
    <div className="page page-wide stack-lg">
      {back}
      {typeof flash === 'string' && <p className="notice notice-ok" role="status">{flash}</p>}
      <div className="page-head">
        <h1>{p.name}{p.deceased && <span className="muted"> · {t('ptDeceased')}</span>}</h1>
        <p className="muted">{[p.species ? speciesName({ species: p.species, species_other: p.species_other }, t) : '', p.breed, p.owner_name].filter(Boolean).join(' · ')}</p>
      </div>
      {p.allergies?.trim() && <p className="notice notice-warn"><strong>{t('allergies')}:</strong> {p.allergies.trim()}</p>}
      <div className="record-status" role="status" aria-live="polite">
        {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
      </div>
      <div className="record-cols">
        <div className="stack-lg">
          <MasterCard ctx={ctx} />
          <VaccinationsCard ctx={ctx} />
          <FindingsCard ctx={ctx} />
          <MedicationsCard ctx={ctx} />
          <HistoryCard key={rec.history_note?.at ?? 'none'} ctx={ctx} />
          <TimelineCard ctx={ctx} />
          <VoidedCard ctx={ctx} />
        </div>
        <div className="stack-lg record-side">
          <EntryForms ctx={ctx} />
        </div>
      </div>
      {edit && (
        <EditDialog target={edit} today={today} busy={busy} onClose={() => setEdit(null)}
          onSave={(data, reason, note) => run(() => correctEntry(edit.entryId, data, reason, note), t('rcCorrected'))} />
      )}
      {voiding && (
        <VoidDialog target={voiding} busy={busy} onClose={() => setVoiding(null)}
          onVoid={(reason, note) => run(() => voidEntry(voiding.entryId, reason, note), t(voiding.confirmed ? 'rcUnconfirmed' : 'rcVoided'))} />
      )}
      {log && <LogDialog petId={petId} target={log} onClose={() => setLog(null)} />}
    </div>
  );
}
