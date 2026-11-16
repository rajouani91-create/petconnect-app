import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatIsoDate, type MessageKey } from '../i18n';
import { Field } from '../components/Field';
import { IconBack } from '../components/Icons';
import { Loading } from '../components/Loading';
import { useLocalToday } from '../components/schedule/shared';
import {
  NOTE_MAX, PHONE_MAX, addDays, bookAtPractice, bookingFormErrors, bookingFreeSlots, bookingOptions, bookingOwnerErrorKey, bookingPractices,
  emptyBookingForm, practiceAddress, type BookingForm, type BookingOptions, type BookingPractice,
} from '../lib/booking';
import { dayOf, timeOf } from '../lib/practiceAppointments';

/** Termin bei einer Praxis online anfragen (Etappe P5c) */
export function BookAppointment() {
  const { t } = useI18n();
  const [practice, setPractice] = useState<BookingPractice | null>(null);
  const [done, setDone] = useState<{ practice: string; slot: string } | null>(null);

  return (
    <div className="page stack-lg">
      <Link to="/termine" className="back-link"><IconBack size={20} />{t('nav_termine')}</Link>
      <header className="page-head">
        <h1>{t('obTitle')}</h1>
        {!practice && !done && <p className="muted">{t('obIntro')}</p>}
      </header>
      {done ? (
        <Done practice={done.practice} slot={done.slot} onAgain={() => { setDone(null); setPractice(null); }} />
      ) : practice ? (
        <BookForm practice={practice} onBack={() => setPractice(null)} onDone={(slot) => setDone({ practice: practice.name, slot })} />
      ) : (
        <PracticePicker onPick={setPractice} />
      )}
    </div>
  );
}

function PracticeList({ list, onPick }: { list: BookingPractice[]; onPick: (p: BookingPractice) => void }) {
  const { t } = useI18n();
  return (
    <ul className="record-list">
      {list.map((p) => (
        <li key={p.id} className="record-row">
          <div className="record-main">
            <span className="record-title">{p.name}{p.linked && <span className="pill pill-ok">{t('obLinked')}</span>}</span>
            <span className="small muted">{practiceAddress(p)}</span>
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" aria-label={t('obPickL', { p: p.name })} onClick={() => onPick(p)}>{t('obPick')}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PracticePicker({ onPick }: { onPick: (p: BookingPractice) => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [mine, setMine] = useState<BookingPractice[] | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; list: BookingPractice[] } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    bookingPractices('').then(setMine).catch((e: unknown) => { console.error(e); setErr(true); setMine([]); });
  }, []);
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const h = window.setTimeout(() => {
      bookingPractices(q)
        .then((list) => { if (alive) setFound({ q, list }); })
        .catch((e: unknown) => { console.error(e); if (alive) setFound({ q, list: [] }); });
    }, 300);
    return () => { alive = false; window.clearTimeout(h); };
  }, [q]);
  const results = q.length >= 2 && found?.q === q ? found.list : null;

  return (
    <>
      {err && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {mine === null ? <Loading /> : mine.length > 0 && (
        <section className="card stack" aria-labelledby={`${uid}-mine`}>
          <h2 id={`${uid}-mine`}>{t('obMine')}</h2>
          <PracticeList list={mine} onPick={onPick} />
        </section>
      )}
      <section className="card stack" aria-labelledby={`${uid}-search`}>
        <h2 id={`${uid}-search`}>{t('obSearch')}</h2>
        <Field id={`${uid}-q`} label={t('obSearchLabel')} hint={t('obSearchHint')}>
          {(a) => <input {...a} type="search" maxLength={80} autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        <div aria-live="polite">
          {q.length >= 2 && (results === null ? <Loading /> : results.length === 0 ? <p className="muted">{t('obNoResults')}</p> : <PracticeList list={results} onPick={onPick} />)}
        </div>
        <p className="muted small">{t('obOnlyOnline')}</p>
      </section>
    </>
  );
}

function BookForm({ practice, onBack, onDone }: { practice: BookingPractice; onBack: () => void; onDone: (slot: string) => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const today = useLocalToday();
  const [opts, setOpts] = useState<BookingOptions | null>(null);
  const [loadErr, setLoadErr] = useState<MessageKey | null>(null);
  const [v, setV] = useState<BookingForm>(() => emptyBookingForm(addDays(today, 1)));
  const [slots, setSlots] = useState<{ key: string; list: string[] } | null>(null);
  const [reload, setReload] = useState(0);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BookingForm, MessageKey>>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<MessageKey | null>(null);
  const set = <K extends keyof BookingForm>(k: K, x: BookingForm[K]) => { setV((c) => ({ ...c, [k]: x })); setErrors((c) => ({ ...c, [k]: undefined })); };

  useEffect(() => {
    let alive = true;
    bookingOptions(practice.id)
      .then((o) => {
        if (!alive) return;
        setOpts(o);
        setV((c) => ({ ...c, petId: o.pets.length === 1 ? o.pets[0]!.id : c.petId, typeId: o.types[0]?.id ?? '' }));
      })
      .catch((e: unknown) => { console.error(e); if (alive) setLoadErr(bookingOwnerErrorKey(e)); });
    return () => { alive = false; };
  }, [practice.id]);

  const key = `${v.typeId}|${v.day}|${reload}`;
  useEffect(() => {
    if (!v.typeId || !v.day) return;
    let alive = true;
    bookingFreeSlots(practice.id, v.typeId, v.day)
      .then((list) => { if (alive) setSlots({ key, list }); })
      .catch(() => { if (alive) setSlots({ key, list: [] }); });
    return () => { alive = false; };
  }, [practice.id, v.typeId, v.day, key]);
  const list = slots?.key === key ? slots.list : null;

  async function nextFree() {
    if (!opts) return;
    setSearching(true);
    try {
      const found = await bookingFreeSlots(practice.id, v.typeId, addDays(v.day, 1), 14);
      if (found[0]) setV((c) => ({ ...c, day: dayOf(found[0]!), slot: '' }));
      else setFail('obNoneSoon');
    } catch (e) {
      setFail(bookingOwnerErrorKey(e));
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!opts) return;
    const errs = bookingFormErrors(v);
    setErrors(errs);
    setFail(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const pet = opts.pets.find((p) => p.id === v.petId);
      await bookAtPractice(practice.id, v, !!pet?.has_access);
      onDone(v.slot);
    } catch (err) {
      const k = bookingOwnerErrorKey(err);
      setFail(k);
      if (k === 'obErrTaken') { set('slot', ''); setReload((n) => n + 1); }
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <section className="card stack">
      <p><strong>{practice.name}</strong><br /><span className="small muted">{practiceAddress(practice)}{practice.phone ? ` · ${practice.phone}` : ''}</span></p>
      <button type="button" className="link-btn" onClick={onBack}>{t('obOther')}</button>
    </section>
  );
  if (loadErr) return <>{head}<p className="notice notice-crit" role="alert">{t(loadErr)}</p></>;
  if (!opts) return <>{head}<Loading /></>;
  if (opts.pets.length === 0) return <>{head}<p className="notice notice-info">{t('obNoPets')}</p></>;
  if (opts.types.length === 0) return <>{head}<p className="notice notice-info">{t('obErrUnavailable')}</p></>;

  const pet = opts.pets.find((p) => p.id === v.petId) ?? null;
  const err = (k: keyof BookingForm) => (errors[k] ? { key: errors[k] } : undefined);
  const canPrev = v.day > today;
  const canNext = v.day < opts.last_day;

  return (
    <>
      {head}
      <form className="card stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="row-2">
          <Field id={`${uid}-pet`} label={t('schedPet')} error={err('petId')} required>
            {(a) => (
              <select {...a} value={v.petId} onChange={(e) => set('petId', e.target.value)}>
                <option value="">{t('rcReasonPick')}</option>
                {opts.pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
          <Field id={`${uid}-type`} label={t('bkType')} error={err('typeId')} required>
            {(a) => (
              <select {...a} value={v.typeId} onChange={(e) => { set('typeId', e.target.value); set('slot', ''); }}>
                {opts.types.map((x) => <option key={x.id} value={x.id}>{x.name} ({t('scMinutes', { n: x.minutes })})</option>)}
              </select>
            )}
          </Field>
        </div>

        <fieldset className="field stack">
          <legend>{t('obWhen')}<span className="req" aria-hidden="true"> *</span></legend>
          <div className="day-nav">
            <button type="button" className="btn btn-ghost" disabled={!canPrev} aria-label={t('obPrevDay')} onClick={() => { set('day', addDays(v.day, -1)); set('slot', ''); }}>‹</button>
            <input id={`${uid}-day`} type="date" aria-label={t('wkDate')} min={today} max={opts.last_day} value={v.day}
              onChange={(e) => { if (e.target.value) { set('day', e.target.value); set('slot', ''); } }} />
            <button type="button" className="btn btn-ghost" disabled={!canNext} aria-label={t('obNextDay')} onClick={() => { set('day', addDays(v.day, 1)); set('slot', ''); }}>›</button>
          </div>
          <p className="small muted">{formatDate(new Date(`${v.day}T12:00:00Z`), lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
          {list === null ? <Loading /> : list.length === 0 ? (
            <div className="stack">
              <p className="muted">{t('bkNoFree')}</p>
              <div><button type="button" className="btn btn-secondary" disabled={searching} onClick={() => void nextFree()}>{t('obNextFree')}</button></div>
            </div>
          ) : (
            <div className="chips-wrap slot-picker" role="group" aria-label={t('bkFree')}>
              {list.map((iso) => (
                <button key={iso} type="button" className="chip" aria-pressed={v.slot === iso} onClick={() => set('slot', iso)}>{timeOf(iso)}</button>
              ))}
            </div>
          )}
          {errors.slot && <p className="error" role="alert">{t(errors.slot)}</p>}
          <p className="small muted">{t('obWindow', { d: formatIsoDate(opts.last_day, lang) })}</p>
        </fieldset>

        <Field id={`${uid}-note`} label={t('obNote')} hint={t('obNoteHint')} error={err('note')} optional>
          {(a) => <textarea {...a} rows={3} maxLength={NOTE_MAX} value={v.note} onChange={(e) => set('note', e.target.value)} />}
        </Field>
        <Field id={`${uid}-phone`} label={t('pf_phone')} hint={t('obPhoneHint')} error={err('phone')} optional>
          {(a) => <input {...a} type="tel" maxLength={PHONE_MAX} autoComplete="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />}
        </Field>

        {pet && (pet.has_access ? (
          <p className="notice notice-info">{t('obHasAccess', { n: pet.name })}</p>
        ) : (
          <div className="stack">
            <label className="check-row">
              <input type="checkbox" checked={v.share} onChange={(e) => set('share', e.target.checked)} />
              <span>{t('obShare', { n: pet.name })}</span>
            </label>
            <p className="small muted">{t('obShareHint')}</p>
          </div>
        ))}
        <p className="small muted">{t('obSees')}</p>
        {fail && <p className="notice notice-crit" role="alert">{t(fail)}</p>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('obSubmit')}</button>
        </div>
      </form>
    </>
  );
}

function Done({ practice, slot, onAgain }: { practice: string; slot: string; onAgain: () => void }) {
  const { t, lang } = useI18n();
  return (
    <section className="card stack" role="status">
      <h2>{t('obDoneTitle')}</h2>
      <p>{t('obDoneText', { p: practice, d: formatIsoDate(dayOf(slot), lang), t: timeOf(slot) })}</p>
      <div className="row-actions">
        <Link to="/termine" className="btn btn-primary">{t('obToList')}</Link>
        <button type="button" className="btn btn-ghost" onClick={onAgain}>{t('obAgain')}</button>
      </div>
    </section>
  );
}
