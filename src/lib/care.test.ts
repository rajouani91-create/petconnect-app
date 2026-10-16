import { describe, expect, it } from 'vitest';
import {
  claimTotals,
  estimateReimbursement,
  formatEuro,
  isSitterToken,
  mailtoLink,
  moneyInput,
  parseMoney,
  parseSitterView,
  sitterLink,
  sitterState,
  telHref,
  validateClaim,
  validateInsurance,
  validateSitter,
  whatsappLink,
  type ClaimFormValues,
  type InsuranceFormValues,
} from './care';

const TODAY = '2026-10-16';
const TOKEN = 'a1'.repeat(32);

describe('Währung', () => {
  it('deutsches Format „1.234,50 €“', () => {
    expect(formatEuro(1234.5, 'de-DE')).toBe('1.234,50 €');
    expect(formatEuro(0, 'de-DE')).toBe('0,00 €');
    expect(formatEuro(1234.5, 'en-GB')).toBe('€1,234.50');
  });
  it('Beträge lesen: Komma, Punkt, Tausenderpunkt, €-Zeichen', () => {
    expect(parseMoney('1.234,50')).toEqual({ ok: true, value: 1234.5 });
    expect(parseMoney('1234,5')).toEqual({ ok: true, value: 1234.5 });
    expect(parseMoney('1234.50')).toEqual({ ok: true, value: 1234.5 });
    expect(parseMoney('12 €')).toEqual({ ok: true, value: 12 });
    expect(parseMoney('1.234')).toEqual({ ok: true, value: 1234 });
    expect(parseMoney('0,99')).toEqual({ ok: true, value: 0.99 });
  });
  it('ungültige Beträge und Grenzen', () => {
    expect(parseMoney('')).toEqual({ ok: false, error: 'required' });
    expect(parseMoney('abc')).toEqual({ ok: false, error: 'format' });
    expect(parseMoney('12,345')).toEqual({ ok: false, error: 'format' });
    expect(parseMoney('-5')).toEqual({ ok: false, error: 'format' });
    expect(parseMoney('1,234.50')).toEqual({ ok: false, error: 'format' });
    expect(parseMoney('0')).toEqual({ ok: false, error: 'range' });
    expect(parseMoney('0', true)).toEqual({ ok: true, value: 0 });
    expect(parseMoney('100000')).toEqual({ ok: false, error: 'range' });
    expect(parseMoney('99999,99')).toEqual({ ok: true, value: 99999.99 });
  });
  it('Wert fürs Eingabefeld', () => {
    expect(moneyInput(1234.5, 'de-DE')).toBe('1234,50');
    expect(moneyInput(null, 'de-DE')).toBe('');
  });
});

describe('Erstattung: Schätzung und Summen', () => {
  it('Betrag × Quote, ohne Selbstbeteiligung, auf Cent', () => {
    expect(estimateReimbursement(200, 80)).toBe(160);
    expect(estimateReimbursement(123.45, 70)).toBe(86.42);
    expect(estimateReimbursement(99.99, 100)).toBe(99.99);
    expect(estimateReimbursement(50, 0)).toBe(0);
    expect(estimateReimbursement(200, null)).toBeNull();
  });
  it('Summen: eingereicht (ohne „offen“), erstattet, offen (noch nicht entschieden)', () => {
    const c = (amount: number, status: string, reimbursed_amount: number | null = null) => ({ amount, status, reimbursed_amount });
    const s = claimTotals([c(100, 'open'), c(200.1, 'submitted'), c(50, 'query'), c(300, 'partial', 120.5), c(80, 'reimbursed', 80), c(40, 'rejected', 0)]);
    expect(s.submitted).toBe(670.1);
    expect(s.reimbursed).toBe(200.5);
    expect(s.pending).toBe(350.1);
    expect(claimTotals([])).toEqual({ submitted: 0, reimbursed: 0, pending: 0 });
  });
  it('Formulare: Pflichtfelder, Quote 0–100, erstattet ≤ Rechnung, Datum', () => {
    const ins: InsuranceFormValues = { insurer: 'Tierkasse', policyNo: 'P-1', holder: '', deductible: '', pct: '', submission: '', note: '' };
    expect(validateInsurance(ins)).toEqual({});
    expect(validateInsurance({ ...ins, insurer: ' ', policyNo: '' })).toEqual({ insurer: 'insErrInsurer', policyNo: 'insErrPolicy' });
    expect(validateInsurance({ ...ins, pct: '101' })).toEqual({ pct: 'insErrPct' });
    expect(validateInsurance({ ...ins, pct: '80 %', deductible: '150,00' })).toEqual({});
    expect(validateInsurance({ ...ins, deductible: 'viel' })).toEqual({ deductible: 'insErrMoney' });
    const cl: ClaimFormValues = { title: 'Rechnung', amount: '200,00', date: TODAY, status: 'open', reimbursed: '', documentId: '', note: '' };
    expect(validateClaim(cl, TODAY)).toEqual({});
    expect(validateClaim({ ...cl, amount: '0' }, TODAY)).toEqual({ amount: 'insErrRange' });
    expect(validateClaim({ ...cl, reimbursed: '200,01' }, TODAY)).toEqual({ reimbursed: 'clErrReimbursed' });
    expect(validateClaim({ ...cl, reimbursed: '200' }, TODAY)).toEqual({});
    expect(validateClaim({ ...cl, date: '2026-10-17' }, TODAY)).toEqual({ date: 'errFuture' });
    expect(validateClaim({ ...cl, title: '' }, TODAY)).toEqual({ title: 'clErrTitle' });
  });
});

describe('Betreuung', () => {
  const a = (valid_from: string, valid_to: string, revoked_at: string | null = null) => ({ valid_from, valid_to, revoked_at });
  it('Status: Grenzen heute, gestern, morgen', () => {
    expect(sitterState(a('2026-10-17', '2026-10-20'), TODAY)).toBe('upcoming'); // startet morgen
    expect(sitterState(a(TODAY, '2026-10-20'), TODAY)).toBe('active'); // startet heute
    expect(sitterState(a('2026-10-01', TODAY), TODAY)).toBe('active'); // endet heute
    expect(sitterState(a('2026-10-01', '2026-10-15'), TODAY)).toBe('expired'); // endete gestern
    expect(sitterState(a('2026-10-01', '2026-10-20', '2026-10-10T10:00:00Z'), TODAY)).toBe('revoked');
    expect(sitterState(a('2026-11-01', '2026-11-05', '2026-10-10T10:00:00Z'), TODAY)).toBe('revoked');
  });
  it('Formular: Name, Zeitraum, Ende nicht vor Beginn, höchstens 92 Tage', () => {
    const v = { name: 'Lea', from: TODAY, to: '2026-10-20', feeding: '', care: '' };
    expect(validateSitter(v)).toEqual({});
    expect(validateSitter({ ...v, to: TODAY })).toEqual({});
    expect(validateSitter({ ...v, name: ' ' })).toEqual({ name: 'sitNeed' });
    expect(validateSitter({ ...v, from: '', to: '' })).toEqual({ from: 'sitNeed', to: 'sitNeed' });
    expect(validateSitter({ ...v, to: '2026-10-15' })).toEqual({ to: 'sitDateBad' });
    expect(validateSitter({ ...v, to: '2027-01-16' })).toEqual({}); // 92 Tage
    expect(validateSitter({ ...v, to: '2027-01-17' })).toEqual({ to: 'sitTooLong' });
    expect(validateSitter({ ...v, feeding: 'x'.repeat(2001) })).toEqual({ feeding: 'sitErrText' });
  });
  it('Link aus Origin ohne doppelte Schrägstriche', () => {
    expect(sitterLink('https://petconnect24.com', TOKEN)).toBe(`https://petconnect24.com/betreuung/${TOKEN}`);
    expect(sitterLink('https://petconnect24.com/', TOKEN)).toBe(`https://petconnect24.com/betreuung/${TOKEN}`);
    expect(sitterLink('http://localhost:3000//', TOKEN)).toBe(`http://localhost:3000/betreuung/${TOKEN}`);
    expect(isSitterToken(TOKEN)).toBe(true);
    expect(isSitterToken('kurz')).toBe(false);
    expect(isSitterToken(`${TOKEN}/x`)).toBe(false);
  });
  it('WhatsApp- und E-Mail-Links kodieren den Text', () => {
    expect(whatsappLink('Hallo & Tschüss')).toBe('https://wa.me/?text=Hallo%20%26%20Tsch%C3%BCss');
    expect(mailtoLink('Betreuung von Luna', 'Link: https://x/y?a=1')).toBe('mailto:?subject=Betreuung%20von%20Luna&body=Link%3A%20https%3A%2F%2Fx%2Fy%3Fa%3D1');
  });
  it('Antwort von sitter_view: ok, nicht begonnen, alles andere ungültig', () => {
    expect(parseSitterView({ status: 'expired' })).toEqual({ status: 'invalid' });
    expect(parseSitterView({ status: 'revoked' })).toEqual({ status: 'invalid' });
    expect(parseSitterView({ status: 'not_found' })).toEqual({ status: 'invalid' });
    expect(parseSitterView(null)).toEqual({ status: 'invalid' });
    expect(parseSitterView({ status: 'not_yet', valid_from: '2026-11-01', pet_name: 'Luna' })).toEqual({ status: 'not_yet', valid_from: '2026-11-01', pet_name: 'Luna' });
    const ok = parseSitterView({ status: 'ok', sitter_name: 'Lea', valid_from: TODAY, valid_to: '2026-10-20', feeding: 'morgens', care_notes: null, pet: { name: 'Luna', species: 'dog', chip_no: '276' }, owner_name: 'Ahmed', owner_phone: '0170 1', emergency_contact: null, vet_name: 'Praxis', vet_phone: '06142 1' });
    expect(ok).toMatchObject({ status: 'ok', vet_phone: '06142 1', pet: { name: 'Luna', allergies: null, chip_no: '276' } });
    expect(parseSitterView({ status: 'ok', pet: {} })).toEqual({ status: 'invalid' });
  });
});

describe('Telefon', () => {
  it('tel:-Link aus freier Eingabe', () => {
    expect(telHref('06142 / 12 34-56')).toBe('tel:06142123456');
    expect(telHref('+49 170 1234567')).toBe('tel:+491701234567');
    expect(telHref('ab')).toBeNull();
  });
});
