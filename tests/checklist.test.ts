import { describe, expect, it } from 'vitest';
import { buildChecklist } from '@/lib/domain/checklist';
import { computeTax } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView, type RentEntry } from '@/lib/domain/types';

const today = new Date('2026-06-15T12:00:00Z');

const paid = (month: string): RentEntry => ({
  month,
  status: 'paid',
  amount: 700,
  receivedDate: `${month}-03`,
  note: '',
});

function apartment(over: Partial<ApartmentView> = {}): ApartmentView {
  return {
    id: 'a1',
    settings: { ...defaultSettings, name: 'Flat', purchasePrice: 100000 },
    rents: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map(paid),
    costs: [],
    owners: [{ userId: 'u1', email: 'me@example.test', sharePct: 100 }],
    invites: [],
    recurring: [],
    acquisitionCosts: [],
    mySale: null,
    mySharePct: 100,
    ...over,
  };
}

const check = (apt: ApartmentView) => buildChecklist({ apt, tax: computeTax(apt, 2026, today) });

const byId = (items: ReturnType<typeof check>) => Object.fromEntries(items.map((i) => [i.id, i]));

describe('the declaration checklist', () => {
  it('is entirely ok for a complete, fully logged apartment', () => {
    const items = check(apartment());
    expect(items.filter((i) => !i.ok)).toEqual([]);
    expect(items.length).toBeGreaterThan(0);
  });

  const depreciated = { ...defaultSettings, name: 'House', propertyType: 'property' as const, useDepreciation: true };

  it('sends a missing purchase price to the apartment settings when a property is depreciated, which is what needs it', () => {
    const price = byId(check(apartment({ settings: depreciated })))['price']!;
    expect(price.ok).toBe(false);
    expect(price.to).toBe('settings');
    expect(byId(check(apartment({ settings: { ...depreciated, purchasePrice: 90000 } })))['price']!.ok).toBe(true);
  });

  it('does not ask for a purchase price of a flat in a housing company, which is never depreciated', () => {
    const apt = apartment({ settings: { ...defaultSettings, name: 'Flat', purchasePrice: 0 } });
    expect(check(apt).map((i) => i.id)).not.toContain('price');
    expect(check(apt).filter((i) => !i.ok)).toEqual([]);
  });

  it('does not ask for a purchase price of a property whose building is not depreciated', () => {
    const apt = apartment({ settings: { ...depreciated, useDepreciation: false } });
    expect(check(apt).map((i) => i.id)).not.toContain('price');
  });

  it('counts months not logged yet and sends them to the rent log', () => {
    const apt = apartment({ rents: [paid('2026-01'), paid('2026-02')] });
    const logged = byId(check(apt))['logged']!;
    expect(logged.ok).toBe(false);
    expect(logged.text).toBe('4 months not logged yet');
    expect(logged.to).toBe('rent');
  });

  it('uses the singular for exactly one month not logged', () => {
    const apt = apartment({ rents: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(paid) });
    expect(byId(check(apt))['logged']!.text).toBe('1 month not logged yet');
  });

  it('flags unpaid months because they are not counted as income', () => {
    const apt = apartment({
      rents: [
        ...['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(paid),
        { month: '2026-06', status: 'unpaid', amount: 0, receivedDate: '', note: '' },
      ],
    });
    const unpaid = byId(check(apt))['unpaid']!;
    expect(unpaid.ok).toBe(false);
    expect(unpaid.text).toBe('1 month unpaid — not counted as income');
  });

  it('flags costs without a receipt photo and sends them to the costs list', () => {
    const apt = apartment({
      costs: [
        { id: 'c1', date: '2026-02-01', category: 'repairs', description: '', amount: 90, hasReceipt: false },
        { id: 'c2', date: '2026-02-02', category: 'repairs', description: '', amount: 40, hasReceipt: false },
        { id: 'c3', date: '2026-02-03', category: 'repairs', description: '', amount: 10, hasReceipt: true },
      ],
    });
    const receipts = byId(check(apt))['receipts']!;
    expect(receipts.ok).toBe(false);
    expect(receipts.text).toBe('2 costs have no receipt photo');
    expect(receipts.to).toBe('costs');
  });

  it('asks the owner to confirm the shares while an invited owner has not joined', () => {
    const apt = apartment({ mySharePct: 60, invites: [{ id: 'i1', email: 'bob@example.test', sharePct: 40 }] });
    const invites = byId(check(apt))['invites']!;
    expect(invites.ok).toBe(false);
    expect(invites.to).toBe('settings');
  });

  it('has no invites item at all when nobody was invited', () => {
    expect(byId(check(apartment()))['invites']).toBeUndefined();
  });
});
