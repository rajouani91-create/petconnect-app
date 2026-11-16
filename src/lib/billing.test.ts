import { describe, expect, it } from 'vitest';
import { clampFactor, kpis, lineNet, matchesFilter, missingForFinalize, samplePayload, totals, validOn, viewStatus, type InvoiceRow } from './billing';

const row = (o: Partial<InvoiceRow>): InvoiceRow => ({
  id: 'x', kind: 'invoice', status: 'open', number: 'RE-1', pet_id: null, pet_label: 'Bello', recipient_name: null, treatment_date: '2026-11-01',
  invoice_date: '2026-11-01', due_date: '2026-11-15', paid_on: null, pay_method: null, gross: 10, currency: 'EUR', first_item: null, item_count: 1,
  cancels_number: null, cancelled_by_number: null, has_owner: true, created_at: '2026-11-01', ...o,
});

describe('billing', () => {
  it('rechnet wie die Datenbank: Steuer je Satz auf die Netto-Summe', () => {
    const t = totals([
      { qty: 1, factor: 2.5, unit_price: 24, tax_rate: 19, free: false },
      { qty: 2, factor: 3, unit_price: 12, tax_rate: 19, free: false },
      { qty: 3, factor: 1, unit_price: 4.2, tax_rate: 7, free: false },
      { qty: 1, factor: 9, unit_price: 5, tax_rate: 19, free: true },
    ], false);
    expect(t).toEqual({ net: 149.6, tax: 26.91, gross: 176.51, taxes: [{ rate: 19, net: 137, tax: 26.03 }, { rate: 7, net: 12.6, tax: 0.88 }] });
    expect(totals([{ qty: 1, factor: 1, unit_price: 100, tax_rate: 19, free: false }], true).tax).toBe(0);
    expect(lineNet({ qty: 3, factor: 1.15, unit_price: 9.99, free: false })).toBe(34.47);
  });
  it('Status „Überfällig“ nur bei offen und Fälligkeit vorbei', () => {
    expect(viewStatus(row({}), '2026-11-16')).toBe('overdue');
    expect(viewStatus(row({}), '2026-11-15')).toBe('open');
    expect(viewStatus(row({ status: 'paid' }), '2026-12-01')).toBe('paid');
    expect(matchesFilter(row({}), 'open', '2026-11-16')).toBe(true);
    const k = kpis([row({}), row({ status: 'paid', gross: 5 }), row({ status: 'draft', due_date: null }), row({ status: 'open', due_date: '2026-12-01', gross: 2.5 })], '2026-11-16');
    expect(k).toEqual({ open: { sum: 12.5, n: 2 }, overdue: { sum: 10, n: 1 }, paid: { sum: 5, n: 1 }, drafts: 1 });
  });
  it('Faktor begrenzt, Gültigkeit, fehlende Angaben, Beispielkatalog', () => {
    expect(clampFactor(9, 1, 3)).toBe(3);
    expect(clampFactor(Number.NaN, 1, 3)).toBe(1);
    expect(validOn({ valid_from: '2026-01-01', valid_to: null }, '2025-12-31')).toBe(false);
    expect(missingForFinalize({ recipient_name: 'A', recipient_address: '', items: [] }, { settings: { tax_id: null, tax_number: null } as never, practice: { street: 'x', city: 'y' } as never }))
      .toEqual(['blErrItems', 'blErrRecipient', 'blErrTaxId']);
    const s = samplePayload('DE');
    expect(s.items).toHaveLength(15);
    expect(s.items.find((x) => x.code === 'G15')?.tax_rate).toBe(7);
    expect(samplePayload('UK').currency).toBe('GBP');
  });
});
