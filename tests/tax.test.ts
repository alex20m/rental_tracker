import { describe, expect, it } from 'vitest';
import { computeDepreciation, computeTax, estimateCapitalTax, ownerShare, portfolioTotals } from '@/lib/domain/tax';
import { defaultSettings, type CostEntry, type Ledger } from '@/lib/domain/types';

const ledger: Ledger = {
  // A property of one's own (kiinteistö): the only kind whose building is depreciated.
  settings: {
    ...defaultSettings,
    propertyType: 'property',
    purchasePrice: 100000,
    useDepreciation: true,
    depreciationRate: 2.5,
    depreciationPrior: 10000,
  },
  rents: [
    { month: '2025-01', status: 'paid', amount: 700, receivedDate: '2025-01-03', note: '' },
    { month: '2025-02', status: 'vacant', amount: 0, receivedDate: '', note: '' },
    // December rent paid in January → belongs to the next tax year (cash basis)
    { month: '2025-12', status: 'paid', amount: 700, receivedDate: '2026-01-02', note: '' },
  ],
  costs: [
    { id: 'a', date: '2025-03-01', category: 'maintenance_charge', description: '', amount: 200, hasReceipt: true },
    { id: 'b', date: '2025-03-01', category: 'financing_charge', description: '', amount: 150, hasReceipt: false },
    { id: 'c', date: '2025-06-01', category: 'repairs', description: '', amount: 100, hasReceipt: false },
  ],
};

const afterYearEnd = new Date('2026-06-15T12:00:00Z');

describe('capital income tax estimate', () => {
  it('is zero for a loss', () => {
    expect(estimateCapitalTax(-500)).toBe(0);
  });

  it('is 30% up to 30 000 €', () => {
    expect(estimateCapitalTax(10000)).toBe(3000);
    expect(estimateCapitalTax(30000)).toBe(9000);
  });

  it('is 34% on the part above 30 000 €', () => {
    expect(estimateCapitalTax(40000)).toBe(12400);
  });
});

describe('one apartment for one year', () => {
  const t = computeTax(ledger, 2025, afterYearEnd);

  it('counts rent in the year it was received, not the month it was for', () => {
    expect(t.rentIncome).toBe(700);
    expect(computeTax(ledger, 2026, afterYearEnd).rentIncome).toBe(700);
  });

  it('keeps the financing charge out of deductible costs', () => {
    expect(t.deductibleCosts).toBe(300);
    expect(t.nonDeductibleCosts).toBe(150);
  });

  it('depreciates the remaining building cost at the configured rate', () => {
    // (100000 × 100% − 10000) × 2.5%
    expect(t.depreciation).toBe(2250);
  });

  it('nets income against deductible costs and depreciation', () => {
    expect(t.netIncome).toBe(-1850);
    expect(t.estimatedTax).toBe(0);
  });

  it('counts months and receipts', () => {
    expect(t.paidMonths).toBe(2);
    expect(t.vacantMonths).toBe(1);
    expect(t.costsWithoutReceipt).toBe(2);
  });

  it('counts unlogged months of a past year across all twelve', () => {
    expect(t.unloggedMonths).toBe(9);
  });

  it('counts unlogged months of the current year only up to today', () => {
    // March 2025: January and February are logged, March is not yet.
    const t2 = computeTax(ledger, 2025, new Date('2025-03-20T12:00:00Z'));
    expect(t2.unloggedMonths).toBe(1);
  });

  it('counts no unlogged months for a future year', () => {
    expect(computeTax(ledger, 2027, afterYearEnd).unloggedMonths).toBe(0);
  });

  describe('before the first log', () => {
    const bought = (months: string[]): Ledger => ({
      ...ledger,
      rents: months.map((month) => ({ month, status: 'paid', amount: 700, receivedDate: `${month}-03`, note: '' })),
    });
    const oct2026 = new Date('2026-10-03T12:00:00Z');

    it('warns about nothing when no month has been logged at all', () => {
      expect(computeTax(bought([]), 2026, oct2026).unloggedMonths).toBe(0);
    });

    it('does not warn about months before the first log in the same year', () => {
      // First log October, today is October → nothing missing; not 9 (Jan–Sep).
      expect(computeTax(bought(['2026-10']), 2026, oct2026).unloggedMonths).toBe(0);
    });

    it('warns only about gaps after the first log', () => {
      // First log July: August and September are missing, July and October are logged.
      expect(computeTax(bought(['2026-07', '2026-10']), 2026, oct2026).unloggedMonths).toBe(2);
    });

    it('does not warn about a year before the first log', () => {
      expect(computeTax(bought(['2026-10']), 2025, oct2026).unloggedMonths).toBe(0);
    });

    it('counts a full year once the first log is in an earlier year', () => {
      expect(computeTax(bought(['2025-11']), 2026, new Date('2026-03-10T12:00:00Z')).unloggedMonths).toBe(3);
    });
  });
});

describe("an owner's share of an apartment", () => {
  const t = computeTax(ledger, 2025, afterYearEnd);

  it('is the whole result at 100%', () => {
    const s = ownerShare(t, 100);
    expect(s.rentIncome).toBe(700);
    expect(s.deductibleCosts).toBe(300);
    expect(s.depreciation).toBe(2250);
    expect(s.netIncome).toBe(-1850);
  });

  it('splits income, costs and depreciation by the ownership percentage', () => {
    const s = ownerShare(t, 50);
    expect(s.sharePct).toBe(50);
    expect(s.rentIncome).toBe(350);
    expect(s.deductibleCosts).toBe(150);
    expect(s.nonDeductibleCosts).toBe(75);
    expect(s.depreciation).toBe(1125);
    expect(s.netIncome).toBe(-925);
  });

  it('splits every expense line too, so the declaration adds up', () => {
    const s = ownerShare(t, 25);
    expect(s.lines.map((l) => [l.category, l.amount])).toEqual([
      ['maintenance_charge', 50],
      ['financing_charge', 37.5],
      ['repairs', 25],
    ]);
  });

  it('rounds each figure to the cent', () => {
    const one: Ledger = {
      ...ledger,
      settings: { ...ledger.settings, useDepreciation: false },
      rents: [{ month: '2025-01', status: 'paid', amount: 1000.1, receivedDate: '2025-01-03', note: '' }],
      costs: [],
    };
    const s = ownerShare(computeTax(one, 2025, afterYearEnd), 33.33);
    expect(s.rentIncome).toBe(333.33);
    expect(s.netIncome).toBe(333.33);
  });

  it('estimates tax on the share, not on the whole apartment', () => {
    const big: Ledger = {
      settings: { ...defaultSettings },
      rents: [{ month: '2025-01', status: 'paid', amount: 40000, receivedDate: '2025-01-03', note: '' }],
      costs: [],
    };
    const s = ownerShare(computeTax(big, 2025, afterYearEnd), 50);
    // 20 000 € share stays entirely in the 30% bracket.
    expect(s.estimatedTax).toBe(6000);
  });

  it('is nothing at 0%', () => {
    const s = ownerShare(t, 0);
    expect(s.rentIncome).toBe(0);
    expect(s.netIncome).toBe(0);
    expect(s.estimatedTax).toBe(0);
  });
});

describe('building depreciation', () => {
  it('never depreciates the purchase price of a housing-company share', () => {
    // vero.fi: the price of a flat or of shares in a housing company cannot be
    // deducted as depreciation — only a building one owns can.
    const share = { settings: { ...ledger.settings, propertyType: 'share' as const } };
    expect(computeDepreciation(share)).toBe(0);
  });

  it('is 4 % of the remaining building cost by default for a property', () => {
    const settings = { ...defaultSettings, propertyType: 'property' as const, purchasePrice: 200000, buildingSharePct: 75, useDepreciation: true };
    // (200 000 × 75 %) × 4 %
    expect(computeDepreciation({ settings })).toBe(6000);
  });

  it('starts every new apartment as a housing-company share', () => {
    expect(defaultSettings.propertyType).toBe('share');
  });
});

describe('expense rules', () => {
  const cost = (c: Partial<CostEntry> & Pick<CostEntry, 'category' | 'amount' | 'date'>): CostEntry => ({
    id: `${c.category}-${c.date}-${c.amount}`,
    description: '',
    hasReceipt: true,
    ...c,
  });
  const withCosts = (costs: CostEntry[], settings: Partial<Ledger['settings']> = {}): Ledger => ({
    settings: { ...defaultSettings, ...settings },
    rents: [],
    costs,
  });
  const depr = (l: Ledger, year: number, kind: string) =>
    computeTax(l, year, afterYearEnd).depreciationLines.find((d) => d.kind === kind)?.amount ?? 0;

  it('deducts the financing charge when the housing company books it as income', () => {
    const l = withCosts([cost({ category: 'financing_charge', date: '2025-02-01', amount: 150 })], {
      financingChargeDeductible: true,
    });
    const t = computeTax(l, 2025, afterYearEnd);
    expect(t.deductibleCosts).toBe(150);
    expect(t.nonDeductibleCosts).toBe(0);
    expect(t.lines).toEqual([expect.objectContaining({ category: 'financing_charge', deductible: true, amount: 150 })]);
  });

  it('deducts water and maintenance charges, travel and property tax in the year paid', () => {
    const l = withCosts([
      cost({ category: 'water_charge', date: '2025-01-05', amount: 40 }),
      cost({ category: 'travel', date: '2025-04-05', amount: 27 }),
      cost({ category: 'property_tax', date: '2025-09-30', amount: 310 }),
    ]);
    expect(computeTax(l, 2025, afterYearEnd).deductibleCosts).toBe(377);
  });

  it('spreads a basic improvement evenly over ten years from the year it was paid', () => {
    // vero.fi's own example: balcony glazing for 3 000 € is 300 € a year.
    const l = withCosts([cost({ category: 'improvement', date: '2025-05-01', amount: 3000 })]);
    const t = computeTax(l, 2025, afterYearEnd);
    expect(t.deductibleCosts).toBe(0);
    expect(t.lines).toEqual([]);
    expect(depr(l, 2025, 'improvements')).toBe(300);
    expect(depr(l, 2034, 'improvements')).toBe(300);
    expect(depr(l, 2035, 'improvements')).toBe(0);
    expect(depr(l, 2024, 'improvements')).toBe(0);
    expect(computeTax(l, 2025, afterYearEnd).netIncome).toBe(-300);
  });

  it('spreads an improvement over fewer years when it lasts less, and the years add up to the cost', () => {
    const l = withCosts([cost({ category: 'improvement', date: '2025-05-01', amount: 1000, spreadYears: 3 })]);
    expect([2025, 2026, 2027, 2028].map((y) => depr(l, y, 'improvements'))).toEqual([333.33, 333.33, 333.34, 0]);
  });

  it('deducts furniture costing up to 1 200 € at once', () => {
    const l = withCosts([cost({ category: 'furniture', date: '2025-03-01', amount: 1200 })]);
    const t = computeTax(l, 2025, afterYearEnd);
    expect(t.deductibleCosts).toBe(1200);
    expect(t.depreciation).toBe(0);
  });

  it('depreciates dearer furniture by 25 % of what is left each year', () => {
    const l = withCosts([cost({ category: 'furniture', date: '2025-03-01', amount: 2000 })]);
    expect(computeTax(l, 2025, afterYearEnd).deductibleCosts).toBe(0);
    expect([2024, 2025, 2026, 2027].map((y) => depr(l, y, 'furniture'))).toEqual([0, 500, 375, 281.25]);
  });

  it('deducts dearer furniture at once when it lasts under three years', () => {
    const l = withCosts([cost({ category: 'furniture', date: '2025-03-01', amount: 2000, spreadYears: 1 })]);
    expect(computeTax(l, 2025, afterYearEnd).deductibleCosts).toBe(2000);
    expect(depr(l, 2026, 'furniture')).toBe(0);
  });

  it("splits every kind of depreciation by the owner's share and adds the parts up", () => {
    const l = withCosts(
      [
        cost({ category: 'improvement', date: '2025-05-01', amount: 3000 }),
        cost({ category: 'furniture', date: '2025-03-01', amount: 2000 }),
      ],
      { propertyType: 'property', purchasePrice: 50000, useDepreciation: true },
    );
    const s = ownerShare(computeTax(l, 2025, afterYearEnd), 25);
    expect(s.depreciationLines).toEqual([
      { kind: 'building', amount: 500 },
      { kind: 'improvements', amount: 75 },
      { kind: 'furniture', amount: 125 },
    ]);
    expect(s.depreciation).toBe(700);
  });
});

describe('a portfolio of apartments', () => {
  it('applies the progressive rate to the total, not apartment by apartment', () => {
    const total = portfolioTotals([
      { rentIncome: 20000, deductibleCosts: 0, depreciation: 0, netIncome: 20000 },
      { rentIncome: 15000, deductibleCosts: 0, depreciation: 0, netIncome: 15000 },
    ]);
    expect(total.netIncome).toBe(35000);
    // 30 000 × 30% + 5 000 × 34%, not 20 000 × 30% + 15 000 × 30%.
    expect(total.estimatedTax).toBe(10700);
  });

  it("lets one apartment's loss offset another's profit", () => {
    const total = portfolioTotals([
      { rentIncome: 12000, deductibleCosts: 2000, depreciation: 0, netIncome: 10000 },
      { rentIncome: 1000, deductibleCosts: 3000, depreciation: 2000, netIncome: -4000 },
    ]);
    expect(total.rentIncome).toBe(13000);
    expect(total.deductibleCosts).toBe(5000);
    expect(total.depreciation).toBe(2000);
    expect(total.netIncome).toBe(6000);
    expect(total.estimatedTax).toBe(1800);
  });

  it('is all zeros when empty', () => {
    expect(portfolioTotals([])).toEqual({
      rentIncome: 0,
      deductibleCosts: 0,
      depreciation: 0,
      netIncome: 0,
      estimatedTax: 0,
    });
  });
});
