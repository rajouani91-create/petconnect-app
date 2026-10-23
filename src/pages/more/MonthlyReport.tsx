import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePets } from '../../pets/PetsProvider';
import { PetSwitcher } from '../../components/PetSwitcher';
import { Loading } from '../../components/Loading';
import {
  listAppointments,
  listDosesRange,
  listMedications,
  listReminders,
  listRoutine,
  listRoutineDoneRange,
  listWeights,
} from '../../lib/api';
import { buildMonthReport, monthRange, type MonthReport } from '../../lib/monthReport';
import { zonedNow } from '../../lib/time';

interface Loaded {
  readonly report: MonthReport;
  readonly routineDone: number;
}

/** Mehr → Monatsübersicht: Zählungen pro Tier und Monat, Druck als PDF über den Browser. */
export function MonthlyReport() {
  const { t, lang } = useI18n();
  const { active, loaded } = usePets();
  const todayIso = zonedNow(new Date()).date;
  const [ym, setYm] = useState(() => {
    const [y, m] = todayIso.split('-');
    return { year: Number(y), month: Number(m) };
  });
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const petId = active?.id ?? null;
  const range = monthRange(ym.year, ym.month);

  useEffect(() => {
    if (!petId) return;
    let alive = true;
    setData(null);
    setFailed(false);
    (async () => {
      try {
        const [meds, doses, reminders, appointments, weights, routines] = await Promise.all([
          listMedications([petId]),
          listDosesRange(petId, range.first, range.last),
          listReminders([petId]),
          listAppointments([petId]),
          listWeights(petId),
          listRoutine(petId),
        ]);
        const routineDone = await listRoutineDoneRange(routines.map((r) => r.id), range.first, range.last);
        if (!alive) return;
        setData({
          report: buildMonthReport({ meds, doses, reminders, appointments, weights }, ym.year, ym.month, todayIso),
          routineDone: routineDone.length,
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, ym.year, ym.month, todayIso]);

  if (!loaded) return <Loading />;
  if (!active) return <Loading />;

  const monthLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(ym.year, ym.month - 1, 1)),
  );
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const kgLabel = (kg: number) => `${kg.toLocaleString(lang, { maximumFractionDigits: 2 })} kg`;

  function shift(delta: number) {
    setYm((prev) => {
      const d = new Date(Date.UTC(prev.year, prev.month - 1 + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    });
  }

  const report = data?.report;

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('moTitle')}</h1>
        <p className="muted">{t('moIntro')}</p>
      </header>

      <PetSwitcher />

      <div className="card-head">
        <button type="button" className="btn btn-ghost" aria-label={t('moPrev')} onClick={() => shift(-1)}>‹</button>
        <h2 aria-live="polite">{monthLabel}</h2>
        <button type="button" className="btn btn-ghost" aria-label={t('moNext')} onClick={() => shift(1)}>›</button>
      </div>

      {failed && <p role="alert" className="muted">{t('moError')}</p>}
      {!failed && !report && <Loading />}

      {report && data && (
        <div className="mo-print stack-lg">
          <h2>{active.name} · {monthLabel}</h2>

          <section className="card stack" aria-labelledby="mo-med">
            <h3 id="mo-med">{t('moMeds')}</h3>
            {report.medications.filter((m) => m.planned > 0).length === 0 ? (
              <p className="muted">{t('moNoMeds')}</p>
            ) : (
              <>
                <p>{report.medTotals.planned} {t('moPlanned')} · {report.medTotals.done} {t('moDone')} · {report.medTotals.missed} {t('moMissed')}</p>
                <ul className="stack">
                  {report.medications.filter((m) => m.planned > 0).map((m) => (
                    <li key={m.id}>
                      <strong>{m.name}</strong>: {m.planned} {t('moPlanned')} · {m.done} {t('moDone')} · {m.missed} {t('moMissed')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card stack" aria-labelledby="mo-rem">
            <h3 id="mo-rem">{t('moReminders')}</h3>
            <p>{report.reminders.done} {t('moDone')} · {report.reminders.overdue} {t('moOverdue')} · {report.reminders.open} {t('moOpen')}</p>
            <p>{t('moRoutine')}: {data.routineDone}</p>
          </section>

          <section className="card stack" aria-labelledby="mo-appt">
            <h3 id="mo-appt">{t('moAppts')}</h3>
            <p>{report.appointments.planned} {t('moPlanned')} · {report.appointments.done} {t('moDone')} · {report.appointments.cancelled} {t('moCancelled')}</p>
          </section>

          <section className="card stack" aria-labelledby="mo-weight">
            <h3 id="mo-weight">{t('moWeight')}</h3>
            {report.weight.count === 0 || report.weight.startDate === null || report.weight.endDate === null ? (
              <p className="muted">{t('moWeightNone')}</p>
            ) : (
              <ul className="stack">
                <li>{t('moWeightStart')}: {dateLabel(report.weight.startDate)} · {kgLabel(report.weight.startKg ?? 0)}</li>
                <li>{t('moWeightEnd')}: {dateLabel(report.weight.endDate)} · {kgLabel(report.weight.endKg ?? 0)}</li>
                {report.weight.diffKg !== null && (
                  <li>{t('moWeightDiff')}: {report.weight.diffKg > 0 ? '+' : ''}{report.weight.diffKg.toLocaleString(lang, { maximumFractionDigits: 2 })} kg</li>
                )}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="no-print stack">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()} disabled={!report}>{t('moPrint')}</button>
        <p className="muted">{t('moPrintHint')}</p>
      </div>
    </div>
  );
}
