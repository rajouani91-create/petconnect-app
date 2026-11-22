import { describe, expect, it } from 'vitest';
import { hasOpenOffer, offerState, wishDays, wishValid } from './inquiries';
import { buildMessage, type Job } from '../../supabase/functions/push-senden/message.ts';

const base = { status: 'answered' as const, offered_slots: null, offered_at: null, owner_wish_at: null, offer_declined_at: null };

describe('Terminvorschläge', () => {
  it('erkennt offene Vorschläge für die Halter:in', () => {
    expect(hasOpenOffer({ status: 'answered', offered_slots: ['2026-11-30T07:00:00Z'], origin: 'owner' })).toBe(true);
    expect(hasOpenOffer({ status: 'done', offered_slots: ['2026-11-30T07:00:00Z'], origin: 'owner' })).toBe(false);
    expect(hasOpenOffer({ status: 'open', offered_slots: [], origin: 'owner' })).toBe(false);
    expect(hasOpenOffer({ status: 'open', offered_slots: ['x'], origin: 'practice' })).toBe(false);
  });
  it('zeigt der Praxis den letzten Stand', () => {
    expect(offerState({ ...base, offered_slots: ['a'], offered_at: '2026-11-22T10:00Z' })).toBe('offer');
    expect(offerState({ ...base, offered_at: '2026-11-22T10:00Z', owner_wish_at: '2026-11-22T11:00Z' })).toBe('wish');
    expect(offerState({ ...base, offered_at: '2026-11-22T10:00Z', offer_declined_at: '2026-11-22T11:00Z' })).toBe('declined');
    // neuer Vorschlag nach dem Wunsch: Wunsch ist erledigt
    expect(offerState({ ...base, offered_at: '2026-11-22T12:00Z', owner_wish_at: '2026-11-22T11:00Z' })).toBe(null);
    expect(offerState({ ...base, status: 'done', offered_slots: ['a'] })).toBe(null);
  });
  it('bietet sieben Tage ab morgen an, auch über den Monatswechsel', () => {
    expect(wishDays('2026-11-28')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  });
  it('prüft den Wunsch', () => {
    expect(wishValid([], false, '  ')).toBe('ofErrWish');
    expect(wishValid([], true, '')).toBe(null);
    expect(wishValid(['2026-12-01'], false, '')).toBe(null);
    expect(wishValid([], false, 'x'.repeat(301))).toBe('obErrLong');
  });
  it('Push an die Praxis ohne Tiernamen-Vorsatz', () => {
    const j: Job = { kind: 'inquiry', ref_id: 'r', slot: 's', pet: 'Betty', title: 'Ole', url: '/praxis/anfragen', language: 'de', info: { event: 'wish' }, subs: [] };
    expect(buildMessage(j).title).toBe('Andere Zeit gewünscht');
    expect(buildMessage(j).body).toBe('Ole · Betty. Wunsch in PetConnect ansehen.');
    expect(buildMessage({ ...j, language: 'fr', info: { event: 'offer_declined' } }).title).toBe('Proposition de rendez-vous refusée');
  });
});
