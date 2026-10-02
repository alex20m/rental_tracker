import { CATEGORIES, COST_CATEGORIES } from './types';
import type { CostCategory, Ledger } from './types';

export const CAPITAL_TAX_LOW = 0.3; // up to 30 000 EUR of capital income
export const CAPITAL_TAX_HIGH = 0.34; // above 30 000 EUR
export const CAPITAL_TAX_LIMIT = 30000;

export interface TaxLine {
  category: CostCategory;
  label: string;
  fi: string;
  deductible: boolean;
  amount: number;
}

/** The figures that are money, as opposed to bookkeeping counts. */
export interface TaxFigures {
  rentIncome: number;
  lines: TaxLine[];
  deductibleCosts: number;
  nonDeductibleCosts: number;
  depreciation: number;
  netIncome: number;
  estimatedTax: number;
}

/** One apartment, one year, the whole apartment (every owner together). */
export interface TaxResult extends TaxFigures {
  year: number;
  paidMonths: number;
  vacantMonths: number;
  unpaidMonths: number;
  unloggedMonths: number;
  costsWithoutReceipt: number;
}

/** One owner's part of a TaxResult. */
export interface OwnerShare extends TaxFigures {
  sharePct: number;
}

export interface PortfolioTotals {
  rentIncome: number;
  deductibleCosts: number;
  depreciation: number;
  netIncome: number;
  estimatedTax: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function estimateCapitalTax(net: number): number {
  if (net <= 0) return 0;
  const low = Math.min(net, CAPITAL_TAX_LIMIT) * CAPITAL_TAX_LOW;
  const high = Math.max(net - CAPITAL_TAX_LIMIT, 0) * CAPITAL_TAX_HIGH;
  return round2(low + high);
}

/** Depreciation (poisto) — reducing-balance on the building part of the acquisition cost. */
export function computeDepreciation(ledger: Pick<Ledger, 'settings'>): number {
  const s = ledger.settings;
  if (!s.useDepreciation || s.purchasePrice <= 0) return 0;
  const base = (s.purchasePrice * s.buildingSharePct) / 100;
  const remaining = Math.max(base - s.depreciationPrior, 0);
  return round2(remaining * (s.depreciationRate / 100));
}

export function computeTax(ledger: Ledger, year: number, today: Date = new Date()): TaxResult {
  const y = String(year);

  // Rent is taxed when received (cash basis) → use receivedDate's year.
  const rentsInYear = ledger.rents.filter((r) => r.status === 'paid' && r.receivedDate.startsWith(y));
  const rentIncome = round2(rentsInYear.reduce((a, r) => a + r.amount, 0));

  // Month bookkeeping uses the month the rent is for.
  const monthRows = ledger.rents.filter((r) => r.month.startsWith(y));
  const paidMonths = monthRows.filter((r) => r.status === 'paid').length;
  const vacantMonths = monthRows.filter((r) => r.status === 'vacant').length;
  const unpaidMonths = monthRows.filter((r) => r.status === 'unpaid').length;

  // Only count "unlogged" months up to today for the current year.
  const thisYear = today.getFullYear();
  const lastMonth = year < thisYear ? 12 : year === thisYear ? today.getMonth() + 1 : 0;
  const logged = new Set(monthRows.map((r) => r.month));
  let unloggedMonths = 0;
  for (let m = 1; m <= lastMonth; m++) {
    if (!logged.has(`${y}-${String(m).padStart(2, '0')}`)) unloggedMonths++;
  }

  const costsInYear = ledger.costs.filter((c) => c.date.startsWith(y));
  const lines: TaxLine[] = COST_CATEGORIES.map((cat) => ({
    category: cat,
    label: CATEGORIES[cat].label,
    fi: CATEGORIES[cat].fi,
    deductible: CATEGORIES[cat].deductible,
    amount: round2(costsInYear.filter((c) => c.category === cat).reduce((a, c) => a + c.amount, 0)),
  })).filter((l) => l.amount !== 0);

  const figures = figuresFrom(rentIncome, lines, computeDepreciation(ledger));

  return {
    year,
    paidMonths,
    vacantMonths,
    unpaidMonths,
    unloggedMonths,
    costsWithoutReceipt: costsInYear.filter((c) => !c.hasReceipt).length,
    ...figures,
  };
}

/**
 * Co-owners each declare their own part of the apartment's income and
 * expenses, in proportion to what they own. Every figure is scaled and rounded
 * to the cent first, and the totals are then summed from the rounded parts, so
 * the owner's declaration adds up line by line.
 */
export function ownerShare(t: TaxFigures, sharePct: number): OwnerShare {
  const part = (n: number) => round2((n * sharePct) / 100);
  const lines = t.lines.map((l) => ({ ...l, amount: part(l.amount) }));
  return { sharePct, ...figuresFrom(part(t.rentIncome), lines, part(t.depreciation)) };
}

/**
 * The owner's whole portfolio for a year. Capital income tax is progressive
 * over the person's total, so it is estimated on the summed net — a loss on one
 * apartment offsets a profit on another.
 */
export function portfolioTotals(
  shares: Pick<TaxFigures, 'rentIncome' | 'deductibleCosts' | 'depreciation' | 'netIncome'>[],
): PortfolioTotals {
  const sum = (pick: (s: (typeof shares)[number]) => number) => round2(shares.reduce((a, s) => a + pick(s), 0));
  const netIncome = sum((s) => s.netIncome);
  return {
    rentIncome: sum((s) => s.rentIncome),
    deductibleCosts: sum((s) => s.deductibleCosts),
    depreciation: sum((s) => s.depreciation),
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome),
  };
}

function figuresFrom(rentIncome: number, lines: TaxLine[], depreciation: number): TaxFigures {
  const deductibleCosts = round2(lines.filter((l) => l.deductible).reduce((a, l) => a + l.amount, 0));
  const nonDeductibleCosts = round2(lines.filter((l) => !l.deductible).reduce((a, l) => a + l.amount, 0));
  const netIncome = round2(rentIncome - deductibleCosts - depreciation);
  return {
    rentIncome,
    lines,
    deductibleCosts,
    nonDeductibleCosts,
    depreciation,
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome),
  };
}

export const eur = (n: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);

export const pct = (n: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n)} %`;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
