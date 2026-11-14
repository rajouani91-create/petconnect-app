import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { useAuth } from '../auth/AuthProvider';
import { answerAccessRequest, ownerAccessRequests, type OwnerRequest } from '../lib/practiceAccess';

/** „{Praxis} bittet um Zugriff“: Halter:in wählt eigene Tiere und erlaubt, oder lehnt ab. Unsichtbar ohne offene Anfragen. */
export function PracticeRequests() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { pets } = usePets();
  const own = pets.filter((p) => p.owner_id === user?.id && !p.deceased);
  const [reqs, setReqs] = useState<OwnerRequest[]>([]);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setReqs(await ownerAccessRequests());
    } catch {
      setReqs([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Mit nur einem eigenen Tier ist es vorausgewählt
  const selected = (id: string) => chosen[id] ?? (own.length === 1 ? [own[0]!.id] : []);

  if (reqs.length === 0 && !msg) return null;

  async function answer(r: OwnerRequest, accept: boolean) {
    const ids = selected(r.id);
    if (accept && ids.length === 0) {
      setMsg({ ok: false, text: t('prqChoose') });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await answerAccessRequest(r.id, accept, accept ? ids : []);
      setMsg({ ok: true, text: accept ? t('prqAccepted', { p: r.practice_name }) : t('prqDeclined') });
      await load();
    } catch {
      setMsg({ ok: false, text: t('errGeneric') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {reqs.map((r) => {
        const sel = selected(r.id);
        return (
          <section key={r.id} className="card stack practice-request" aria-labelledby={`prq-${r.id}`}>
            <h2 id={`prq-${r.id}`}>{t('prqTitle', { p: r.practice_name })}</h2>
            <p className="muted small">{[r.city, formatIsoDate(r.created_at.slice(0, 10), lang)].filter(Boolean).join(' · ')}</p>
            {r.note && <p className="pre">„{r.note}“</p>}
            <fieldset className="field">
              <legend>{t('prqWhich')}</legend>
              <div className="stack">
                {own.map((p) => (
                  <label key={p.id} className="check-row">
                    <input type="checkbox" checked={sel.includes(p.id)}
                      onChange={(e) => setChosen((c) => ({ ...c, [r.id]: e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id) }))} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="muted small">{t('prqWhat')}</p>
            <p className="muted small">{t('paCanWrite')}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void answer(r, true)}>{t('prqAllow')}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void answer(r, false)}>{t('prqDecline')}</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
