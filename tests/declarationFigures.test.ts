import { describe, expect, it } from 'vitest';
import { declarationFigures, tenancyPeriod } from '@/lib/domain/forms';
import { computeTax, depreciationDetail, movableDetail, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type CostEntry, type Ledger } from '@/lib/domain/types';

/**
 * The numbers that go on form 7H (a housing-company flat) and 7K (a property),
 * in the order and under the numbers of the forms (docs/finnish-rental-tax-rules.md §12).
 */

const today = new Date('2027-03-10T12:00:00Z');
const cost = (c: Partial<CostEntry> & Pick<CostEntry, 'category' | 'amount' | 'date'>): CostEntry => ({
  id: `${c.category}-${c.date}-${c.amount}`,
  description: '',
  hasReceipt: true,
  ...c,
});
const paid = (month: string, amount = 1000) => ({ month, status: 'paid' as const, amount, receivedDate: `${month}-03`, note: '' });
const other = (month: string, status: 'vacant' | 'unpaid') => ({ month, status, amount: 0, receivedDate: '', note: '' });
const ledger = (settings: Partial<Ledger['settings']>, costs: CostEntry[] = [], rents: Ledger['rents'] = [paid('2025-01')]): Ledger => ({
  settings: { ...defaultSettings, ...settings },
  rents,
  costs,
});
const figures = (l: Ledger, form: '7H' | '7K', pct = 100, year = 2025) =>
  declarationFigures(form, ownerShare(computeTax(l, year, today), pct), l);

describe('form 7H, a flat in a housing company', () => {
  const flat = ledger(
    { financingChargeDeductible: true },
    [
      cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 300 }),
      cost({ category: 'water_charge', date: '2025-02-01', amount: 40 }),
      cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 }),
      cost({ category: 'repairs', date: '2025-02-01', amount: 120 }),
      cost({ category: 'insurance', date: '2025-02-01', amount: 96 }),
      cost({ category: 'travel', date: '2025-02-01', amount: 27 }),
      cost({ category: 'improvement', date: '2025-05-01', amount: 3000 }),
      cost({ category: 'furniture', date: '2025-03-01', amount: 2000 }),
      cost({ category: 'furniture', date: '2025-03-02', amount: 150 }),
      cost({ category: 'loan_interest', date: '2025-04-01', amount: 400 }),
    ],
  );

  it('puts each cost on its own row: 2.2 charges and water, 2.3 financing, 2.4 repairs, 2.5 the rest', () => {
    const f = figures(flat, '7H');
    expect(f).toMatchObject({
      form: '7H',
      gross: 1000,
      maintenanceAndWater: 340,
      financing: 80,
      repairs: 120,
      // insurance 96 + travel 27 + furniture up to the limit 150 + improvement's tenth 300 + furniture's quarter 500
      other: 1073,
      interest: 400,
    });
    expect(f.otherParts).toEqual([
      { kind: 'category', category: 'furniture', amount: 150 },
      { kind: 'category', category: 'insurance', amount: 96 },
      { kind: 'category', category: 'travel', amount: 27 },
      { kind: 'improvements', amount: 300 },
      { kind: 'furniture', amount: 500 },
    ]);
  });

  it('leaves the loan interest off the form, to be declared as interest on debts', () => {
    const f = figures(flat, '7H');
    // 1 000 − 340 − 80 − 120 − 1 073, and the 400 of interest comes off after that.
    expect(f.netBeforeInterest).toBe(-613);
    expect(f.depreciation).toBe(0);
  });

  it('is the owner’s share of every row', () => {
    const f = figures(flat, '7H', 25);
    expect([f.gross, f.maintenanceAndWater, f.financing, f.repairs, f.other, f.interest]).toEqual([250, 85, 20, 30, 268.25, 100]);
  });

  it('puts a financing charge the company funds nowhere on the form', () => {
    const f = figures(ledger({}, [cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 })]), '7H');
    expect(f.financing).toBe(0);
  });

  it('puts the flat-rate deduction for a furnished flat in other expenses', () => {
    const f = figures(ledger({ furnishing: 'flat' }, [], [paid('2025-01'), paid('2025-02')]), '7H');
    expect(f.other).toBe(120);
    expect(f.otherParts).toEqual([{ kind: 'flatRate', amount: 120 }]);
  });

  it('says how much the rows must come down by when the rent is below the usual', () => {
    const l = ledger({ belowMarketRent: true }, [cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 1500 })]);
    const f = figures(l, '7H');
    expect(f.maintenanceAndWater).toBe(1500);
    expect(f.limitReduction).toBe(500);
  });
});

describe('form 7K, a property of one’s own', () => {
  const property = {
    propertyType: 'property' as const,
    useDepreciation: true,
    purchasePrice: 100000,
    depreciationPrior: 20000,
  };
  const house = ledger(
    property,
    [
      cost({ category: 'repairs', date: '2025-02-01', amount: 500 }),
      cost({ category: 'insurance', date: '2025-02-01', amount: 300 }),
      cost({ category: 'property_tax', date: '2025-09-01', amount: 200 }),
      cost({ category: 'improvement', date: '2025-05-01', amount: 20000 }),
      cost({ category: 'furniture', date: '2025-03-01', amount: 2000 }),
      cost({ category: 'loan_interest', date: '2025-04-01', amount: 900 }),
    ],
    [paid('2025-01', 12000)],
  );

  it('puts repairs in 3.1, the other costs in 3.2 and the year’s depreciation in 3.3', () => {
    const f = figures(house, '7K');
    expect(f).toMatchObject({ form: '7K', gross: 12000, repairs: 500, other: 500, maintenanceAndWater: 0, financing: 0, interest: 900 });
    // The building: (80 000 left + 20 000 improvement) × 4 %, and the sofa’s quarter.
    expect(f.depreciation).toBe(4500);
    // Before interest: 12 000 − 500 − 500 − 4 500
    expect(f.netBeforeInterest).toBe(6500);
  });

  it('works out the building’s depreciation as the form does, row by row (vero.fi’s example: 80 000 + 20 000 → 4 000)', () => {
    const d = depreciationDetail(house, 2025)!;
    expect(d).toEqual({ cost: 100000, start: 80000, added: 20000, base: 100000, part: 4000, end: 96000, rate: 4 });
  });

  it('carries the cost that is left into the next year’s row 4.2', () => {
    expect(depreciationDetail(house, 2026)).toMatchObject({ start: 96000, added: 0, base: 96000, part: 3840, end: 92160 });
  });

  it('has no depreciation rows for a flat, or before depreciation starts', () => {
    expect(depreciationDetail(ledger({ ...property, propertyType: 'share' }), 2025)).toBeNull();
    expect(depreciationDetail(house, 2024)).toBeNull();
    expect(depreciationDetail(ledger({ ...property, useDepreciation: false }), 2025)).toBeNull();
  });

  it('shows the owner’s share of the depreciation rows', () => {
    const l = ledger({ ...property, depreciationPrior: 0 });
    const f = figures(l, '7K', 25);
    expect(f.buildingRows).toEqual({ cost: 25000, start: 25000, added: 0, base: 25000, part: 1000, end: 24000, rate: 4 });
  });

  it('reports a loss in 3.5 when the costs are more than the rent', () => {
    const l = ledger({ propertyType: 'property' }, [cost({ category: 'repairs', date: '2025-02-01', amount: 1500 })]);
    expect(figures(l, '7K').netBeforeInterest).toBe(-500);
  });
});

describe('furniture and appliances over the at-once limit', () => {
  const sofa = ledger({}, [
    cost({ category: 'furniture', date: '2025-03-01', amount: 2000, description: 'Sofa' }),
    cost({ category: 'furniture', date: '2026-03-01', amount: 1500, description: 'Dryer' }),
    cost({ category: 'furniture', date: '2026-04-01', amount: 100, description: 'Lamp' }),
    cost({ category: 'furniture', date: '2026-04-02', amount: 3000, spreadYears: 1, description: 'Short-lived' }),
  ]);

  it('is listed item by item, with what is left at each end of the year', () => {
    expect(movableDetail(sofa, 2026)).toEqual({
      start: 1500,
      added: 1500,
      part: 750,
      end: 2250,
      items: [
        { id: 'furniture-2025-03-01-2000', date: '2025-03-01', description: 'Sofa', price: 2000, start: 1500, added: 0, part: 375, end: 1125 },
        { id: 'furniture-2026-03-01-1500', date: '2026-03-01', description: 'Dryer', price: 1500, start: 0, added: 1500, part: 375, end: 1125 },
      ],
    });
  });

  it('drops an item the year after its last part, and one that was deducted at once is never listed', () => {
    expect(movableDetail(sofa, 2028).items).toEqual([]);
    expect(movableDetail(sofa, 2025).items.map((i) => i.description)).toEqual(['Sofa']);
  });

  it('is deducted from the loose-property row of a property’s form', () => {
    const l = ledger({ propertyType: 'property' }, [cost({ category: 'furniture', date: '2025-03-01', amount: 2000 })]);
    expect(figures(l, '7K').movableRows).toEqual({ start: 0, added: 2000, base: 2000, part: 500, end: 1500 });
    expect(figures(l, '7K', 50).movableRows).toEqual({ start: 0, added: 1000, base: 1000, part: 250, end: 750 });
  });
});

describe('the period the flat was let', () => {
  it('runs from the first let month to the last, as day.month.year', () => {
    expect(tenancyPeriod([paid('2025-03'), paid('2025-04'), other('2025-05', 'unpaid')], 2025)).toBe('1.3.2025–31.5.2025');
  });

  it('is the whole year when the flat was let in several periods, which is how the form asks for it', () => {
    expect(tenancyPeriod([paid('2025-03'), other('2025-04', 'vacant'), paid('2025-05')], 2025)).toBe('1.1.2025–31.12.2025');
  });

  it('ends with the last month the flat was let, not with a vacant month after it', () => {
    expect(tenancyPeriod([paid('2025-03'), paid('2025-04'), other('2025-05', 'vacant')], 2025)).toBe('1.3.2025–30.4.2025');
  });

  it('knows how long February is', () => {
    expect(tenancyPeriod([paid('2024-02')], 2024)).toBe('1.2.2024–29.2.2024');
  });

  it('is empty when nothing was let that year', () => {
    expect(tenancyPeriod([paid('2025-03')], 2026)).toBe('');
    expect(tenancyPeriod([other('2025-03', 'vacant')], 2025)).toBe('');
  });
});
