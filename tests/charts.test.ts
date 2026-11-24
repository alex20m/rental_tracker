import { describe, expect, it } from 'vitest';
import { columnChart, cumulativeChart, inOutChart } from '@/lib/ui/charts';
import type { CashMonth, InvestmentYear } from '@/lib/domain/investment';

const year = (over: Partial<InvestmentYear> = {}): InvestmentYear => ({
  year: 2025,
  taxableIncome: 0,
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
  it('puts the rent in, and the costs, improvements included, the tax and the repayment out, on one scale', () => {
    // 10 000 in; 2 000 + 3 000 of costs, 1 000 of tax and 2 000 repaid out: 8 000.
    const chart = inOutChart(
      year({ rentIncome: 10000, runningCosts: 2000, investments: 3000, profitBeforeTax: 5000, tax: 1000, profitAfterTax: 4000, amortization: 2000 }),
    );
    expect(chart).toEqual({
      in: { total: 10000, segments: [{ key: 'rent', value: 10000, width: 100 }] },
      out: {
        total: 8000,
        segments: [
          { key: 'costs', value: 5000, width: 50 },
          { key: 'tax', value: 1000, width: 10 },
          { key: 'amortization', value: 2000, width: 20 },
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

const month = (m: number, cumulative: number): CashMonth => ({
  month: m,
  rentIn: 0,
  costsOut: 0,
  taxOut: 0,
  amortization: 0,
  net: 0,
  cumulative,
});

describe('the account through the year', () => {
  it('starts at zero on the first of January and steps to each month’s end, on a scale with zero on it', () => {
    // From −1 000 to 3 000: zero a quarter of the way up, which is 75 % down from the top.
    const chart = cumulativeChart([month(1, 1000), month(2, 3000), month(3, -1000)]);
    expect(chart.zero).toBe(75);
    expect(chart.points).toEqual([
      { x: 0, y: 75 },
      { x: expect.closeTo(8.333, 3), y: 50 },
      { x: expect.closeTo(16.667, 3), y: 0 },
      { x: 25, y: 100 },
    ]);
    expect(chart.line).toBe('M0 75L8.333 50L16.667 0L25 100');
    expect(chart.area).toBe('M0 75L8.333 50L16.667 0L25 100L25 75Z');
  });

  it('lays a year of nothing flat on the zero line', () => {
    const chart = cumulativeChart([month(1, 0), month(2, 0)]);
    expect(chart.zero).toBe(100);
    expect(chart.line).toBe('M0 100L8.333 100L16.667 100');
  });
});

describe('a column chart', () => {
  it('stands a positive value on the zero line and hangs a negative one below it, on one scale', () => {
    // From −1 000 to 3 000: zero a quarter of the way up.
    expect(columnChart([3000, -1000])).toEqual({
      zero: 25,
      bars: [
        { bottom: 25, height: 75, down: false },
        { bottom: 0, height: 25, down: true },
      ],
    });
  });

  it('has no height to share out when every value is zero', () => {
    expect(columnChart([0])).toEqual({ zero: 0, bars: [{ bottom: 0, height: 0, down: false }] });
  });
});
