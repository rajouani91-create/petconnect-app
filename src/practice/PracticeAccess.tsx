import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatIsoDate, type MessageKey } from '../i18n';
import { Field } from '../components/Field';
import { IconBack } from '../components/Icons';
import { isEmail } from '../lib/staff';
import { useNow } from '../lib/useNow';
import { accessErrorCode, practiceRequests, redeemPracticeCode, requestAccess, type PracticeRequestRow } from '../lib/practiceAccess';

const STATUS_TEXT: Record<PracticeRequestRow['status'], MessageKey> = { pending: 'pqPending', accepted: 'pqAccepted', declined: 'pqDeclined' };

function errKey(code: string | null): MessageKey {
  switch (code) {
    case 'too_many_attempts': return 'pqTooMany';
    case 'too_many_requests': return 'pqTooManyReq';
    case 'request_exists': return 'pqExists';
    case 'email_invalid': return 'err_email';
    case 'practice_pending': return 'ptPending';
    default: return 'errGeneric';
  }
}

/** „Code einlösen“ und „Zugriff bei Halter:in anfragen“ mit Liste „Ihre Anfragen“. */
export function PracticeAccess() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const nowIso = useNow().toISOString();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailErr, setEmailErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<PracticeRequestRow[]>([]);

  const load = useCallback(() => {
    practiceRequests().then(setList).catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function onRedeem(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setCodeMsg(t('err_required'));
    setBusy(true);
    setCodeMsg(null);
    try {
      const petId = await redeemPracticeCode(code);
      if (!petId) setCodeMsg(t('pqCodeNotFound'));
      else navigate(`/praxis/patienten/${petId}`, { state: { flash: t('pqCodeOk') } });
    } catch (err) {
      setCodeMsg(t(errKey(accessErrorCode(err))));
    } finally {
      setBusy(false);
    }
  }

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setEmailErr(true);
    setBusy(true);
    setReqMsg(null);
    try {
      await requestAccess(email, note);
      setReqMsg({ ok: true, text: t('pqSent') });
      setEmail('');
      setNote('');
      load();
    } catch (err) {
      setReqMsg({ ok: false, text: t(errKey(accessErrorCode(err))) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack-lg">
      <Link to="/praxis/patienten" className="back-link"><IconBack size={20} />{t('ptTitle')}</Link>
      <h1>{t('ptCodeOrRequest')}</h1>
      <div className="practice-cards">
        <section className="card stack" aria-labelledby="pq-code">
          <h2 id="pq-code">{t('pqCodeTitle')}</h2>
          <p className="muted">{t('pqCodeIntro')}</p>
          <form className="stack" onSubmit={onRedeem} noValidate>
            <div className="field">
              <label htmlFor="pq-code-in">{t('pqCode')}</label>
              <input id="pq-code-in" className="mono" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20}
                placeholder="LUN-7KQ-3M9" value={code} onChange={(e) => { setCode(e.target.value); setCodeMsg(null); }} />
            </div>
            {codeMsg && <p className="notice notice-crit" role="alert">{codeMsg}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('pqRedeem')}</button>
          </form>
        </section>

        <section className="card stack" aria-labelledby="pq-req">
          <h2 id="pq-req">{t('pqReqTitle')}</h2>
          <p className="muted">{t('pqReqIntro')}</p>
          <form className="stack" onSubmit={onRequest} noValidate>
            <Field id="pq-email" label={t('pqEmail')} error={emailErr ? { key: 'err_email' } : undefined} required>
              {(a) => <input {...a} type="email" inputMode="email" autoComplete="off" maxLength={200} value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(false); }} />}
            </Field>
            <Field id="pq-note" label={t('pqNote')} hint={t('pqNoteHint')} optional>
              {(a) => <input {...a} type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            {reqMsg && <p className={`notice ${reqMsg.ok ? 'notice-ok' : 'notice-crit'}`} role={reqMsg.ok ? 'status' : 'alert'}>{reqMsg.text}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('pqSend')}</button>
          </form>
        </section>

        <section className="card stack" aria-labelledby="pq-list">
          <h2 id="pq-list">{t('pqListTitle')}</h2>
          {list.length === 0 ? <p className="muted">{t('pqNone')}</p> : (
            <ul className="member-list">
              {list.map((r) => {
                const expired = r.status === 'pending' && r.expires_at < nowIso;
                return (
                  <li key={r.id} className="member-row team-row">
                    <div className="member-text">
                      <span className="member-name">{r.email}</span>
                      <span className="muted small">{[formatIsoDate(r.created_at.slice(0, 10), lang), r.note].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span className={`pill ${r.status === 'accepted' ? 'pill-ok' : r.status === 'declined' || expired ? '' : 'pill-warn'}`}>
                      {expired ? t('pqExpired') : t(STATUS_TEXT[r.status], { n: r.pets_granted })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
