import { describe, expect, it } from 'vitest';
import { columnChart, flowChart } from '@/lib/ui/charts';
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

// 10 000 of rent; 2 000 of costs, 3 000 of improvements, 1 000 of tax → 4 000; 6 000 repaid → −2 000 left.
const mixed = year({
  rentIncome: 10000,
  runningCosts: 2000,
  investments: 3000,
  profitBeforeTax: 5000,
  tax: 1000,
  profitAfterTax: 4000,
  amortization: 6000,
  cashFlow: -2000,
});

describe('the flow from the rent to what is left on the account', () => {
  it('steps down from the rent through each cost, and stands each result on zero', () => {
    const { steps } = flowChart(mixed);
    expect(steps.map((s) => [s.key, s.from, s.to, s.kind, s.value])).toEqual([
      ['rent', 0, 10000, 'in', 10000],
      ['running', 10000, 8000, 'out', -2000],
      ['investments', 8000, 5000, 'out', -3000],
      ['beforeTax', 0, 5000, 'total', 5000],
      ['tax', 5000, 4000, 'out', -1000],
      ['afterTax', 0, 4000, 'total', 4000],
      ['amortization', 4000, -2000, 'quiet', -6000],
      ['cash', 0, -2000, 'total', -2000],
    ]);
  });

  it('places every bar on one scale from the lowest point to the highest, zero included', () => {
    const { steps, zero } = flowChart(mixed);
    // From −2 000 to 10 000: 12 000 wide, zero a sixth of the way in.
    expect(zero).toBeCloseTo(16.667, 2);
    expect(steps[0]).toMatchObject({ left: expect.closeTo(16.667, 2), width: expect.closeTo(83.333, 2) });
    expect(steps[6]).toMatchObject({ left: 0, width: 50 });
    expect(steps[7]).toMatchObject({ left: 0, width: expect.closeTo(16.667, 2) });
  });

  it('leaves out improvements in a year without any', () => {
    expect(flowChart(year({ rentIncome: 100, profitBeforeTax: 100 })).steps.map((s) => s.key)).not.toContain('investments');
  });

  it('draws a deficit credit as money coming in', () => {
    const tax = flowChart(year({ runningCosts: 1000, profitBeforeTax: -1000, tax: -300, profitAfterTax: -700 })).steps.find(
      (s) => s.key === 'tax',
    )!;
    expect(tax).toMatchObject({ from: -1000, to: -700, kind: 'in', value: 300 });
  });

  it('draws nothing, and divides by nothing, in a year with nothing in it', () => {
    const { steps, zero } = flowChart(year());
    expect(zero).toBe(0);
    expect(steps.every((s) => s.left === 0 && s.width === 0)).toBe(true);
  });
});

describe('the years side by side', () => {
  it('stands a profit on the zero line and hangs a loss below it, on one scale', () => {
    const chart = columnChart([
      year({ year: 2024, profitAfterTax: 3000, cashFlow: -1000 }),
      year({ year: 2025, profitAfterTax: 1000, cashFlow: 0 }),
    ]);
    // From −1 000 to 3 000: zero a quarter of the way up.
    expect(chart.zero).toBe(25);
    expect(chart.columns).toEqual([
      { year: 2024, profit: { bottom: 25, height: 75, down: false }, cash: { bottom: 0, height: 25, down: true } },
      { year: 2025, profit: { bottom: 25, height: 25, down: false }, cash: { bottom: 25, height: 0, down: false } },
    ]);
  });

  it('has no height to share out when every year is zero', () => {
    expect(columnChart([year()])).toEqual({ zero: 0, columns: [{ year: 2025, profit: { bottom: 0, height: 0, down: false }, cash: { bottom: 0, height: 0, down: false } }] });
  });
});
