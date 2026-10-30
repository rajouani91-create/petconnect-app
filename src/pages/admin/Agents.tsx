import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Loading } from '../../components/Loading';
import { staffRoleFor, type StaffRole } from '../../lib/staff';
import { AGENTS, STAGE_RULE, TRELLO_BOARD_URL, agentById, agentCount, linkedAgentId, type Agent, type AgentIconKey } from '../../lib/agents';

// Interner Bereich nur für Admins, deshalb bewusst nur Deutsch und ohne die Sprachdateien der App.

const ICON_PATHS: Record<AgentIconKey, ReactNode> = {
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.4.1 4 1.6 4.5 4.3" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5L15.5 10" /></>,
  code: <><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /><path d="M13.5 5l-3 14" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  megaphone: <><path d="M4 10v4h3l8 4V6L7 10z" /><path d="M18 9.5c1.3.6 2 1.4 2 2.5s-.7 1.9-2 2.5" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  heart: <><path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z" /></>,
  pulse: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.6-2-.5-1.2.3-2.5 1.7-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3z" /><circle cx="8" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /></>,
};

function AgentIcon({ name, size = 28 }: { name: AgentIconKey; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Zugang nur für Admins; die Datenbank prüft Rollen ebenfalls bei jeder Abfrage. */
export function Agents() {
  const { user } = useAuth();
  const { agentId } = useParams();
  const [role, setRole] = useState<StaffRole | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    staffRoleFor(user.id)
      .then((r) => alive && setRole(r))
      .catch(() => alive && setRole(null));
    return () => {
      alive = false;
    };
  }, [user]);

  if (role === undefined) return <Loading />;
  if (role !== 'admin') return <Navigate to="/" replace />;

  if (agentId) {
    const agent = agentById(agentId);
    if (!agent) return <Navigate to="/admin/agenten" replace />;
    return <AgentDetail agent={agent} />;
  }
  return <AgentGrid />;
}

function AgentGrid() {
  return (
    <main className="page" aria-labelledby="agents-title">
      <p className="small"><Link to="/admin">← Support-Bereich</Link></p>
      <h1 id="agents-title">Agenten</h1>
      <p>
        {agentCount()} KI-Agenten arbeiten für PetConnect24 und eine Systemfunktion. Die Agenten laufen als geplante Aufgaben in Claude und legen ihre Ergebnisse als Karten in Trello ab. Diese Seite zeigt, was sie tun und wann.
      </p>
      <p className="agents-note" role="note">
        <strong>Stand der Anzeige:</strong> Die Angaben werden von Hand gepflegt. Ob ein Lauf gerade läuft, fertig ist oder fehlgeschlagen ist, zeigt diese Seite noch nicht. Das kommt mit der Trello-Anbindung. Bis dahin finden Sie die Ergebnisse in Trello.
      </p>
      <ul className="agents-grid" aria-label="Agenten">
        {AGENTS.map((a) => (
          <li key={a.id}>
            <article className={`agent-tile${a.kind === 'system' ? ' is-system' : ''}`} aria-labelledby={`agent-${a.id}`}>
              <div className="agent-icon"><AgentIcon name={a.icon} /></div>
              <h2 id={`agent-${a.id}`}>{a.name}</h2>
              <p className="agent-short">{a.short}</p>
              <p className="agent-when small muted"><span className="label">{a.kind === 'system' ? 'System' : 'Zeitplan'}</span> {a.schedule}</p>
              <Link className="btn btn-secondary btn-block" to={`/admin/agenten/${a.id}`} aria-label={`${a.name} öffnen`}>Öffnen</Link>
            </article>
          </li>
        ))}
      </ul>
      <p className="small muted">{STAGE_RULE}</p>
      <p className="small"><a href={TRELLO_BOARD_URL} target="_blank" rel="noopener noreferrer">Trello-Board „PetConnect“ öffnen</a></p>
    </main>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="agent-chips">
      {items.map((label) => {
        const id = linkedAgentId(label);
        return <li key={label}>{id ? <Link to={`/admin/agenten/${id}`}>{label}</Link> : <span>{label}</span>}</li>;
      })}
    </ul>
  );
}

function AgentDetail({ agent }: { agent: Agent }) {
  const isSystem = agent.kind === 'system';
  return (
    <main className="page" aria-labelledby="agent-title">
      <p className="small"><Link to="/admin/agenten">← Alle Agenten</Link></p>
      <header className="agent-head">
        <div className="agent-icon"><AgentIcon name={agent.icon} size={32} /></div>
        <div>
          <h1 id="agent-title">{agent.name}</h1>
          <p className="muted">{isSystem ? 'Systemfunktion der App' : 'KI-Agent, Stufe 1 (nur Entwürfe)'}</p>
        </div>
      </header>

      <section aria-labelledby="ag-task" className="agent-block">
        <h2 id="ag-task">Aufgabe</h2>
        <p>{agent.task}</p>
      </section>

      <section aria-labelledby="ag-when" className="agent-block">
        <h2 id="ag-when">Zeitplan</h2>
        <p>{agent.schedule}</p>
        <p className="small muted">Zeiten in Berlin. {isSystem ? 'Läuft ohne Zutun.' : 'Ob der letzte Lauf erfolgreich war, zeigt diese Seite noch nicht. Die Berichte stehen in Trello.'}</p>
      </section>

      <section aria-labelledby="ag-out" className="agent-block">
        <h2 id="ag-out">Ergebnis</h2>
        <p>{agent.output}</p>
      </section>

      <div className="agent-cols">
        <section aria-labelledby="ag-in" className="agent-block">
          <h2 id="ag-in">Bekommt Informationen von</h2>
          <Chips items={agent.inputs} />
        </section>
        <section aria-labelledby="ag-to" className="agent-block">
          <h2 id="ag-to">Gibt weiter an</h2>
          <Chips items={agent.outputsTo} />
        </section>
      </div>

      <section aria-labelledby="ag-rules" className="agent-block">
        <h2 id="ag-rules">Regeln</h2>
        <ul>
          {agent.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {!isSystem && <p className="small muted">{STAGE_RULE}</p>}
      </section>

      <p>
        <a className="btn btn-primary" href={agent.trelloUrl} target="_blank" rel="noopener noreferrer">
          {isSystem ? 'Trello-Board öffnen' : 'Steckbrief in Trello öffnen'}
        </a>
      </p>
    </main>
  );
}
