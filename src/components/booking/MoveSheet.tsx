import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../../i18n';
import { NOTE_MAX, bookingOwnerErrorKey, moveBooking, moveSlots, slotsByDay } from '../../lib/booking';
import { dayOf, timeOf } from '../../lib/practiceAppointments';
import { Dialog } from '../Dialog';

interface Props {
  /** Termin in der Terminliste der Halter:in */
  appt: { id: string; title: string; starts_at: string } | null;
  today: string;
  onClose: () => void;
  /** Nach dem Verschieben: Meldung für die Statuszeile */
  onDone: (msg: string) => void;
}

/** Termin verschieben (Release C): Tag wählen, freie Zeit wählen, Notiz an die Praxis. */
export function MoveSheet({ appt, today, onClose, onDone }: Props) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [days, setDays] = useState<{ day: string; slots: string[] }[] | null>(null);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const id = appt?.id;

  useEffect(() => {
    if (!id) return;
    let live = true;
    setDays(null);
    setErr(null);
    moveSlots(id, today, 14)
      .then((s) => {
        if (!live) return;
        const g = slotsByDay(s, dayOf);
        setDays(g);
        setDay((d) => (g.some((x) => x.day === d) ? d : g[0]?.day ?? ''));
      })
      .catch((e: unknown) => { if (live) { console.error(e); setDays([]); setErr(bookingOwnerErrorKey(e)); } });
    return () => { live = false; };
  }, [id, today, reload]);

  useEffect(() => {
    if (!id) { setSlot(''); setNote(''); setDay(''); }
  }, [id]);

  const dayLabel = (d: string) => formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'short' });
  const dayNum = (d: string) => formatDate(new Date(`${d}T12:00:00Z`), lang, { day: 'numeric', month: 'numeric' });
  const when = (iso: string) => `${formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(iso)}`;
  const list = days?.find((x) => x.day === day)?.slots ?? [];

  async function submit() {
    if (!appt || !slot) { setErr('obErrSlot'); return; }
    if (note.trim().length > NOTE_MAX) { setErr('obErrLong'); return; }
    setBusy(true);
    setErr(null);
    try {
      await moveBooking(appt.id, slot, note);
      onDone(t('obMoved', { x: appt.title, d: when(slot) }));
    } catch (e) {
      console.error(e);
      const k = bookingOwnerErrorKey(e);
      setErr(k);
      if (k === 'obErrTaken') { setSlot(''); setReload((n) => n + 1); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={appt !== null} sheet title={t('obMoveTitle')} onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !slot} aria-busy={busy} onClick={() => void submit()}>
            {slot ? t('obMoveTo', { d: when(slot) }) : t('obMoveBtn')}
          </button>
        </>
      )}>
      {appt && (
        <div className="stack">
          <p className="muted small">{t('obMoveBefore', { d: when(appt.starts_at), x: appt.title })}</p>
          {days === null && <p className="muted">{t('loading')}</p>}
          {days && days.length === 0 && !err && <p className="notice notice-info">{t('obMoveNone')}</p>}
          {days && days.length > 0 && (
            <>
              <div className="move-days" role="group" aria-label={t('obMoveDay')}>
                {days.map((d) => (
                  <button key={d.day} type="button" className="move-day" aria-pressed={d.day === day}
                    aria-label={formatDate(new Date(`${d.day}T12:00:00Z`), lang, { weekday: 'long', day: 'numeric', month: 'long' })}
                    onClick={() => { setDay(d.day); setSlot(''); setErr(null); }}>
                    <span className="move-day-wd">{dayLabel(d.day)}</span>
                    <span className="move-day-n">{dayNum(d.day)}</span>
                  </button>
                ))}
              </div>
              <div className="move-slots" role="group" aria-label={t('bkFree')}>
                {list.map((iso) => (
                  <button key={iso} type="button" className="chip" aria-pressed={iso === slot} onClick={() => { setSlot(iso); setErr(null); }}>{timeOf(iso)}</button>
                ))}
              </div>
            </>
          )}
          <label className="field" htmlFor={`${uid}-note`}>
            <span className="label-text">{t('obMoveNote')} <span className="muted small">({t('optional')})</span></span>
            <textarea id={`${uid}-note`} rows={3} maxLength={NOTE_MAX} value={note} placeholder={t('obMoveNotePh')} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="muted small">{t('obMoveInfo')}</p>
          {err && <p className="notice notice-crit" role="alert">{t(err)}</p>}
        </div>
      )}
    </Dialog>
  );
}
