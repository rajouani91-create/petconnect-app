import { describe, expect, it } from 'vitest';
import { AGENTS, TRELLO_BOARD_URL, agentById, agentCount, linkedAgentId } from './agents';

describe('Agentenverzeichnis', () => {
  it('enthält elf KI-Agenten und die Push-Systemfunktion', () => {
    expect(agentCount()).toBe(11);
    expect(AGENTS.filter((a) => a.kind === 'system').map((a) => a.id)).toEqual(['push']);
  });

  it('hat eindeutige Kennungen', () => {
    const ids = AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('füllt jede Angabe, die die Kachel und die Detailansicht anzeigen', () => {
    const incomplete = AGENTS.filter(
      (a) =>
        [a.name, a.short, a.task, a.schedule, a.output].some((v) => v.trim() === '') ||
        a.rules.length === 0 ||
        a.inputs.length === 0 ||
        a.outputsTo.length === 0,
    ).map((a) => a.id);
    expect(incomplete).toEqual([]);
  });

  it('verlinkt nur auf Trello über https', () => {
    const wrong = AGENTS.filter((a) => !a.trelloUrl.startsWith('https://trello.com/')).map((a) => a.id);
    expect(wrong).toEqual([]);
    expect(TRELLO_BOARD_URL).toMatch(/^https:\/\/trello\.com\/b\//);
  });

  it('enthält keine Schlüssel oder Zugangsdaten', () => {
    const text = JSON.stringify(AGENTS);
    expect(text).not.toMatch(/trig_[A-Za-z0-9]+/);
    expect(text).not.toMatch(/api[_-]?key|token|secret|passwor/i);
  });

  it('findet einen Agenten über seine Kennung', () => {
    expect(agentById('support')?.name).toBe('Support');
    expect(agentById('gibt-es-nicht')).toBeUndefined();
    expect(agentById(undefined)).toBeUndefined();
  });

  it('ordnet Eingänge und Ausgänge den Agenten zu, soweit sie einer sind', () => {
    expect(linkedAgentId('Marktpenetration (gewählter Weg)')).toBe('markt');
    expect(linkedAgentId('Zahlen')).toBe('zahlen');
    expect(linkedAgentId('Marketing (Praxis-Texte)')).toBe('marketing');
    expect(linkedAgentId('Sie über Trello')).toBeNull();
    expect(linkedAgentId('Repository (lesend)')).toBeNull();
  });
});
