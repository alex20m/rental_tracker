import { describe, expect, it } from 'vitest';
import { computeTax, estimateCapitalTax, ownerShare, portfolioTotals } from '@/lib/domain/tax';
import { defaultSettings, type Ledger } from '@/lib/domain/types';

const ledger: Ledger = {
  settings: { ...defaultSettings, purchasePrice: 100000, useDepreciation: true, depreciationPrior: 10000 },
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
