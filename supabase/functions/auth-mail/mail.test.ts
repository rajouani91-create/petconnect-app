import { describe, expect, it, vi } from 'vitest';
import { LANGS, KINDS, TEXTS } from './mailTexts';
import { buildMail, cleanName, pickLang } from './build';
import { handleHook, verifyUrl, type Deps, type HookPayload } from './handler';

const LINK = 'https://x.supabase.co/auth/v1/verify?token=abc&type=signup&redirect_to=https%3A%2F%2Fwww.petconnect24.com%2F';

describe('Mailtexte', () => {
  it('jede Sprache hat jede Mailart mit allen Feldern', () => {
    for (const l of LANGS) {
      const t = TEXTS[l];
      expect(t.hello, l).toContain('{name}');
      expect(t.helloAnon, l).not.toContain('{name}');
      for (const f of [t.fallback, t.auto]) expect(f.trim().length, l).toBeGreaterThan(5);
      for (const k of KINDS) for (const f of Object.values(t.kinds[k])) expect(f.trim().length, `${l}/${k}`).toBeGreaterThan(2);
    }
  });
  it('Betreff nennt PetConnect24 und hat keinen Zeilenumbruch', () => {
    for (const l of LANGS) for (const k of KINDS) {
      const s = TEXTS[l].kinds[k].subject;
      expect(s.includes('\n')).toBe(false);
      if (k === 'signup' || k === 'recovery') expect(s).toContain('PetConnect24');
    }
  });
});

describe('buildMail', () => {
  it('enthält den Link als Knopf und im Text, in jeder Sprache und Mailart', () => {
    for (const l of LANGS) for (const k of KINDS) {
      const m = buildMail({ lang: l, kind: k, link: LINK, name: 'Anna' });
      expect(m.html).toContain(`href="${LINK.replace(/&/g, '&amp;')}"`);
      expect(m.text).toContain(LINK);
      expect(m.html).toContain(TEXTS[l].kinds[k].button);
      expect(m.html).toContain('Anna');
    }
  });
  it('Arabisch läuft von rechts nach links, alle anderen nicht', () => {
    expect(buildMail({ lang: 'ar', kind: 'signup', link: LINK }).html).toContain('dir="rtl"');
    expect(buildMail({ lang: 'de', kind: 'signup', link: LINK }).html).toContain('dir="ltr"');
  });
  it('ohne Namen steht eine Anrede ohne Namen, mit Namen wird HTML unschädlich gemacht', () => {
    expect(buildMail({ lang: 'de', kind: 'recovery', link: LINK }).text.startsWith('Hallo,')).toBe(true);
    const m = buildMail({ lang: 'de', kind: 'recovery', link: LINK, name: '<script>x</script>' });
    expect(m.html).not.toContain('<script>');
  });
  it('unbekannte oder fehlende Sprache wird Deutsch', () => {
    expect(pickLang('xx')).toBe('de');
    expect(pickLang(undefined)).toBe('de');
    expect(pickLang('fr')).toBe('fr');
  });
  it('cleanName kürzt und entfernt Steuerzeichen', () => {
    expect(cleanName('a\u0000b\nc')).toBe('a b c');
    expect(cleanName('x'.repeat(100)).length).toBe(60);
    expect(cleanName(42)).toBe('');
  });
});

function deps(payload: HookPayload | 'bad', send = vi.fn(async () => {})): Deps & { send: ReturnType<typeof vi.fn> } {
  return { supabaseUrl: 'https://x.supabase.co/', verify: () => { if (payload === 'bad') throw new Error('sig'); return payload; }, send };
}
const base = (over: Partial<HookPayload['email_data']> = {}, meta: Record<string, unknown> = { language: 'fr', display_name: 'Léa' }): HookPayload => ({
  user: { email: 'a@b.de', user_metadata: meta },
  email_data: { token_hash: 'h', redirect_to: 'https://www.petconnect24.com/', email_action_type: 'signup', ...over },
});

describe('handleHook', () => {
  it('sendet die Mail in der Sprache des Kontos an die Adresse', async () => {
    const d = deps(base());
    const r = await handleHook('{}', {}, d);
    expect(r).toEqual({ status: 200, body: {} });
    const [to, mail] = d.send.mock.calls[0] as [string, { subject: string; html: string }];
    expect(to).toBe('a@b.de');
    expect(mail.subject).toBe(TEXTS.fr.kinds.signup.subject);
    expect(mail.html).toContain('Léa');
  });
  it('ohne Sprache im Konto wird Deutsch gesendet', async () => {
    const d = deps(base({ email_action_type: 'recovery' }, {}));
    await handleHook('{}', {}, d);
    expect((d.send.mock.calls[0] as [string, { subject: string }])[1].subject).toBe(TEXTS.de.kinds.recovery.subject);
  });
  it('falsche Signatur: 401 und nichts wird gesendet', async () => {
    const d = deps('bad');
    expect((await handleHook('{}', {}, d)).status).toBe(401);
    expect(d.send).not.toHaveBeenCalled();
  });
  it('nicht unterstützte Mailart oder fehlende Angaben: 400', async () => {
    expect((await handleHook('{}', {}, deps(base({ email_action_type: 'email_change' })))).status).toBe(400);
    expect((await handleHook('{}', {}, deps(base({ token_hash: undefined })))).status).toBe(400);
  });
  it('Fehler beim Versand: 502 mit Fehlerobjekt', async () => {
    const r = await handleHook('{}', {}, deps(base(), vi.fn(async () => { throw new Error('x'); })));
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: { http_code: 502, message: 'Mailversand fehlgeschlagen' } });
  });
  it('verifyUrl baut den Bestätigungslink', () => {
    expect(verifyUrl('https://x.supabase.co/', 'h h', 'recovery', 'https://a/b?c=1')).toBe('https://x.supabase.co/auth/v1/verify?token=h%20h&type=recovery&redirect_to=https%3A%2F%2Fa%2Fb%3Fc%3D1');
    expect(verifyUrl('https://x.supabase.co', 'h', 'signup')).toBe('https://x.supabase.co/auth/v1/verify?token=h&type=signup');
  });
});
