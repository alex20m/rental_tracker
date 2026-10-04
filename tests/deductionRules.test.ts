import { describe, expect, it } from 'vitest';
import {
  computeDepreciation,
  computeTax,
  deductionOf,
  deductionsOf,
  estimateCapitalTax,
  mileageAmount,
  ownerShare,
  portfolioTotals,
} from '@/lib/domain/tax';
import { defaultSettings, type CostEntry, type Ledger } from '@/lib/domain/types';

/**
 * The rules as Verohallinto states them (docs/finnish-rental-tax-rules.md):
 * the figures in these tests are the ones in vero.fi's own worked examples,
 * written out rather than recomputed.
 */

const today = new Date('2027-03-10T12:00:00Z');
const cost = (c: Partial<CostEntry> & Pick<CostEntry, 'category' | 'amount' | 'date'>): CostEntry => ({
  id: `${c.category}-${c.date}-${c.amount}`,
  description: '',
  hasReceipt: true,
  ...c,
});
const paid = (month: string, amount = 1000) => ({
  month,
  status: 'paid' as const,
  amount,
  receivedDate: `${month}-03`,
  note: '',
});
const ledger = (settings: Partial<Ledger['settings']>, costs: CostEntry[] = [], rents: Ledger['rents'] = [paid('2025-01')]): Ledger => ({
  settings: { ...defaultSettings, ...settings },
  rents,
  costs,
});
const property = { propertyType: 'property' as const, useDepreciation: true, purchasePrice: 100000 };
const depr = (l: Ledger, year: number, kind: string) =>
  computeTax(l, year, today).depreciationLines.find((d) => d.kind === kind)?.amount ?? 0;

describe('furniture and other loose property', () => {
  const sofa = (amount: number) => ledger({}, [cost({ category: 'furniture', date: '2025-03-01', amount })]);
  const years = (l: Ledger, to: number) => Array.from({ length: to - 2024 }, (_, i) => depr(l, 2025 + i, 'furniture'));

  it('deducts a remainder of at most 1 200 € whole at the start of a year, so the item is deducted in full', () => {
    // A 2 000 € dryer: 500, then 375, then the 1 125 € that is left.
    expect(years(sofa(2000), 2029)).toEqual([500, 375, 1125, 0, 0]);
  });

  it('keeps depreciating at 25 % of what is left while the remainder is above 1 200 €', () => {
    const l = sofa(5000);
    expect(years(l, 2031)).toEqual([1250, 937.5, 703.13, 527.34, 395.51, 1186.52, 0]);
    expect(years(l, 2031).reduce((a, b) => a + b, 0)).toBeCloseTo(5000, 2);
  });

  it('takes the remainder whole the year after an item just over the limit', () => {
    expect(years(sofa(1200.01), 2027)).toEqual([300, 900.01, 0]);
  });

  it('deducts exactly 1 200 € at once', () => {
    expect(computeTax(sofa(1200), 2025, today).deductibleCosts).toBe(1200);
  });

  it('takes a remainder of exactly 1 200 € whole too', () => {
    // 1 600 €: a quarter is 400 €, which leaves exactly 1 200 € at the start of the next year.
    expect(years(sofa(1600), 2027)).toEqual([400, 1200, 0]);
  });
});

describe('a basic improvement', () => {
  const glazing = (settings: Partial<Ledger['settings']>, amount = 900, spreadYears?: number) =>
    ledger(settings, [cost({ category: 'improvement', date: '2025-05-01', amount, spreadYears })]);

  it('of a flat is spread over at least three years, because a shorter life is not an improvement', () => {
    expect([2025, 2026, 2027, 2028].map((y) => depr(glazing({}, 900, 2), y, 'improvements'))).toEqual([300, 300, 300, 0]);
    expect([2025, 2026, 2027].map((y) => depr(glazing({}, 900, 1), y, 'improvements'))).toEqual([300, 300, 300]);
  });

  it('of a flat is spread over at most ten years', () => {
    expect([2025, 2034, 2035].map((y) => depr(glazing({}, 3000, 40), y, 'improvements'))).toEqual([300, 300, 0]);
  });

  it("of a property's building is added to the building's cost and depreciated at the building's rate", () => {
    const l = glazing({ ...property }, 20000);
    // (100 000 + 20 000) × 4 %, and nothing is spread over ten years.
    expect(depr(l, 2025, 'building')).toBe(4800);
    expect(depr(l, 2025, 'improvements')).toBe(0);
    expect(computeTax(l, 2025, today).deductibleCosts).toBe(0);
  });

  it("of a property's building carries on in the cost the building is depreciated from the next year", () => {
    // 120 000 − 4 800 = 115 200 left at the start of 2026.
    expect(depr(glazing({ ...property }, 20000), 2026, 'building')).toBe(4608);
  });

  it('is not deducted at all while building depreciation is off: it waits for the sale', () => {
    const l = glazing({ propertyType: 'property', useDepreciation: false }, 20000);
    const t = computeTax(l, 2025, today);
    expect(t.depreciation).toBe(0);
    expect(t.netIncome).toBe(1000);
  });

  it('is told apart in how a cost is deducted', () => {
    const c = { category: 'improvement' as const, amount: 900 };
    expect(deductionOf(c, { ...defaultSettings })).toBe('improvement');
    expect(deductionOf(c, { ...defaultSettings, propertyType: 'property' })).toBe('addition');
  });
});

describe("a property's building depreciation", () => {
  it('goes down year by year with the cost that is left, from the first year logged', () => {
    const l = ledger({ ...property });
    expect([2024, 2025, 2026, 2027].map((y) => computeDepreciation(l, y))).toEqual([0, 4000, 3840, 3686.4]);
  });

  it('is deducted whole at exactly 1 200 € left, not only under it', () => {
    expect(computeDepreciation(ledger({ ...property, purchasePrice: 10000, depreciationPrior: 8800 }), 2025)).toBe(1200);
  });

  it('starts at the year chosen, taking what was depreciated before it off the cost', () => {
    const l = ledger({ ...property, depreciationFromYear: 2026, depreciationPrior: 4000 });
    expect([2025, 2026, 2027].map((y) => computeDepreciation(l, y))).toEqual([0, 3840, 3686.4]);
  });

  it('starts at the year of the first rent logged, whichever year is on screen', () => {
    expect(computeDepreciation(ledger({ ...property }, [], [paid('2026-04')]), 2025)).toBe(0);
    expect(computeDepreciation(ledger({ ...property }, [], [paid('2026-04')]), 2026)).toBe(4000);
  });

  it('adds the building’s part of the purchase costs to its cost (vero.fi’s example: 149 350 € × 4 %)', () => {
    const l = ledger({ ...property, purchasePrice: 200000, purchaseCosts: 6000, buildingSharePct: 72.5 });
    expect(computeDepreciation(l, 2025)).toBe(5974);
  });

  it('is at most 4 % for a residential building, whatever rate is entered', () => {
    expect(computeDepreciation(ledger({ ...property, depreciationRate: 7 }), 2025)).toBe(4000);
  });

  it('is up to 7 % for a shop, warehouse, factory or workshop', () => {
    expect(computeDepreciation(ledger({ ...property, buildingKind: 'commercial', depreciationRate: 7 }), 2025)).toBe(7000);
    expect(computeDepreciation(ledger({ ...property, buildingKind: 'commercial', depreciationRate: 10 }), 2025)).toBe(7000);
  });

  it('may be claimed at less than the highest rate', () => {
    expect(computeDepreciation(ledger({ ...property, depreciationRate: 2.5 }), 2025)).toBe(2500);
  });

  it('is deducted whole once it has been claimed before and under 1 200 € is left', () => {
    // 10 000 € cost, 8 900 € claimed: 1 100 € is left at the start of the year — all of it, not 4 %.
    expect(computeDepreciation(ledger({ ...property, purchasePrice: 10000, depreciationPrior: 8900 }), 2025)).toBe(1100);
    // A small building never claimed on is depreciated at the rate as usual.
    expect(computeDepreciation(ledger({ ...property, purchasePrice: 1000 }), 2025)).toBe(40);
  });

  it('counts only the let part of a building that is partly let', () => {
    expect(computeDepreciation(ledger({ ...property, letSharePct: 60 }), 2025)).toBe(2400);
  });

  it('is nothing for a flat in a housing company', () => {
    expect(computeDepreciation(ledger({ ...property, propertyType: 'share' }), 2025)).toBe(0);
  });
});

describe('a furnished flat', () => {
  const rents = [paid('2025-01'), paid('2025-02'), paid('2025-03'), { ...paid('2025-04'), status: 'unpaid' as const, amount: 0, receivedDate: '' }, { ...paid('2025-05'), status: 'vacant' as const, amount: 0, receivedDate: '' }];

  it('takes the flat rate per month it was let: 60 € for a larger flat', () => {
    const t = computeTax(ledger({ furnishing: 'flat', roomClass: 'larger' }, [], rents), 2025, today);
    expect(t.depreciationLines).toEqual([{ kind: 'flatRate', amount: 240 }]);
    expect(t.netIncome).toBe(2760);
  });

  it('takes 40 € a month for a studio or one room', () => {
    expect(computeTax(ledger({ furnishing: 'flat', roomClass: 'studio' }, [], rents), 2025, today).depreciation).toBe(160);
  });

  it('takes nothing when the furniture is deducted at its actual cost', () => {
    expect(computeTax(ledger({ furnishing: 'actual' }, [], rents), 2025, today).depreciationLines).toEqual([]);
  });

  it('refuses the actual cost of furniture, which the flat rate already covers', () => {
    const l = ledger({ furnishing: 'flat' }, [cost({ category: 'furniture', date: '2025-02-01', amount: 300 })], rents);
    const t = computeTax(l, 2025, today);
    expect(t.deductibleCosts).toBe(0);
    expect(t.nonDeductibleCosts).toBe(300);
    expect(deductionOf({ category: 'furniture', amount: 300 }, l.settings)).toBe('none');
  });

  it('still deducts everything else on top of the flat rate', () => {
    const l = ledger({ furnishing: 'flat' }, [cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 200 })], rents);
    expect(computeTax(l, 2025, today).netIncome).toBe(2560);
  });
});

describe('rent below the usual', () => {
  const rented = [paid('2025-01', 1000)];

  it('refuses loan interest altogether', () => {
    const l = ledger({ belowMarketRent: true }, [cost({ category: 'loan_interest', date: '2025-03-01', amount: 500 })], rented);
    const t = computeTax(l, 2025, today);
    expect(t.deductibleCosts).toBe(0);
    expect(t.nonDeductibleCosts).toBe(500);
    expect(deductionOf({ category: 'loan_interest', amount: 500 }, l.settings)).toBe('none');
    expect(deductionOf({ category: 'loan_interest', amount: 500 }, defaultSettings)).toBe('interest');
  });

  it('deducts costs only up to the rent, and never makes a loss', () => {
    const l = ledger({ belowMarketRent: true }, [cost({ category: 'maintenance_charge', date: '2025-03-01', amount: 1500 })], rented);
    const t = computeTax(l, 2025, today);
    expect(t.deductibleCosts).toBe(1500);
    expect(t.limitAdjustment).toBe(500);
    expect(t.netIncome).toBe(0);
    expect(t.deficitCredit).toBe(0);
    expect(deductionsOf(t)).toBe(1000);
  });

  it("follows vero.fi's example: 4 800 € rent, 6 000 € costs and 5 600 € depreciation leave nothing to tax", () => {
    const l = ledger(
      { ...property, purchasePrice: 140000, belowMarketRent: true },
      [cost({ category: 'maintenance_charge', date: '2025-03-01', amount: 6000 })],
      [paid('2025-01', 4800)],
    );
    const t = computeTax(l, 2025, today);
    expect(t.depreciation).toBe(5600);
    expect(t.limitAdjustment).toBe(6800);
    expect(t.netIncome).toBe(0);
  });

  it('keeps an owner’s part from turning into a loss through rounding', () => {
    const l = ledger({ belowMarketRent: true }, [cost({ category: 'maintenance_charge', date: '2025-03-01', amount: 1500.01 })], [paid('2025-01', 1000.01)]);
    const s = ownerShare(computeTax(l, 2025, today), 33.33);
    expect(s.netIncome).toBe(0);
  });

  it('changes nothing when the rent is the usual', () => {
    const l = ledger({}, [cost({ category: 'maintenance_charge', date: '2025-03-01', amount: 1500 })], rented);
    const t = computeTax(l, 2025, today);
    expect(t.limitAdjustment).toBe(0);
    expect(t.netIncome).toBe(-500);
  });
});

describe('a home that is only partly let', () => {
  const costs = [
    cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 1000 }),
    cost({ category: 'loan_interest', date: '2025-02-01', amount: 400 }),
    cost({ category: 'brokerage', date: '2025-02-01', amount: 100 }),
    cost({ category: 'repairs', date: '2025-02-01', amount: 200 }),
  ];

  it('deducts the let share of the costs of the whole home, and the direct costs in full', () => {
    const t = computeTax(ledger({ letSharePct: 50 }, costs), 2025, today);
    expect(t.lines.map((l) => [l.category, l.amount])).toEqual([
      ['maintenance_charge', 500],
      ['repairs', 200],
      ['loan_interest', 200],
      ['brokerage', 100],
    ]);
    expect(t.deductibleCosts).toBe(1000);
  });

  it('deducts everything when the whole home is let', () => {
    expect(computeTax(ledger({}, costs), 2025, today).deductibleCosts).toBe(1700);
  });
});

describe('a rental loss', () => {
  const lossy = (loss: number) => ledger({}, [cost({ category: 'repairs', date: '2025-02-01', amount: 1000 + loss })], [paid('2025-01', 1000)]);

  it('earns a deficit credit of 30 % of the loss', () => {
    const t = computeTax(lossy(1850), 2025, today);
    expect(t.netIncome).toBe(-1850);
    expect(t.estimatedTax).toBe(0);
    expect(t.deficitCredit).toBe(555);
  });

  it('is capped at 1 400 €', () => {
    expect(computeTax(lossy(10000), 2025, today).deficitCredit).toBe(1400);
    expect(computeTax(lossy(4666), 2025, today).deficitCredit).toBe(1399.8);
  });

  it('earns no credit when there is a profit', () => {
    expect(computeTax(ledger({}, [], [paid('2025-01', 500)]), 2025, today).deficitCredit).toBe(0);
  });

  it("is worked out on an owner's own share", () => {
    expect(ownerShare(computeTax(lossy(1850), 2025, today), 50).deficitCredit).toBe(277.5);
  });

  it('is worked out on all apartments together, so a profit elsewhere cancels it', () => {
    const base = { rentIncome: 0, deductibleCosts: 0, depreciation: 0 };
    expect(portfolioTotals([{ ...base, netIncome: -2000 }]).deficitCredit).toBe(600);
    expect(portfolioTotals([{ ...base, netIncome: -2000 }, { ...base, netIncome: 5000 }]).deficitCredit).toBe(0);
  });
});

describe('tax by year', () => {
  it('applies the rates of the year', () => {
    expect(estimateCapitalTax(40000, 2025)).toBe(12400);
    expect(estimateCapitalTax(40000, 2026)).toBe(12400);
  });
});

describe('a trip in one’s own car', () => {
  it('is deducted at the rate per kilometre of the year', () => {
    expect(mileageAmount(120, 2025)).toBe(32.4);
    expect(mileageAmount(333, 2026)).toBe(89.91);
  });
});
