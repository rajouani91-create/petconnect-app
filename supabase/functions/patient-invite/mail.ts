/* Einladungs-Mail an Halter:innen („Patient aufnehmen“): Texte in 11 Sprachen und der Aufbau der Mail. Reine Funktionen. */

export const LANGS = ['de', 'en', 'fr', 'es', 'nl', 'no', 'sv', 'da', 'tr', 'ru', 'ar'] as const;
export type MailLang = (typeof LANGS)[number];

interface Texts { subject: string; heading: string; hello: string; intro: string; how: string; button: string; code: string; fallback: string; ignore: string; auto: string; rtl?: boolean }

export const TEXTS: Record<MailLang, Texts> = {
  de: { subject: '{practice} lädt Sie zu PetConnect24 ein', heading: 'Einladung Ihrer Tierarztpraxis', hello: 'Hallo {name},', intro: '{practice} hat für {pet} eine digitale Tierakte vorbereitet. Wenn Sie zustimmen, sehen Sie dort künftig Impfungen, Befunde und Medikamente Ihres Tieres. Ohne Ihre Zustimmung wird nichts freigegeben.', how: 'Melden Sie sich mit dieser E-Mail-Adresse bei PetConnect24 an oder registrieren Sie sich kostenlos. Die Einladung erscheint dann automatisch.', button: 'Einladung ansehen', code: 'Ihr Einladungscode: {code} (gültig bis {date})', fallback: 'Funktioniert der Knopf nicht? Kopieren Sie diesen Link in Ihren Browser:', ignore: 'Wenn Sie diese Praxis nicht kennen, können Sie diese E-Mail ignorieren.', auto: 'Diese Nachricht wurde automatisch gesendet.' },
  en: { subject: '{practice} invites you to PetConnect24', heading: 'Invitation from your vet practice', hello: 'Hello {name},', intro: '{practice} has prepared a digital pet record for {pet}. If you agree, you will see your animal’s vaccinations, findings and medication there. Nothing is shared without your consent.', how: 'Sign in to PetConnect24 with this email address or register for free. The invitation then appears automatically.', button: 'View invitation', code: 'Your invitation code: {code} (valid until {date})', fallback: 'Button not working? Copy this link into your browser:', ignore: 'If you do not know this practice, you can ignore this email.', auto: 'This message was sent automatically.' },
  fr: { subject: '{practice} vous invite sur PetConnect24', heading: 'Invitation de votre cabinet vétérinaire', hello: 'Bonjour {name},', intro: '{practice} a préparé un dossier numérique pour {pet}. Si vous acceptez, vous y verrez les vaccins, comptes rendus et médicaments de votre animal. Rien n’est partagé sans votre accord.', how: 'Connectez-vous à PetConnect24 avec cette adresse e-mail ou inscrivez-vous gratuitement. L’invitation apparaît alors automatiquement.', button: 'Voir l’invitation', code: 'Votre code d’invitation : {code} (valable jusqu’au {date})', fallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :', ignore: 'Si vous ne connaissez pas ce cabinet, vous pouvez ignorer cet e-mail.', auto: 'Ce message a été envoyé automatiquement.' },
  es: { subject: '{practice} le invita a PetConnect24', heading: 'Invitación de su clínica veterinaria', hello: 'Hola, {name}:', intro: '{practice} ha preparado un historial digital para {pet}. Si acepta, verá allí las vacunas, informes y medicación de su animal. No se comparte nada sin su consentimiento.', how: 'Inicie sesión en PetConnect24 con esta dirección de correo o regístrese gratis. La invitación aparecerá automáticamente.', button: 'Ver invitación', code: 'Su código de invitación: {code} (válido hasta el {date})', fallback: '¿No funciona el botón? Copie este enlace en su navegador:', ignore: 'Si no conoce esta clínica, puede ignorar este correo.', auto: 'Este mensaje se ha enviado automáticamente.' },
  nl: { subject: '{practice} nodigt u uit voor PetConnect24', heading: 'Uitnodiging van uw dierenartspraktijk', hello: 'Hallo {name},', intro: '{practice} heeft voor {pet} een digitaal dierdossier voorbereid. Als u akkoord gaat, ziet u daar vaccinaties, bevindingen en medicatie van uw dier. Zonder uw toestemming wordt niets gedeeld.', how: 'Log met dit e-mailadres in bij PetConnect24 of registreer u gratis. De uitnodiging verschijnt dan automatisch.', button: 'Uitnodiging bekijken', code: 'Uw uitnodigingscode: {code} (geldig tot {date})', fallback: 'Werkt de knop niet? Kopieer deze link naar uw browser:', ignore: 'Kent u deze praktijk niet? Dan kunt u deze e-mail negeren.', auto: 'Dit bericht is automatisch verzonden.' },
  no: { subject: '{practice} inviterer deg til PetConnect24', heading: 'Invitasjon fra dyreklinikken din', hello: 'Hei {name},', intro: '{practice} har klargjort en digital dyrejournal for {pet}. Hvis du samtykker, ser du vaksiner, funn og medisiner for dyret ditt der. Ingenting deles uten ditt samtykke.', how: 'Logg inn på PetConnect24 med denne e-postadressen, eller registrer deg gratis. Invitasjonen vises da automatisk.', button: 'Se invitasjonen', code: 'Invitasjonskoden din: {code} (gyldig til {date})', fallback: 'Virker ikke knappen? Kopier denne lenken til nettleseren:', ignore: 'Hvis du ikke kjenner denne klinikken, kan du se bort fra denne e-posten.', auto: 'Denne meldingen ble sendt automatisk.' },
  sv: { subject: '{practice} bjuder in dig till PetConnect24', heading: 'Inbjudan från din veterinärklinik', hello: 'Hej {name},', intro: '{practice} har förberett en digital djurjournal för {pet}. Om du samtycker ser du där ditt djurs vaccinationer, fynd och läkemedel. Inget delas utan ditt samtycke.', how: 'Logga in på PetConnect24 med den här e-postadressen eller registrera dig gratis. Inbjudan visas då automatiskt.', button: 'Visa inbjudan', code: 'Din inbjudningskod: {code} (giltig till {date})', fallback: 'Fungerar inte knappen? Kopiera länken till din webbläsare:', ignore: 'Om du inte känner till den här kliniken kan du bortse från det här mejlet.', auto: 'Det här meddelandet skickades automatiskt.' },
  da: { subject: '{practice} inviterer dig til PetConnect24', heading: 'Invitation fra din dyreklinik', hello: 'Hej {name},', intro: '{practice} har klargjort en digital dyrejournal for {pet}. Hvis du giver samtykke, kan du dér se dit dyrs vaccinationer, fund og medicin. Intet deles uden dit samtykke.', how: 'Log ind på PetConnect24 med denne e-mailadresse, eller opret dig gratis. Invitationen vises så automatisk.', button: 'Se invitationen', code: 'Din invitationskode: {code} (gyldig til {date})', fallback: 'Virker knappen ikke? Kopiér dette link til din browser:', ignore: 'Hvis du ikke kender denne klinik, kan du se bort fra denne e-mail.', auto: 'Denne besked er sendt automatisk.' },
  tr: { subject: '{practice} sizi PetConnect24’e davet ediyor', heading: 'Veteriner kliniğinizden davet', hello: 'Merhaba {name},', intro: '{practice}, {pet} için dijital bir hayvan dosyası hazırladı. Onay verirseniz hayvanınızın aşılarını, bulgularını ve ilaçlarını orada görürsünüz. Onayınız olmadan hiçbir şey paylaşılmaz.', how: 'Bu e-posta adresiyle PetConnect24’e giriş yapın veya ücretsiz kaydolun. Davet otomatik olarak görünür.', button: 'Daveti görüntüle', code: 'Davet kodunuz: {code} ({date} tarihine kadar geçerli)', fallback: 'Düğme çalışmıyor mu? Bu bağlantıyı tarayıcınıza kopyalayın:', ignore: 'Bu kliniği tanımıyorsanız bu e-postayı yok sayabilirsiniz.', auto: 'Bu ileti otomatik olarak gönderildi.' },
  ru: { subject: '{practice} приглашает Вас в PetConnect24', heading: 'Приглашение от Вашей ветклиники', hello: 'Здравствуйте, {name}!', intro: '{practice} подготовила цифровую карту для питомца {pet}. Если Вы согласитесь, то увидите в ней прививки, заключения и лекарства Вашего животного. Без Вашего согласия ничего не передаётся.', how: 'Войдите в PetConnect24 с этим адресом электронной почты или бесплатно зарегистрируйтесь. Приглашение появится автоматически.', button: 'Посмотреть приглашение', code: 'Ваш код приглашения: {code} (действует до {date})', fallback: 'Кнопка не работает? Скопируйте эту ссылку в браузер:', ignore: 'Если Вы не знаете эту клинику, просто проигнорируйте это письмо.', auto: 'Это сообщение отправлено автоматически.' },
  ar: { rtl: true, subject: '{practice} تدعوكم إلى PetConnect24', heading: 'دعوة من عيادتكم البيطرية', hello: 'مرحبًا {name}،', intro: 'أعدّت {practice} سجلًا رقميًا للحيوان {pet}. إذا وافقتم، سترون فيه تطعيمات حيوانكم ونتائجه وأدويته. لا تتم مشاركة أي شيء دون موافقتكم.', how: 'سجّلوا الدخول إلى PetConnect24 بهذا البريد الإلكتروني أو أنشئوا حسابًا مجانًا. ستظهر الدعوة تلقائيًا.', button: 'عرض الدعوة', code: 'رمز الدعوة: {code} (صالح حتى {date})', fallback: 'الزر لا يعمل؟ انسخوا هذا الرابط إلى المتصفح:', ignore: 'إذا كنتم لا تعرفون هذه العيادة، يمكنكم تجاهل هذه الرسالة.', auto: 'تم إرسال هذه الرسالة تلقائيًا.' },
};

const SITE = 'https://www.petconnect24.com';
const BRAND = '#1f6b52';
const LOCALE: Record<MailLang, string> = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL', no: 'nb-NO', sv: 'sv-SE', da: 'da-DK', tr: 'tr-TR', ru: 'ru-RU', ar: 'ar-u-nu-latn' };

export function pickLang(value: unknown): MailLang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value) ? (value as MailLang) : 'de';
}
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Namen aus der Eingabe: nur Text, ohne Steuerzeichen und spitze Klammern, höchstens 80 Zeichen */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export interface MailInput { lang: MailLang; practice: string; owner: string; pet: string; code: string; expiresAt: string; link: string }
export interface Mail { subject: string; html: string; text: string }

export function buildMail(i: MailInput): Mail {
  const t = TEXTS[i.lang];
  const practice = cleanName(i.practice) || 'PetConnect24';
  const fill = (s: string) => s.replace('{practice}', practice).replace('{pet}', cleanName(i.pet)).replace('{name}', cleanName(i.owner)).replace('{code}', i.code)
    .replace('{date}', new Intl.DateTimeFormat(LOCALE[i.lang], { dateStyle: 'long', timeZone: 'Europe/Berlin' }).format(new Date(i.expiresAt)));
  const dir = t.rtl ? 'rtl' : 'ltr';
  const align = t.rtl ? 'right' : 'left';
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans',sans-serif";
  const href = esc(i.link);
  const p = (s: string, style = 'margin:0 0 16px;font-size:16px;line-height:1.55;') => `<p style="${style}">${esc(fill(s))}</p>`;
  const subject = fill(t.subject);
  const html = `<!doctype html>
<html lang="${i.lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f1ea;font-family:${font};color:#1a2420;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 32px 8px;text-align:${align};direction:${dir};">
<table role="presentation" cellpadding="0" cellspacing="0" dir="ltr"><tr>
<td style="padding-right:12px;"><img src="${SITE}/icons/icon-192.png" width="44" height="44" alt="" style="display:block;border-radius:10px;"></td>
<td style="font-size:22px;font-weight:700;color:${BRAND};">PetConnect24</td></tr></table></td></tr>
<tr><td style="padding:16px 32px 8px;text-align:${align};direction:${dir};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1a2420;">${esc(t.heading)}</h1>
${p(t.hello, 'margin:0 0 12px;font-size:16px;line-height:1.55;')}
${p(t.intro)}
${p(t.how)}
<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px;">${esc(t.button)}</a></p>
${p(t.code, 'margin:0 0 20px;font-size:15px;line-height:1.5;font-weight:700;')}
${p(t.fallback, 'margin:0 0 6px;font-size:13px;line-height:1.5;color:#5b6b64;')}
<p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;direction:ltr;text-align:${align};"><a href="${href}" style="color:${BRAND};">${href}</a></p>
${p(t.ignore, 'margin:0 0 8px;font-size:14px;line-height:1.5;color:#3b4a43;')}</td></tr>
<tr><td style="padding:16px 32px 28px;text-align:${align};direction:${dir};border-top:1px solid #e6e2d8;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#7a877f;">${esc(t.auto)}<br>PetConnect24 · <a href="${SITE}" style="color:#7a877f;">www.petconnect24.com</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${fill(t.hello)}\n\n${fill(t.intro)}\n\n${fill(t.how)}\n\n${t.button}: ${i.link}\n\n${fill(t.code)}\n\n${t.ignore}\n\n${t.auto}\nPetConnect24 · www.petconnect24.com\n`;
  return { subject, html, text };
}
