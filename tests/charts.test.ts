import { describe, expect, it } from 'vitest';
import { inOutChart, profitChart } from '@/lib/ui/charts';
import type { InvestmentYear } from '@/lib/domain/investment';

const year = (over: Partial<InvestmentYear> = {}): InvestmentYear => ({
  year: 2025,
  rentIncome: 0,
  runningCosts: 0,
  investments: 0,
  profitBeforeTax: 0,
  tax: 0,
  profitAfterTax: 0,
  amortization: 0,
  cashFlow: 0,
  loanBalance: null,
  ...over,
});

describe('money in against money out', () => {
  it('puts the rent in, and the costs, improvements included, and the tax out, on one scale', () => {
    // 10 000 in; 2 000 + 3 000 of costs and 1 000 of tax out: 6 000, so out is 60 % of in.
    const chart = inOutChart(
      year({ rentIncome: 10000, runningCosts: 2000, investments: 3000, profitBeforeTax: 5000, tax: 1000, profitAfterTax: 4000 }),
    );
    expect(chart).toEqual({
      in: { total: 10000, segments: [{ key: 'rent', value: 10000, width: 100 }] },
      out: {
        total: 6000,
        segments: [
          { key: 'costs', value: 5000, width: 50 },
          { key: 'tax', value: 1000, width: 10 },
        ],
      },
    });
  });

  it('counts a deficit credit as money in, beside the rent, and lets the longer side set the scale', () => {
    const chart = inOutChart(year({ rentIncome: 1000, runningCosts: 3000, profitBeforeTax: -2000, tax: -600, profitAfterTax: -1400 }));
    expect(chart.in).toEqual({
      total: 1600,
      segments: [
        { key: 'rent', value: 1000, width: expect.closeTo(33.33, 2) },
        { key: 'credit', value: 600, width: 20 },
      ],
    });
    expect(chart.out).toEqual({ total: 3000, segments: [{ key: 'costs', value: 3000, width: 100 }] });
  });

  it('draws nothing, and divides by nothing, in a year with nothing in it', () => {
    expect(inOutChart(year())).toEqual({ in: { total: 0, segments: [] }, out: { total: 0, segments: [] } });
  });
});

describe('the profit of each year', () => {
  it('stands a profit on the zero line and hangs a loss below it, on one scale', () => {
    const chart = profitChart([year({ year: 2024, profitAfterTax: 3000 }), year({ year: 2025, profitAfterTax: -1000 })]);
    // From −1 000 to 3 000: zero a quarter of the way up.
    expect(chart).toEqual({
      zero: 25,
      columns: [
        { year: 2024, value: 3000, bottom: 25, height: 75, down: false },
        { year: 2025, value: -1000, bottom: 0, height: 25, down: true },
      ],
    });
  });

  it('has no height to share out when every year is zero', () => {
    expect(profitChart([year()])).toEqual({ zero: 0, columns: [{ year: 2025, value: 0, bottom: 0, height: 0, down: false }] });
  });
});
