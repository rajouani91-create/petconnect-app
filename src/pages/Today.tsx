import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatTime, localeOf } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { listDone, listMembers, listRoutine, markDone, markUndone } from '../lib/api';
import { canEdit, doneByName } from '../lib/sharing';
import type { PetRow, RoutineRow } from '../lib/supabase';
import type { MedicationRow } from '../lib/api';
import { nextDue, splitMinutes, toHHMM, toMinutes, zonedNow, type NextDue } from '../lib/time';
import { amountText, doseState } from '../lib/medication';
import { doneIds, planForDay, type PlanEntry } from '../lib/plan';
import { routineTitle } from '../lib/labels';
import { isKind, type Kind } from '../lib/domain';
import { useNow } from '../lib/useNow';
import { PetSwitcher } from '../components/PetSwitcher';
import { PetAvatar } from '../components/PetAvatar';
import { UpcomingCard } from '../components/schedule/UpcomingCard';
import { NextDoseCard, stateText, useDoseActions, useTodayDoses } from '../components/schedule/TodayMeds';
import { EmergencyButton } from '../components/more/EmergencyButton';
import { IconCheck, KindIcon } from '../components/Icons';
import { Loading } from '../components/Loading';

export function Today() {
  const { t, lang } = useI18n();
  const { profile, user } = useAuth();
  const { active, myRole } = usePets();
  const location = useLocation();
  const navigate = useNavigate();
  const now = useNow();
  const zn = zonedNow(now);
  const [items, setItems] = useState<RoutineRow[] | null>(null);
  // Eintrags-ID → Person, die heute abgehakt hat
  const [done, setDone] = useState<Map<string, string>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [flash] = useState(() => {
    const f = (location.state as { flash?: unknown } | null)?.flash;
    return typeof f === 'string' ? f : '';
  });
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  // Medikamente im Plan: gemeinsamer Stand mit „Heute: Medikamente“ und dem Tagesplan
  const doses = useTodayDoses();
  const doseActions = useDoseActions(doses, (text) => setStatus(text), () => undefined);

  // Meldung nur einmal zeigen: aus dem Verlauf entfernen, damit sie beim Neuladen nicht wiederkommt.
  const flashCleared = useRef(false);
  const { pathname } = location;
  useEffect(() => {
    if (!flash || flashCleared.current) return;
    flashCleared.current = true;
    navigate(pathname, { replace: true, state: null });
  }, [flash, navigate, pathname]);

  const load = useCallback(async (petId: string, date: string) => {
    try {
      const rows = await listRoutine(petId);
      const doneMap = await listDone(rows.map((r) => r.id), date);
      setItems(rows);
      setDone(doneMap);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }, []);

  const petId = active?.id;
  // zn.date ändert sich um Mitternacht → neu laden
  useEffect(() => {
    setItems(null);
    if (petId) void load(petId, zn.date);
  }, [petId, zn.date, load]);

  // Andere Betreuer haken auch ab: beim Zurückkehren ins Fenster und jede Minute still neu laden.
  const latest = useRef({ petId, date: zn.date });
  useEffect(() => {
    latest.current = { petId, date: zn.date };
  }, [petId, zn.date]);
  useEffect(() => {
    const refresh = () => {
      const { petId: id, date } = latest.current;
      if (id && document.visibilityState === 'visible') void load(id, date);
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  // Namen der Betreuer für „erledigt von …“: einmal pro Tier
  useEffect(() => {
    setNames(new Map());
    if (!petId) return;
    let alive = true;
    listMembers(petId)
      .then((ms) => alive && setNames(new Map(ms.map((m) => [m.userId, m.name]))))
      .catch((e: unknown) => console.error(e));
    return () => {
      alive = false;
    };
  }, [petId]);

  if (!active) return null;

  const todays = items ? planForDay(items, doses.data?.meds ?? [], active.id, zn.date, zn.weekday) : [];
  const allDone = doneIds(done, doses.data?.doses ?? new Map());
  const next = items ? nextDue(todays, allDone, zn) : null;
  const name = profile?.display_name?.trim();
  // Nur ansehen: Abhaken ist gesperrt (die Datenbank verhindert es ohnehin)
  const readOnly = !canEdit(myRole(active));

  /** Abhaken: Tagesplan über routine_done, Medikamente als Gabe (wie unter „Heute: Medikamente“) */
  async function toggleEntry(e: Entry) {
    if (readOnly) return;
    if (e.type === 'routine') return toggle(e.item);
    const given = doses.data?.doses.get(e.id);
    const p = { med: e.med, time: e.time };
    if (given) await doseActions.undo(p, given);
    else await doseActions.give(p);
  }

  async function toggle(item: RoutineRow) {
    if (readOnly) return;
    const isDone = done.has(item.id);
    const title = routineTitle(item, t);
    const time = formatTime(toHHMM(item.time_of_day), lang);
    setPending(item.id);
    try {
      if (isDone) await markUndone(item.id, zn.date);
      else await markDone(item.id, zn.date);
      setDone((prev) => {
        const m = new Map(prev);
        if (isDone) m.delete(item.id);
        else if (user) m.set(item.id, user.id);
        return m;
      });
      setStatus(t(isDone ? 'gpUndone' : 'gpDoneSaved', { k: title, t: time }));
    } catch (e) {
      console.error(e);
      setStatus(t('errGeneric'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <p className="label">{formatDate(now, lang)}</p>
        <h1>{name ? t('helloName', { name }) : t('hello')}</h1>
      </header>

      {flash && <p className="notice notice-ok" role="status">{flash}</p>}

      <EmergencyButton />

      <PetSwitcher />

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!items && !error && <Loading />}

      {items && (
        <>
          {readOnly && <p className="notice notice-info" id="view-only-hint">{t('viewOnlyHint')}</p>}
          <NextCard pet={active} next={next} hasToday={todays.length > 0} onDone={toggleEntry} pending={next?.item.type === 'med' ? doseActions.pending : pending} readOnly={readOnly} />

          <section className="card" aria-labelledby="today-h">
            <div className="card-head">
              <h2 id="today-h">{t('todayH')}</h2>
              <Link to="/alltag" className="link">{t('toPlan')}</Link>
            </div>
            {todays.length === 0 ? (
              <p className="muted">{t('todayEmpty')}</p>
            ) : (
              <ul className="today-list">
                {todays.map((e) => {
                  const isDone = allDone.has(e.id);
                  const title = entryTitle(e, t, lang);
                  const time = formatTime(toHHMM(e.time_of_day), lang);
                  const past = toMinutes(e.time_of_day) < zn.minutes;
                  const kind = e.type === 'med' ? 'med' : e.item.kind;
                  let pill: string | null = null;
                  if (isDone && e.type === 'routine') {
                    const by = doneByName(done.get(e.id), user?.id, names);
                    pill = by ? t('doneBy', { name: by }) : t('isDone');
                  } else if (isDone && e.type === 'med') {
                    pill = stateText(doseState(zn.date, e.time, now, doses.data?.doses.get(e.id)), user?.id, doses.data?.names ?? new Map(), t);
                  }
                  const busy = e.type === 'med' ? doseActions.pending === e.id : pending === e.id;
                  return (
                    <li key={e.id} className={`today-row${isDone ? ' is-done' : ''}${past && !isDone ? ' is-past' : ''}${e.type === 'med' ? ' plan-med' : ''}`}>
                      <button
                        type="button"
                        className="check"
                        aria-pressed={isDone}
                        aria-label={t('markDone', { x: title, t: time })}
                        aria-disabled={readOnly || undefined}
                        aria-describedby={readOnly ? 'view-only-hint' : undefined}
                        disabled={busy}
                        onClick={() => void toggleEntry(e)}
                      >
                        <IconCheck size={20} />
                      </button>
                      <span className="time mono">{time}</span>
                      {isKind(kind) && <KindIcon kind={kind} size={20} className="kind-icon" />}
                      <span className="today-title">{title}</span>
                      {pill && <span className="pill pill-ok">{pill}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
      <NextDoseCard />
      <UpcomingCard onStatus={setStatus} />
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </div>
  );
}

function NextCard({
  pet,
  next,
  hasToday,
  onDone,
  pending,
  readOnly,
}: {
  pet: PetRow;
  readOnly: boolean;
  next: NextDue<Entry> | null;
  hasToday: boolean;
  onDone: (e: Entry) => Promise<void>;
  pending: string | null;
}) {
  const { t, lang } = useI18n();
  const head = (
    <div className="next-head">
      <h2 id="next-h" className="label">{t('gpNext')}</h2>
      <span className="next-pet">
        <PetAvatar pet={pet} size={28} fallback={false} className="pet-photo-sm" />
        <span>{pet.name}</span>
      </span>
    </div>
  );
  if (!next) {
    return (
      <section className="card next-card is-empty" aria-labelledby="next-h">
        {head}
        <p className="next-empty">{hasToday ? t('gpRest') : t('todayEmpty')}</p>
      </section>
    );
  }
  const { item } = next;
  let rel: string;
  if (next.state === 'now') rel = t('gpNow');
  else {
    const { h, m } = splitMinutes(next.inMin);
    rel = h === 0 ? t('gpIn', { m }) : m === 0 ? t('gpInHr', { h }) : t('gpInH', { h, m });
  }
  const time = formatTime(toHHMM(item.time_of_day), lang);
  return (
    <section className={`card next-card${next.state === 'now' ? ' is-now' : ''}`} aria-labelledby="next-h">
      {head}
      <div className="next-main">
        {(item.type === 'med' || isKind(item.item.kind)) && (
          <span className="next-icon">
            <KindIcon kind={item.type === 'med' ? 'med' : (item.item.kind as Kind)} size={28} />
          </span>
        )}
        <div className="next-text">
          <p className="next-title">{entryTitle(item, t, lang)}</p>
          <p className="next-meta">
            <span className="mono">{t('gpAt', { t: time })}</span>
            <span className={`pill${next.state === 'now' ? ' pill-accent' : ''}`}>{rel}</span>
            {next.state === 'now' && next.overdueMin > 0 && <span className="muted">{t('overdueSince', { m: next.overdueMin })}</span>}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={pending === item.id}
        aria-disabled={readOnly || undefined}
        aria-describedby={readOnly ? 'view-only-hint' : undefined}
        onClick={() => void onDone(item)}
      >
        <IconCheck size={20} />
        {t('gpDoneBtn')}
      </button>
    </section>
  );
}

type Entry = PlanEntry<RoutineRow, MedicationRow>;

/** Tagesplan: Art oder eigene Bezeichnung; Medikament: „Meloxicam · 0,5 ml“ */
function entryTitle(e: Entry, t: ReturnType<typeof useI18n>['t'], lang: Parameters<typeof localeOf>[0]): string {
  return e.type === 'routine' ? routineTitle(e.item, t) : `${e.med.name} · ${amountText(e.med, t, localeOf(lang))}`;
}
