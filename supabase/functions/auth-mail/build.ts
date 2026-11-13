/* Baut aus Sprache, Mailart und Link die fertige Mail (Betreff, HTML, Text). Reine Funktionen ohne Netzwerk. */
import { LANGS, TEXTS, type MailKind, type MailLang } from './mailTexts.ts';

export const SITE = 'https://www.petconnect24.com';
const BRAND = '#1f6b52';

export function pickLang(value: unknown): MailLang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value) ? (value as MailLang) : 'de';
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Anzeigename aus den Kontodaten: nur Text, ohne Steuerzeichen, höchstens 60 Zeichen. */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export interface BuildInput { lang: MailLang; kind: MailKind; link: string; name?: string; practice?: string }
export interface Mail { subject: string; html: string; text: string }

export function buildMail({ lang, kind, link, name, practice }: BuildInput): Mail {
  const t = TEXTS[lang];
  const pName = cleanName(practice);
  // Einladung durch eine Praxis: die Praxis im Text nennen
  const k = kind === 'invite' && pName ? { ...t.kinds.invite, intro: t.invitePractice.replace('{practice}', pName) } : t.kinds[kind];
  const clean = cleanName(name);
  const hello = clean ? t.hello.replace('{name}', clean) : t.helloAnon;
  const dir = t.rtl ? 'rtl' : 'ltr';
  const align = t.rtl ? 'right' : 'left';
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans',sans-serif";
  const href = esc(link);
  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(k.subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f1ea;font-family:${font};color:#1a2420;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 32px 8px;text-align:${align};direction:${dir};">
<table role="presentation" cellpadding="0" cellspacing="0" dir="ltr"><tr>
<td style="padding-right:12px;"><img src="${SITE}/icons/icon-192.png" width="44" height="44" alt="" style="display:block;border-radius:10px;"></td>
<td style="font-size:22px;font-weight:700;color:${BRAND};">PetConnect24</td></tr></table></td></tr>
<tr><td style="padding:16px 32px 8px;text-align:${align};direction:${dir};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1a2420;">${esc(k.heading)}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.55;">${esc(hello)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.55;">${esc(k.intro)}</p>
<p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px;">${esc(k.button)}</a></p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#5b6b64;">${esc(t.fallback)}</p>
<p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;direction:ltr;text-align:${align};"><a href="${href}" style="color:${BRAND};">${href}</a></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3b4a43;">${esc(k.ignore)}</p></td></tr>
<tr><td style="padding:16px 32px 28px;text-align:${align};direction:${dir};border-top:1px solid #e6e2d8;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#7a877f;">${esc(t.auto)}<br>PetConnect24 · <a href="${SITE}" style="color:#7a877f;">www.petconnect24.com</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${hello}\n\n${k.intro}\n\n${k.button}: ${link}\n\n${k.ignore}\n\n${t.auto}\nPetConnect24 · www.petconnect24.com\n`;
  return { subject: k.subject, html, text };
}
