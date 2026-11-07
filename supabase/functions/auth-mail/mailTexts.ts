/* Texte der Anmelde-Mails in allen 11 App-Sprachen. Deutsch ist die Sie-Form, bei unbekannter Sprache wird Deutsch gesendet. */
export const LANGS = ['de', 'en', 'fr', 'es', 'nl', 'no', 'sv', 'da', 'tr', 'ru', 'ar'] as const;
export type MailLang = (typeof LANGS)[number];
export type MailKind = 'signup' | 'recovery' | 'magiclink' | 'invite';
export const KINDS: readonly MailKind[] = ['signup', 'recovery', 'magiclink', 'invite'];

export interface KindText { subject: string; heading: string; intro: string; button: string; ignore: string }
export interface MailTexts {
  rtl?: boolean;
  /** mit {name}; helloAnon ohne Namen */
  hello: string;
  helloAnon: string;
  fallback: string;
  auto: string;
  kinds: Record<MailKind, KindText>;
}

export const TEXTS: Record<MailLang, MailTexts> = {
  de: {
    hello: 'Hallo {name},', helloAnon: 'Hallo,',
    fallback: 'Funktioniert der Knopf nicht? Kopieren Sie diesen Link in Ihren Browser:',
    auto: 'Diese Nachricht wurde automatisch gesendet.',
    kinds: {
      signup: { subject: 'Bitte bestätigen Sie Ihre E-Mail-Adresse – PetConnect24', heading: 'Willkommen bei PetConnect24', intro: 'Schön, dass Sie dabei sind. Bitte bestätigen Sie Ihre E-Mail-Adresse, damit Sie sich anmelden können.', button: 'E-Mail-Adresse bestätigen', ignore: 'Wenn Sie sich nicht bei PetConnect24 registriert haben, können Sie diese E-Mail ignorieren.' },
      recovery: { subject: 'Passwort zurücksetzen – PetConnect24', heading: 'Passwort zurücksetzen', intro: 'Sie haben angefordert, Ihr Passwort zurückzusetzen. Mit dem Knopf wählen Sie ein neues Passwort.', button: 'Neues Passwort festlegen', ignore: 'Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt dann unverändert.' },
      magiclink: { subject: 'Ihr Anmeldelink für PetConnect24', heading: 'Anmelden', intro: 'Mit diesem Link melden Sie sich bei PetConnect24 an.', button: 'Jetzt anmelden', ignore: 'Wenn Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren.' },
      invite: { subject: 'Einladung zu PetConnect24', heading: 'Sie wurden eingeladen', intro: 'Sie wurden zu PetConnect24 eingeladen. Mit dem Knopf nehmen Sie die Einladung an und legen Ihr Konto an.', button: 'Einladung annehmen', ignore: 'Wenn Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren.' },
    },
  },
  en: {
    hello: 'Hello {name},', helloAnon: 'Hello,',
    fallback: 'Button not working? Copy this link into your browser:',
    auto: 'This message was sent automatically.',
    kinds: {
      signup: { subject: 'Please confirm your email address – PetConnect24', heading: 'Welcome to PetConnect24', intro: 'Great to have you on board. Please confirm your email address so you can sign in.', button: 'Confirm email address', ignore: 'If you did not sign up for PetConnect24, you can ignore this email.' },
      recovery: { subject: 'Reset your password – PetConnect24', heading: 'Reset your password', intro: 'You asked to reset your password. Use the button to choose a new one.', button: 'Set new password', ignore: 'If you did not request this, you can ignore this email. Your password will stay the same.' },
      magiclink: { subject: 'Your sign-in link for PetConnect24', heading: 'Sign in', intro: 'Use this link to sign in to PetConnect24.', button: 'Sign in now', ignore: 'If you did not expect this, you can ignore this email.' },
      invite: { subject: 'You are invited to PetConnect24', heading: 'You have been invited', intro: 'You have been invited to PetConnect24. Use the button to accept the invitation and set up your account.', button: 'Accept invitation', ignore: 'If you did not expect this, you can ignore this email.' },
    },
  },
  fr: {
    hello: 'Bonjour {name},', helloAnon: 'Bonjour,',
    fallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    auto: 'Ce message a été envoyé automatiquement.',
    kinds: {
      signup: { subject: 'Veuillez confirmer votre adresse e-mail – PetConnect24', heading: 'Bienvenue sur PetConnect24', intro: 'Ravi de vous compter parmi nous. Veuillez confirmer votre adresse e-mail pour pouvoir vous connecter.', button: 'Confirmer l’adresse e-mail', ignore: 'Si vous ne vous êtes pas inscrit(e) sur PetConnect24, vous pouvez ignorer cet e-mail.' },
      recovery: { subject: 'Réinitialiser votre mot de passe – PetConnect24', heading: 'Réinitialiser votre mot de passe', intro: 'Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le bouton pour en choisir un nouveau.', button: 'Choisir un nouveau mot de passe', ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail. Votre mot de passe reste inchangé.' },
      magiclink: { subject: 'Votre lien de connexion à PetConnect24', heading: 'Connexion', intro: 'Utilisez ce lien pour vous connecter à PetConnect24.', button: 'Se connecter', ignore: 'Si vous n’attendiez pas cet e-mail, vous pouvez l’ignorer.' },
      invite: { subject: 'Invitation à rejoindre PetConnect24', heading: 'Vous êtes invité(e)', intro: 'Vous avez été invité(e) à rejoindre PetConnect24. Utilisez le bouton pour accepter l’invitation et créer votre compte.', button: 'Accepter l’invitation', ignore: 'Si vous n’attendiez pas cet e-mail, vous pouvez l’ignorer.' },
    },
  },
  es: {
    hello: 'Hola {name}:', helloAnon: 'Hola:',
    fallback: '¿No funciona el botón? Copie este enlace en su navegador:',
    auto: 'Este mensaje se envió automáticamente.',
    kinds: {
      signup: { subject: 'Confirme su dirección de correo electrónico – PetConnect24', heading: 'Le damos la bienvenida a PetConnect24', intro: 'Nos alegra tenerle con nosotros. Confirme su dirección de correo electrónico para poder iniciar sesión.', button: 'Confirmar correo electrónico', ignore: 'Si no se registró en PetConnect24, puede ignorar este mensaje.' },
      recovery: { subject: 'Restablecer su contraseña – PetConnect24', heading: 'Restablecer la contraseña', intro: 'Ha solicitado restablecer su contraseña. Use el botón para elegir una nueva.', button: 'Elegir nueva contraseña', ignore: 'Si no lo solicitó, ignore este mensaje. Su contraseña no cambiará.' },
      magiclink: { subject: 'Su enlace de acceso a PetConnect24', heading: 'Iniciar sesión', intro: 'Use este enlace para iniciar sesión en PetConnect24.', button: 'Iniciar sesión', ignore: 'Si no esperaba este mensaje, puede ignorarlo.' },
      invite: { subject: 'Invitación a PetConnect24', heading: 'Ha recibido una invitación', intro: 'Le han invitado a PetConnect24. Use el botón para aceptar la invitación y crear su cuenta.', button: 'Aceptar invitación', ignore: 'Si no esperaba este mensaje, puede ignorarlo.' },
    },
  },
  nl: {
    hello: 'Hallo {name},', helloAnon: 'Hallo,',
    fallback: 'Werkt de knop niet? Kopieer deze link naar uw browser:',
    auto: 'Dit bericht is automatisch verzonden.',
    kinds: {
      signup: { subject: 'Bevestig uw e-mailadres – PetConnect24', heading: 'Welkom bij PetConnect24', intro: 'Fijn dat u erbij bent. Bevestig uw e-mailadres zodat u kunt inloggen.', button: 'E-mailadres bevestigen', ignore: 'Hebt u zich niet bij PetConnect24 geregistreerd? Dan kunt u deze e-mail negeren.' },
      recovery: { subject: 'Wachtwoord opnieuw instellen – PetConnect24', heading: 'Wachtwoord opnieuw instellen', intro: 'U hebt gevraagd uw wachtwoord opnieuw in te stellen. Kies met de knop een nieuw wachtwoord.', button: 'Nieuw wachtwoord kiezen', ignore: 'Hebt u dit niet aangevraagd? Negeer deze e-mail dan. Uw wachtwoord blijft ongewijzigd.' },
      magiclink: { subject: 'Uw inloglink voor PetConnect24', heading: 'Inloggen', intro: 'Met deze link logt u in bij PetConnect24.', button: 'Nu inloggen', ignore: 'Verwachtte u deze e-mail niet? Dan kunt u hem negeren.' },
      invite: { subject: 'Uitnodiging voor PetConnect24', heading: 'U bent uitgenodigd', intro: 'U bent uitgenodigd voor PetConnect24. Accepteer de uitnodiging met de knop en maak uw account aan.', button: 'Uitnodiging accepteren', ignore: 'Verwachtte u deze e-mail niet? Dan kunt u hem negeren.' },
    },
  },
  no: {
    hello: 'Hei {name},', helloAnon: 'Hei,',
    fallback: 'Fungerer ikke knappen? Kopier denne lenken inn i nettleseren din:',
    auto: 'Denne meldingen ble sendt automatisk.',
    kinds: {
      signup: { subject: 'Bekreft e-postadressen din – PetConnect24', heading: 'Velkommen til PetConnect24', intro: 'Hyggelig at du er med. Bekreft e-postadressen din, så kan du logge inn.', button: 'Bekreft e-postadresse', ignore: 'Hvis du ikke har registrert deg hos PetConnect24, kan du se bort fra denne e-posten.' },
      recovery: { subject: 'Tilbakestill passordet ditt – PetConnect24', heading: 'Tilbakestill passordet', intro: 'Du har bedt om å tilbakestille passordet ditt. Bruk knappen for å velge et nytt.', button: 'Velg nytt passord', ignore: 'Hvis du ikke har bedt om dette, kan du se bort fra e-posten. Passordet ditt blir ikke endret.' },
      magiclink: { subject: 'Innloggingslenken din til PetConnect24', heading: 'Logg inn', intro: 'Bruk denne lenken for å logge inn på PetConnect24.', button: 'Logg inn nå', ignore: 'Hvis du ikke ventet denne e-posten, kan du se bort fra den.' },
      invite: { subject: 'Invitasjon til PetConnect24', heading: 'Du er invitert', intro: 'Du er invitert til PetConnect24. Bruk knappen for å godta invitasjonen og opprette kontoen din.', button: 'Godta invitasjon', ignore: 'Hvis du ikke ventet denne e-posten, kan du se bort fra den.' },
    },
  },
  sv: {
    hello: 'Hej {name},', helloAnon: 'Hej,',
    fallback: 'Fungerar inte knappen? Kopiera länken till din webbläsare:',
    auto: 'Det här meddelandet skickades automatiskt.',
    kinds: {
      signup: { subject: 'Bekräfta din e-postadress – PetConnect24', heading: 'Välkommen till PetConnect24', intro: 'Kul att du är med. Bekräfta din e-postadress så att du kan logga in.', button: 'Bekräfta e-postadress', ignore: 'Om du inte har registrerat dig hos PetConnect24 kan du bortse från det här e-postmeddelandet.' },
      recovery: { subject: 'Återställ ditt lösenord – PetConnect24', heading: 'Återställ lösenordet', intro: 'Du har begärt att återställa ditt lösenord. Använd knappen för att välja ett nytt.', button: 'Välj nytt lösenord', ignore: 'Om du inte har begärt detta kan du bortse från meddelandet. Ditt lösenord ändras inte.' },
      magiclink: { subject: 'Din inloggningslänk till PetConnect24', heading: 'Logga in', intro: 'Använd den här länken för att logga in på PetConnect24.', button: 'Logga in nu', ignore: 'Om du inte väntade dig det här meddelandet kan du bortse från det.' },
      invite: { subject: 'Inbjudan till PetConnect24', heading: 'Du är inbjuden', intro: 'Du har blivit inbjuden till PetConnect24. Använd knappen för att acceptera inbjudan och skapa ditt konto.', button: 'Acceptera inbjudan', ignore: 'Om du inte väntade dig det här meddelandet kan du bortse från det.' },
    },
  },
  da: {
    hello: 'Hej {name},', helloAnon: 'Hej,',
    fallback: 'Virker knappen ikke? Kopiér linket ind i din browser:',
    auto: 'Denne besked blev sendt automatisk.',
    kinds: {
      signup: { subject: 'Bekræft din e-mailadresse – PetConnect24', heading: 'Velkommen til PetConnect24', intro: 'Dejligt, at du er med. Bekræft din e-mailadresse, så du kan logge ind.', button: 'Bekræft e-mailadresse', ignore: 'Hvis du ikke har oprettet dig hos PetConnect24, kan du se bort fra denne e-mail.' },
      recovery: { subject: 'Nulstil din adgangskode – PetConnect24', heading: 'Nulstil adgangskoden', intro: 'Du har bedt om at nulstille din adgangskode. Brug knappen til at vælge en ny.', button: 'Vælg ny adgangskode', ignore: 'Hvis du ikke har bedt om dette, kan du se bort fra e-mailen. Din adgangskode forbliver uændret.' },
      magiclink: { subject: 'Dit loginlink til PetConnect24', heading: 'Log ind', intro: 'Brug dette link til at logge ind på PetConnect24.', button: 'Log ind nu', ignore: 'Hvis du ikke ventede denne e-mail, kan du se bort fra den.' },
      invite: { subject: 'Invitation til PetConnect24', heading: 'Du er inviteret', intro: 'Du er blevet inviteret til PetConnect24. Brug knappen til at acceptere invitationen og oprette din konto.', button: 'Accepter invitation', ignore: 'Hvis du ikke ventede denne e-mail, kan du se bort fra den.' },
    },
  },
  tr: {
    hello: 'Merhaba {name},', helloAnon: 'Merhaba,',
    fallback: 'Düğme çalışmıyor mu? Bu bağlantıyı tarayıcınıza kopyalayın:',
    auto: 'Bu mesaj otomatik olarak gönderildi.',
    kinds: {
      signup: { subject: 'E-posta adresinizi doğrulayın – PetConnect24', heading: 'PetConnect24’e hoş geldiniz', intro: 'Aramızda olmanız çok güzel. Giriş yapabilmeniz için e-posta adresinizi doğrulayın.', button: 'E-posta adresini doğrula', ignore: 'PetConnect24’e kayıt olmadıysanız bu e-postayı yok sayabilirsiniz.' },
      recovery: { subject: 'Şifrenizi sıfırlayın – PetConnect24', heading: 'Şifrenizi sıfırlayın', intro: 'Şifrenizi sıfırlamak istediniz. Düğmeyle yeni bir şifre belirleyin.', button: 'Yeni şifre belirle', ignore: 'Bunu siz istemediyseniz bu e-postayı yok sayabilirsiniz. Şifreniz değişmez.' },
      magiclink: { subject: 'PetConnect24 giriş bağlantınız', heading: 'Giriş yapın', intro: 'PetConnect24’e giriş yapmak için bu bağlantıyı kullanın.', button: 'Şimdi giriş yap', ignore: 'Bu e-postayı beklemiyorsanız yok sayabilirsiniz.' },
      invite: { subject: 'PetConnect24 daveti', heading: 'Davet edildiniz', intro: 'PetConnect24’e davet edildiniz. Daveti kabul etmek ve hesabınızı oluşturmak için düğmeyi kullanın.', button: 'Daveti kabul et', ignore: 'Bu e-postayı beklemiyorsanız yok sayabilirsiniz.' },
    },
  },
  ru: {
    hello: 'Здравствуйте, {name}!', helloAnon: 'Здравствуйте!',
    fallback: 'Кнопка не работает? Скопируйте эту ссылку в браузер:',
    auto: 'Это сообщение отправлено автоматически.',
    kinds: {
      signup: { subject: 'Подтвердите адрес электронной почты – PetConnect24', heading: 'Добро пожаловать в PetConnect24', intro: 'Рады видеть Вас. Подтвердите адрес электронной почты, чтобы войти в приложение.', button: 'Подтвердить адрес', ignore: 'Если Вы не регистрировались в PetConnect24, просто проигнорируйте это письмо.' },
      recovery: { subject: 'Сброс пароля – PetConnect24', heading: 'Сброс пароля', intro: 'Вы запросили сброс пароля. Нажмите кнопку, чтобы выбрать новый пароль.', button: 'Задать новый пароль', ignore: 'Если Вы не запрашивали сброс, проигнорируйте это письмо. Пароль останется прежним.' },
      magiclink: { subject: 'Ваша ссылка для входа в PetConnect24', heading: 'Вход', intro: 'Используйте эту ссылку для входа в PetConnect24.', button: 'Войти', ignore: 'Если Вы не ожидали это письмо, просто проигнорируйте его.' },
      invite: { subject: 'Приглашение в PetConnect24', heading: 'Вас пригласили', intro: 'Вас пригласили в PetConnect24. Нажмите кнопку, чтобы принять приглашение и создать учётную запись.', button: 'Принять приглашение', ignore: 'Если Вы не ожидали это письмо, просто проигнорируйте его.' },
    },
  },
  ar: {
    rtl: true,
    hello: 'مرحبًا {name}،', helloAnon: 'مرحبًا،',
    fallback: 'الزر لا يعمل؟ انسخ هذا الرابط إلى متصفحك:',
    auto: 'تم إرسال هذه الرسالة تلقائيًا.',
    kinds: {
      signup: { subject: 'يرجى تأكيد عنوان بريدك الإلكتروني – PetConnect24', heading: 'مرحبًا بك في PetConnect24', intro: 'يسعدنا انضمامك. يرجى تأكيد عنوان بريدك الإلكتروني حتى تتمكن من تسجيل الدخول.', button: 'تأكيد البريد الإلكتروني', ignore: 'إذا لم تقم بالتسجيل في PetConnect24، يمكنك تجاهل هذه الرسالة.' },
      recovery: { subject: 'إعادة تعيين كلمة المرور – PetConnect24', heading: 'إعادة تعيين كلمة المرور', intro: 'لقد طلبت إعادة تعيين كلمة المرور. استخدم الزر لاختيار كلمة مرور جديدة.', button: 'تعيين كلمة مرور جديدة', ignore: 'إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة. ستبقى كلمة المرور كما هي.' },
      magiclink: { subject: 'رابط تسجيل الدخول إلى PetConnect24', heading: 'تسجيل الدخول', intro: 'استخدم هذا الرابط لتسجيل الدخول إلى PetConnect24.', button: 'تسجيل الدخول الآن', ignore: 'إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها.' },
      invite: { subject: 'دعوة إلى PetConnect24', heading: 'لقد تمت دعوتك', intro: 'تمت دعوتك إلى PetConnect24. استخدم الزر لقبول الدعوة وإنشاء حسابك.', button: 'قبول الدعوة', ignore: 'إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها.' },
    },
  },
};
