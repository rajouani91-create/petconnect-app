import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { usePets } from '../../pets/PetsProvider';
import { Loading } from '../../components/Loading';
import { RichText } from '../../components/ai/RichText';
import { AttachPanel, type Prepared } from '../../components/ai/AttachPanel';
import { AI_MAX_INPUT, AiError, askAssistant, type AiAnswer, type AiErrorKind, type AiMessage } from '../../lib/ai';

interface Turn extends AiMessage {
  readonly emergency?: boolean;
  readonly sources?: AiAnswer['sources'];
  readonly used?: readonly string[];
  readonly attached?: string;
}

const ERROR_KEY: Record<AiErrorKind, MessageKey> = {
  auth: 'aiErrAuth', rate_hour: 'aiErrHour', rate_day: 'aiErrDay', rate_global: 'aiErrGlobal', busy: 'aiErrBusy',
  down: 'aiErrDown', network: 'aiErrNetwork', too_long: 'aiErrLong', pet: 'aiErrPet', generic: 'aiErrGeneric',
  consent: 'aiErrConsent', pii: 'aiErrPii', vision_off: 'aiErrVision', attach_bad: 'aiErrAttach', attach_big: 'aiErrAttachBig',
};
const USED_KEY: Record<string, MessageKey> = {
  profile: 'aiU_profile', allergies: 'aiU_allergies', medication_names: 'aiU_medication_names', medication: 'aiU_medication',
  vaccinations: 'aiU_vaccinations', weight: 'aiU_weight', vitals: 'aiU_vitals', labs: 'aiU_labs', history: 'aiU_history', documents: 'aiU_documents',
  breed_database: 'aiU_breed_database', attachment_text: 'aiU_attachment_text', attachment_image: 'aiU_attachment_image',
};

/** Mehr → KI-Assistent. Das Gespräch bleibt nur im Arbeitsspeicher dieser Seite (wird nirgends gespeichert). */
export function Assistant() {
  const { t, lang } = useI18n();
  const { pets, active, loaded } = usePets();
  const [petId, setPetId] = useState<string>('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorKind | null>(null);
  const [attach, setAttach] = useState<Prepared | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Standard: das gerade aktive Tier
  useEffect(() => {
    if (loaded && petId === '' && active) setPetId(active.id);
  }, [loaded, active, petId]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);

  if (!loaded) return <Loading />;

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const att = attach;
    const next: Turn[] = [...turns, { role: 'user', content: q, ...(att ? { attached: att.label } : {}) }];
    setTurns(next);
    setText('');
    setAttach(null); // gilt nur für diese eine Frage
    setError(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const a = await askAssistant(next.map(({ role, content }) => ({ role, content })), petId || null, lang, ctrl.signal, att?.att);
      setTurns([...next, { role: 'assistant', content: a.reply, emergency: a.emergency, sources: a.sources, used: a.used }]);
      setLeft(a.dayLeft);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof AiError ? e.kind : 'generic');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }
  function reset() {
    abortRef.current?.abort();
    setTurns([]);
    setAttach(null);
    setError(null);
    setBusy(false);
  }

  const usedLabel = (used: readonly string[]) =>
    used.map((u) => (USED_KEY[u] ? t(USED_KEY[u]) : u)).join(', ');

  return (
    <div className="page stack ai-page">
      <header className="page-head">
        <h1>{t('aiTitle')}</h1>
        <p className="muted">{t('aiIntro')}</p>
      </header>

      <p className="notice notice-info">{t('aiNotice')}</p>

      <label className="ai-pet" htmlFor="ai-pet">
        <span>{t('aiPet')}</span>
        <select id="ai-pet" value={petId} disabled={busy} onChange={(e) => { setPetId(e.target.value); }}>
          <option value="">{t('aiNoPet')}</option>
          {pets.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
      </label>

      <section className="ai-log" aria-label={t('aiTitle')} aria-live="polite">
        {turns.length === 0 && (
          <div className="ai-suggest">
            {(['aiSug1', 'aiSug2', 'aiSug3'] as const).map((k) => (
              <button key={k} type="button" className="chip" disabled={busy} onClick={() => void send(t(k))}>{t(k)}</button>
            ))}
          </div>
        )}
        {turns.map((m, i) => (
          <article key={i} className={`ai-msg ai-${m.role}`}>
            <h2 className="ai-who">{m.role === 'user' ? t('aiYou') : t('aiBot')}</h2>
            {m.emergency && (
              <p className="notice notice-crit" role="alert">
                <strong>{t('aiEmergency')}</strong>
                <Link to="/notfall">{t('aiEmergencyLink')}</Link>
              </p>
            )}
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p className="ai-text">{m.content}</p>}
            {m.attached && <p className="ai-meta">{t('aiAttSent', { name: m.attached })}</p>}
            {m.sources && m.sources.length > 0 && (
              <p className="ai-meta">
                {t('aiSources')}:{' '}
                {m.sources.map((s, j) => (
                  <span key={s.url}>{j > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>
                ))}
              </p>
            )}
            {m.used && m.used.length > 0 && <p className="ai-meta">{t('aiUsed', { list: usedLabel(m.used) })}</p>}
          </article>
        ))}
        {busy && <p className="ai-msg ai-assistant ai-wait" role="status">{t('aiThinking')}</p>}
        {error && <p className="notice notice-crit" role="alert">{t(ERROR_KEY[error])}</p>}
        <div ref={endRef} />
      </section>

      <form className="ai-form stack" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="ai-input">{t('aiPlaceholder')}</label>
        <textarea
          id="ai-input"
          rows={3}
          maxLength={AI_MAX_INPUT}
          value={text}
          placeholder={t('aiPlaceholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
        />
        <AttachPanel petId={petId} disabled={busy} value={attach} onChange={setAttach} />
        <div className="ai-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ''}>{t('aiSend')}</button>
          {turns.length > 0 && <button type="button" className="btn btn-secondary" onClick={reset}>{t('aiReset')}</button>}
        </div>
        <p className="ai-meta">{t('aiNoDiagnosis')}{left !== null && ` ${t('aiLeft', { n: left })}`}</p>
      </form>
    </div>
  );
}
