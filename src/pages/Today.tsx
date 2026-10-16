import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatTime } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { usePets } from '../pets/PetsProvider';
import { listDone, listRoutine, markDone, markUndone } from '../lib/api';
import type { RoutineRow } from '../lib/supabase';
import { itemsForDay, nextDue, splitMinutes, toHHMM, toMinutes, zonedNow, type NextDue } from '../lib/time';
import { routineTitle } from '../lib/labels';
import { isKind } from '../lib/domain';
import { useNow } from '../lib/useNow';
import { PetSwitcher } from '../components/PetSwitcher';
import { IconCheck, KindIcon } from '../components/Icons';
import { Loading } from '../components/Loading';

export function Today() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const { active } = usePets();
  const now = useNow();
  const zn = zonedNow(now);
  const [items, setItems] = useState<RoutineRow[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async (petId: string, date: string) => {
    try {
      setError(false);
      const rows = await listRoutine(petId);
      setItems(rows);
      setDone(await listDone(rows.map((r) => r.id), date));
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

  if (!active) return null;

  const todays = items ? itemsForDay(items, zn.weekday) : [];
  const next = items ? nextDue(items, done, zn) : null;
  const name = profile?.display_name?.trim();

  async function toggle(item: RoutineRow) {
    const isDone = done.has(item.id);
    const title = routineTitle(item, t);
    const time = formatTime(toHHMM(item.time_of_day), lang);
    setPending(item.id);
    try {
      if (isDone) await markUndone(item.id, zn.date);
      else await markDone(item.id, zn.date);
      setDone((prev) => {
        const s = new Set(prev);
        if (isDone) s.delete(item.id);
        else s.add(item.id);
        return s;
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

      <PetSwitcher />

      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!items && !error && <Loading />}

      {items && (
        <>
          <NextCard next={next} hasToday={todays.length > 0} onDone={toggle} pending={pending} />

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
                        disabled={pending === item.id}
                        onClick={() => void toggle(item)}
                      >
                        <IconCheck size={20} />
                      </button>
                      <span className="time mono">{time}</span>
                      {isKind(item.kind) && <KindIcon kind={item.kind} size={20} className="kind-icon" />}
                      <span className="today-title">{title}</span>
                      {isDone && <span className="pill pill-ok">{t('isDone')}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </div>
  );
}

function NextCard({
  next,
  hasToday,
  onDone,
  pending,
}: {
  next: NextDue<RoutineRow> | null;
  hasToday: boolean;
  onDone: (item: RoutineRow) => Promise<void>;
  pending: string | null;
}) {
  const { t, lang } = useI18n();
  if (!next) {
    return (
      <section className="card next-card is-empty" aria-labelledby="next-h">
        <h2 id="next-h" className="label">{t('gpNext')}</h2>
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
      <h2 id="next-h" className="label">{t('gpNext')}</h2>
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
      <button type="button" className="btn btn-primary btn-block" disabled={pending === item.id} onClick={() => void onDone(item)}>
        <IconCheck size={20} />
        {t('gpDoneBtn')}
      </button>
    </section>
  );
}
