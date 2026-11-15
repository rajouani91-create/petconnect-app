import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { Field } from '../components/Field';
import { IconBack } from '../components/Icons';
import { PatientInviteCard, PatientInvites } from '../components/PatientInvites';
import { inviteErrorKey, isInviteCode, normalizeInviteCode, patientInviteByCode, type OwnerInvite } from '../lib/patientInvites';

/** Einladung einer Praxis annehmen: zeigt Einladungen an die eigene E-Mail-Adresse und nimmt einen Einladungscode entgegen. */
export function PatientInvite() {
  const { t } = useI18n();
  const uid = useId();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => normalizeInviteCode(params.get('code') ?? ''));
  const [found, setFound] = useState<OwnerInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function lookup(c: string) {
    if (!isInviteCode(c)) {
      setErr(t('piErrCode'));
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const inv = await patientInviteByCode(c);
      setFound(inv);
      if (!inv) setErr(t('piErrCodeUnknown'));
    } catch (e) {
      setErr(t(inviteErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  // Code aus dem Link der E-Mail gleich nachschlagen
  useEffect(() => {
    const c = normalizeInviteCode(params.get('code') ?? '');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- einmaliges Nachschlagen beim Öffnen des Links
    if (isInviteCode(c)) void lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page stack-lg">
      <Link to="/tiere" className="back-link"><IconBack size={20} />{t('back')}</Link>
      <div className="page-head">
        <h1>{t('piPageTitle')}</h1>
        <p className="muted">{t('piPageIntro')}</p>
      </div>
      {msg && <p className="notice notice-ok" role="status">{msg}</p>}
      {found ? (
        <PatientInviteCard invite={found} code={code} onDone={(text) => { setFound(null); setCode(''); setMsg(text); }} />
      ) : (
        <>
          <PatientInvites />
          <form className="card stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void lookup(code); }} noValidate>
            <Field id={`${uid}-code`} label={t('piCode')} hint={t('piCodeEnterHint')} error={undefined}>
              {(a) => <input {...a} className="mono" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={16} placeholder="PC-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
            </Field>
            {err && <p className="notice notice-crit" role="alert">{err}</p>}
            <button type="submit" className="btn btn-primary btn-start" disabled={busy}>{t('piCodeCheck')}</button>
          </form>
        </>
      )}
    </div>
  );
}
