import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatTime } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { listDone, listMembers, listRoutine, markDone, markUndone } from '../lib/api';
import { canEdit, doneByName } from '../lib/sharing';
import type { PetRow, RoutineRow } from '../lib/supabase';
import { itemsForDay, nextDue, splitMinutes, toHHMM, toMinutes, zonedNow, type NextDue } from '../lib/time';
import { routineTitle } from '../lib/labels';
import { isKind } from '../lib/domain';
import { useNow } from '../lib/useNow';
import { PetSwitcher } from '../components/PetSwitcher';
import { PetAvatar } from '../components/PetAvatar';
import { UpcomingCard } from '../components/schedule/UpcomingCard';
import { NextDoseCard } from '../components/schedule/TodayMeds';
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

  const todays = items ? itemsForDay(items, zn.weekday) : [];
  const next = items ? nextDue(items, done, zn) : null;
  const name = profile?.display_name?.trim();
  // Nur ansehen: Abhaken ist gesperrt (die Datenbank verhindert es ohnehin)
  const readOnly = !canEdit(myRole(active));

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
          <NextCard pet={active} next={next} hasToday={todays.length > 0} onDone={toggle} pending={pending} readOnly={readOnly} />

          <section className="card" aria-labelledby="today-h">
            <div className="card-head">
              <h2 id="today-h">{t('todayH')}</h2>
              <Link to="/alltag" className="link">{t('toPlan')}</Link>
            </div>
            {todays.length === 0 ? (
              <p className="muted">{t('todayEmpty')}</p>
            ) : (
              <ul className="today-list">
                {todays.map((item) => {
                  const isDone = done.has(item.id);
                  const by = isDone ? doneByName(done.get(item.id), user?.id, names) : null;
                  const title = routineTitle(item, t);
                  const time = formatTime(toHHMM(item.time_of_day), lang);
                  const past = toMinutes(item.time_of_day) < zn.minutes;
                  return (
                    <li key={item.id} className={`today-row${isDone ? ' is-done' : ''}${past && !isDone ? ' is-past' : ''}`}>
                      <button
                        type="button"
                        className="check"
                        aria-pressed={isDone}
                        aria-label={t('markDone', { x: title, t: time })}
                        aria-disabled={readOnly || undefined}
                        aria-describedby={readOnly ? 'view-only-hint' : undefined}
                        disabled={pending === item.id}
                        onClick={() => void toggle(item)}
                      >
                        <IconCheck size={20} />
                      </button>
                      <span className="time mono">{time}</span>
                      {isKind(item.kind) && <KindIcon kind={item.kind} size={20} className="kind-icon" />}
                      <span className="today-title">{title}</span>
                      {isDone && <span className="pill pill-ok">{by ? t('doneBy', { name: by }) : t('isDone')}</span>}
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
  next: NextDue<RoutineRow> | null;
  hasToday: boolean;
  onDone: (item: RoutineRow) => Promise<void>;
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
        {isKind(item.kind) && (
          <span className="next-icon">
            <KindIcon kind={item.kind} size={28} />
          </span>
        )}
        <div className="next-text">
          <p className="next-title">{routineTitle(item, t)}</p>
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
