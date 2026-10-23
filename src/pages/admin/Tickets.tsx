import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
  TICKET_LIMITS,
  createTicket,
  listTickets,
  ticketInputError,
  updateTicket,
  type TicketRow,
  type TicketStatus,
} from '../../lib/staff';

type Filter = TicketStatus | 'all';

/** Ticket-Übersicht für Support und Admin: filtern, Status ändern, interne Notiz, manuell anlegen. */
export function Tickets({ staffId }: { staffId: string }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus>('open');

  useEffect(() => {
    let alive = true;
    listTickets(filter)
      .then((data) => alive && setRows(data))
      .catch(() => alive && setMessage(t('ticketsFail')));
    return () => {
      alive = false;
    };
  }, [filter, version, t]);

  function statusLabel(s: TicketStatus) {
    if (s === 'open') return t('ticketsOpen');
    if (s === 'in_progress') return t('ticketsInProgress');
    return t('ticketsClosed');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const err = ticketInputError({ sender, subject, body, note });
    if (err) {
      setMessage(err === 'required' ? t('ticketsRequired') : t('ticketsTooLong'));
      return;
    }
    try {
      await createTicket({ sender, subject, body, status: newStatus, note }, staffId);
      setSender('');
      setSubject('');
      setBody('');
      setNote('');
      setNewStatus('open');
      setMessage(t('ticketsSaved'));
      setVersion((v) => v + 1);
    } catch {
      setMessage(t('ticketsFail'));
    }
  }

  return (
    <section aria-labelledby="tickets-title">
      <h2 id="tickets-title">{t('ticketsTitle')}</h2>

      <label htmlFor="ticket-filter">{t('ticketsFilter')}</label>
      <select id="ticket-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
        <option value="all">{t('ticketsAll')}</option>
        <option value="open">{t('ticketsOpen')}</option>
        <option value="in_progress">{t('ticketsInProgress')}</option>
        <option value="closed">{t('ticketsClosed')}</option>
      </select>

      {message && <p role="status">{message}</p>}

      {rows && rows.length === 0 && <p>{t('ticketsEmpty')}</p>}

      {rows && rows.length > 0 && (
        <ul aria-label={t('ticketsTitle')}>
          {rows.map((row) => (
            <TicketItem
              key={row.id + ':' + row.status}
              row={row}
              statusLabel={statusLabel}
              onChanged={() => {
                setMessage(t('ticketsSaved'));
                setVersion((v) => v + 1);
              }}
              onError={setMessage}
            />
          ))}
        </ul>
      )}

      <form onSubmit={onCreate} aria-labelledby="ticket-new-title">
        <h3 id="ticket-new-title">{t('ticketsNewTitle')}</h3>
        <label htmlFor="ticket-sender">{t('ticketsSender')}</label>
        <input id="ticket-sender" value={sender} maxLength={TICKET_LIMITS.sender} onChange={(e) => setSender(e.target.value)} />
        <label htmlFor="ticket-subject">{t('ticketsSubject')}</label>
        <input id="ticket-subject" value={subject} maxLength={TICKET_LIMITS.subject} onChange={(e) => setSubject(e.target.value)} />
        <label htmlFor="ticket-body">{t('ticketsBody')}</label>
        <textarea id="ticket-body" value={body} maxLength={TICKET_LIMITS.body} onChange={(e) => setBody(e.target.value)} />
        <label htmlFor="ticket-new-status">{t('ticketsFilter')}</label>
        <select id="ticket-new-status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as TicketStatus)}>
          <option value="open">{t('ticketsOpen')}</option>
          <option value="in_progress">{t('ticketsInProgress')}</option>
          <option value="closed">{t('ticketsClosed')}</option>
        </select>
        <label htmlFor="ticket-new-note">{t('ticketsNote')}</label>
        <textarea id="ticket-new-note" value={note} maxLength={TICKET_LIMITS.note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit">{t('ticketsCreate')}</button>
      </form>
    </section>
  );
}

function TicketItem({
  row,
  statusLabel,
  onChanged,
  onError,
}: {
  row: TicketRow;
  statusLabel: (s: TicketStatus) => string;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<TicketStatus>(row.status);
  const [note, setNote] = useState(row.staff_note ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (note.trim().length > TICKET_LIMITS.note) {
      onError(t('ticketsTooLong'));
      return;
    }
    setBusy(true);
    try {
      await updateTicket(row.id, { status, staff_note: note.trim() || null });
      onChanged();
    } catch {
      onError(t('ticketsFail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <h3>{row.subject}</h3>
      <p>
        {statusLabel(row.status)} · {row.sender ?? '–'} · {new Date(row.created_at).toLocaleDateString(lang)}
      </p>
      <p>{row.body}</p>
      <label htmlFor={`ticket-status-${row.id}`}>{t('ticketsFilter')}</label>
      <select id={`ticket-status-${row.id}`} value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
        <option value="open">{t('ticketsOpen')}</option>
        <option value="in_progress">{t('ticketsInProgress')}</option>
        <option value="closed">{t('ticketsClosed')}</option>
      </select>
      <label htmlFor={`ticket-note-${row.id}`}>{t('ticketsNote')}</label>
      <textarea id={`ticket-note-${row.id}`} value={note} maxLength={TICKET_LIMITS.note + 50} onChange={(e) => setNote(e.target.value)} />
      <button type="button" onClick={save} disabled={busy}>
        {t('ticketsSave')}
      </button>
    </li>
  );
}
