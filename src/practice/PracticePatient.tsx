import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { IconBack } from '../components/Icons';
import { SidePanel } from '../components/SidePanel';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import { addLine, vaccineSuggestions, type ServiceLine } from '../lib/billing';
import { correctEntry, practiceRecord, recordErrorKey, voidEntry, type PatientRecord } from '../lib/practiceRecord';
import { EditDialog, LogDialog, VoidDialog, type EditTarget, type LogTarget, type RecordCtx, type VoidTarget } from './record/shared';
import { MasterCard } from './record/MasterCard';
import { VaccinationsCard } from './record/VaccinationsCard';
import { FindingsCard } from './record/FindingsCard';
import { MedicationsCard } from './record/MedicationsCard';
import { HistoryCard } from './record/HistoryCard';
import { TimelineCard, VoidedCard } from './record/MiscCards';
import { MedicationForm, VaccinationForm, VitalForm } from './record/EntryForms';
import { TreatmentForm, useTreatmentBilling } from './record/TreatmentForm';
import { VitalsCard } from './record/VitalsCard';
import { PatientHead, SummaryGrid, type Panel } from './record/Summary';

const PANEL_TITLE: Record<Panel, MessageKey> = {
  treat: 'blTrTitle', vacc: 'rcAddVacc', vital: 'rcAddVitals', med: 'rcAddMed',
  findings: 'rcFindH', vaccList: 'rcVaccH', medList: 'mdTitle', vitalList: 'rcVitalsH', master: 'rcMasterHistH',
};

/** Patientenakte (Release B, Variante B): Übersicht in Karten, Formulare und ganze Listen öffnen sich rechts in einer Leiste. */
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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [lines, setLines] = useState<ServiceLine[]>([]);
  const [suggested, setSuggested] = useState(false);
  const flash = (useLocation().state as { flash?: unknown } | null)?.flash;
  const bill = useTreatmentBilling(petId ?? '', today, !!petId);

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

  const open = (p: Panel) => { setMsg(null); setPanel(p); };
  const close = () => setPanel(null);

  // Nach einer Impfung: Impfleistung und Impfstoff als Vorschlag in „Erbrachte Leistungen“, dann weiter zur Behandlung
  const onVaccinated = (name: string, day: string): boolean => {
    const sugg = vaccineSuggestions(name, bill.data?.catalog?.items ?? [], day);
    if (!sugg.length) return false;
    setLines((ls) => sugg.reduce((acc, i) => (acc.some((l) => l.catalog_item_id === i.id) ? acc : addLine(acc, i, 1, true)), ls));
    setSuggested(true);
    setPanel('treat');
    return true;
  };

  const back = <Link to="/praxis/patienten" className="back-link"><IconBack size={20} />{t('ptTitle')}</Link>;
  if (loadErr && !rec) return <div className="page stack-lg">{back}<p className="notice notice-warn" role="alert">{t(loadErr)}</p></div>;
  if (!rec || !petId) return <div className="page stack-lg">{back}<p className="muted">{t('loading')}</p></div>;

  const p = rec.pet;
  const ctx: RecordCtx = { rec, petId, today, busy, run, openEdit: setEdit, openVoid: setVoiding, openLog: setLog };
  const status = msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>;

  return (
    <div className="page page-wide stack-lg">
      {back}
      {typeof flash === 'string' && <p className="notice notice-ok" role="status">{flash}</p>}
      <PatientHead ctx={ctx} bill={bill} open={open} />
      <div className="record-status" role="status" aria-live="polite">{!panel && status}</div>
      {p.deceased && <p className="notice notice-info">{t('rcDeceasedNote')}</p>}
      <SummaryGrid ctx={ctx} bill={bill} open={open} />
      <TimelineCard ctx={ctx} />
      <VoidedCard ctx={ctx} />

      <SidePanel open={panel !== null} title={panel ? t(PANEL_TITLE[panel]) : ''} onClose={close}
        sub={[p.name, p.owner_name, p.allergies?.trim() ? `${t('allergies')}: ${p.allergies.trim()}` : ''].filter(Boolean).join(' · ')}>
        <div role="status" aria-live="polite">{panel && status}</div>
        {panel === 'treat' && (
          <TreatmentForm ctx={ctx} bill={bill} lines={lines} setLines={(fn) => setLines(fn)} suggested={suggested} clearSuggested={() => setSuggested(false)} onDone={close} />
        )}
        {panel === 'vacc' && <VaccinationForm ctx={ctx} onSaved={onVaccinated} onDone={close} />}
        {panel === 'vital' && <VitalForm ctx={ctx} onDone={close} />}
        {panel === 'med' && <MedicationForm ctx={ctx} onDone={close} />}
        {panel === 'findings' && <div className="panel-list"><FindingsCard ctx={ctx} /></div>}
        {panel === 'vaccList' && <div className="panel-list"><VaccinationsCard ctx={ctx} /></div>}
        {panel === 'medList' && <div className="panel-list"><MedicationsCard ctx={ctx} /></div>}
        {panel === 'vitalList' && <VitalsCard ctx={ctx} />}
        {panel === 'master' && (
          <div className="stack-lg">
            <MasterCard ctx={ctx} />
            <HistoryCard key={rec.history_note?.at ?? 'none'} ctx={ctx} />
          </div>
        )}
      </SidePanel>

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
