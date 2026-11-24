import type { InvestmentYear } from '@/lib/domain/investment';

/**
 * Where the investment page's bars go, as percentages of their chart, so the
 * page only has to set `left`/`width` or `bottom`/`height`. Pure arithmetic,
 * tested on its own: a bar in the wrong place is a wrong number told in a
 * picture.
 */

/** A scale from the lowest value to the highest, zero always on it; a flat one when they are all zero. */
function scale(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  return (v: number) => ((v - lo) / span) * 100;
}

/** How a step is drawn: money in (green), money out (yellow), the loan (grey) or a result (ink). */
export type FlowKind = 'in' | 'out' | 'quiet' | 'total';

export type FlowKey = 'rent' | 'running' | 'investments' | 'beforeTax' | 'tax' | 'afterTax' | 'amortization' | 'cash';

export interface FlowStep {
  key: FlowKey;
  /** What the step adds (negative: takes away), or the result it shows. */
  value: number;
  from: number;
  to: number;
  kind: FlowKind;
  /** The bar's place on the chart, in percent of its width. */
  left: number;
  width: number;
}

/**
 * The year as a bridge: the rent, then each cost stepping down from it, the
 * profit before tax standing on zero, the tax stepping on from it, the profit
 * after tax standing on zero, the loan repayment stepping on from it,
 * and what was left on the account standing on zero.
 */
export function flowChart(y: InvestmentYear): { zero: number; steps: FlowStep[] } {
  const raw: Omit<FlowStep, 'left' | 'width'>[] = [];
  const add = (key: FlowKey, from: number, to: number, kind: FlowKind) => raw.push({ key, value: to - from, from, to, kind });

  add('rent', 0, y.rentIncome, 'in');
  add('running', y.rentIncome, y.rentIncome - y.runningCosts, 'out');
  if (y.investments !== 0) add('investments', y.rentIncome - y.runningCosts, y.profitBeforeTax, 'out');
  add('beforeTax', 0, y.profitBeforeTax, 'total');
  add('tax', y.profitBeforeTax, y.profitAfterTax, y.tax < 0 ? 'in' : 'out');
  add('afterTax', 0, y.profitAfterTax, 'total');
  add('amortization', y.profitAfterTax, y.cashFlow, 'quiet');
  add('cash', 0, y.cashFlow, 'total');

  const at = scale(raw.flatMap((s) => [s.from, s.to]));
  return {
    zero: at(0),
    steps: raw.map((s) => ({ ...s, left: at(Math.min(s.from, s.to)), width: at(Math.max(s.from, s.to)) - at(Math.min(s.from, s.to)) })),
  };
}

/** A bar of a column chart, in percent of its height. */
export interface Column {
  bottom: number;
  height: number;
  /** Below the zero line: its rounded end is at the bottom. */
  down: boolean;
}

/** Each year's profit after tax and what was left on the account, side by side on one scale. */
export function columnChart(years: InvestmentYear[]): {
  zero: number;
  columns: { year: number; profit: Column; cash: Column }[];
} {
  const at = scale(years.flatMap((y) => [y.profitAfterTax, y.cashFlow]));
  const bar = (v: number): Column => ({ bottom: at(Math.min(0, v)), height: at(Math.max(0, v)) - at(Math.min(0, v)), down: v < 0 });
  return {
    zero: at(0),
    columns: years.map((y) => ({ year: y.year, profit: bar(y.profitAfterTax), cash: bar(y.cashFlow) })),
  };
}
