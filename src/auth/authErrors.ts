import type { MessageKey } from '../i18n';

/** Supabase-Auth-Fehlercode → verständlicher Text. Unbekannte Codes ergeben die allgemeine Meldung. */
export function authErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case 'invalid_credentials':
      return 'err_login';
    case 'email_not_confirmed':
      return 'err_notConfirmed';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'err_rate';
    case 'weak_password':
      return 'err_weakPw';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'err_email';
    default:
      return 'errGeneric';
  }
}
