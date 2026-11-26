import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import { useAuth } from '../auth/AuthProvider';
import { answerAccessRequest, ownerAccessRequests, type OwnerRequest } from '../lib/practiceAccess';
import { Dialog } from './Dialog';

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
  // Anfrage im Blatt geöffnet (Details und Auswahl erst dort)
  const [openId, setOpenId] = useState<string | null>(null);

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
      setOpenId(null);
      await load();
    } catch {
      setMsg({ ok: false, text: t('errGeneric') });
    } finally {
      setBusy(false);
    }
  }

  const petNames = own.map((p) => p.name).join(', ');
  const open = reqs.find((r) => r.id === openId) ?? null;
  const sel = open ? selected(open.id) : [];
  const chosenNames = own.filter((p) => sel.includes(p.id)).map((p) => p.name).join(', ');

  return (
    <div className="stack">
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {reqs.map((r) => (
        <section key={r.id} className="card practice-request is-compact" aria-labelledby={`prq-${r.id}`}>
          <div className="prq-text">
            <h2 id={`prq-${r.id}`}>{t('prqTitle', { p: r.practice_name })}</h2>
            <p className="small muted">{own.length > 0 ? t('prqFor', { pets: petNames }) : r.city}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => { setMsg(null); setOpenId(r.id); }}>{t('prqReview')}</button>
        </section>
      ))}
      <Dialog open={open !== null} sheet title={open ? open.practice_name : ''} onClose={() => setOpenId(null)}
        actions={open ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void answer(open, false)}>{t('prqDecline')}</button>
            <button type="button" className="btn btn-primary" disabled={busy || sel.length === 0} aria-busy={busy} onClick={() => void answer(open, true)}>
              {sel.length > 0 ? t('prqAllowFor', { pets: chosenNames }) : t('prqAllow')}
            </button>
          </>
        ) : null}>
        {open && (
          <div className="stack">
            <p className="muted small">{[open.city, formatIsoDate(open.created_at.slice(0, 10), lang)].filter(Boolean).join(' · ')}</p>
            {open.note && <p className="pre">„{open.note}“</p>}
            <fieldset className="field">
              <legend>{t('prqWhich')}</legend>
              <div className="stack">
                {own.map((p) => (
                  <label key={p.id} className="check-row">
                    <input type="checkbox" checked={sel.includes(p.id)}
                      onChange={(e) => setChosen((c) => ({ ...c, [open.id]: e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id) }))} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <h3 className="label">{t('prqSees')}</h3>
            <p className="small">{t('prqWhat')}</p>
            <p className="muted small">{t('paCanWrite')}</p>
            {msg && !msg.ok && <p className="notice notice-crit" role="alert">{msg.text}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
