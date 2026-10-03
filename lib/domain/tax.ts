import { CATEGORIES, COST_CATEGORIES } from './types';
import type { ApartmentSettings, CostCategory, CostEntry, Ledger } from './types';

export const CAPITAL_TAX_LOW = 0.3; // up to 30 000 EUR of capital income
export const CAPITAL_TAX_HIGH = 0.34; // above 30 000 EUR
export const CAPITAL_TAX_LIMIT = 30000;

/** A basic improvement is spread over at most ten years (vero.fi). */
export const IMPROVEMENT_YEARS = 10;
/** Furniture and appliances up to this price are deducted at once (vero.fi). */
export const FURNITURE_LIMIT = 1200;
/** Dearer furniture is depreciated by at most 25 % of its remaining value a year (vero.fi). */
export const FURNITURE_RATE = 0.25;

export interface TaxLine {
  category: CostCategory;
  label: string;
  fi: string;
  deductible: boolean;
  amount: number;
}

export type DepreciationKind = 'building' | 'improvements' | 'furniture';

export interface DepreciationLine {
  kind: DepreciationKind;
  amount: number;
}

/** The figures that are money, as opposed to bookkeeping counts. */
export interface TaxFigures {
  rentIncome: number;
  /** Costs paid this year that are deducted (or refused) as a whole, by category. */
  lines: TaxLine[];
  deductibleCosts: number;
  nonDeductibleCosts: number;
  /** This year's part of costs deducted over several years, by kind; zero kinds left out. */
  depreciationLines: DepreciationLine[];
  /** The sum of `depreciationLines`. */
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

/**
 * Building depreciation (poisto) — reducing-balance on the building part of the
 * acquisition cost. Only for a property of one's own: the price of a share in a
 * housing company is never depreciated, it is deducted when the share is sold.
 */
export function computeDepreciation(ledger: Pick<Ledger, 'settings'>): number {
  const s = ledger.settings;
  if (s.propertyType !== 'property' || !s.useDepreciation || s.purchasePrice <= 0) return 0;
  const base = (s.purchasePrice * s.buildingSharePct) / 100;
  const remaining = Math.max(base - s.depreciationPrior, 0);
  return round2(remaining * (s.depreciationRate / 100));
}

export type CostDeduction = 'expense' | 'none' | 'improvement' | 'furniture' | 'interest';

/** How one logged cost is deducted for this apartment. */
export function deductionOf(
  cost: Pick<CostEntry, 'category' | 'amount' | 'spreadYears'>,
  settings: Pick<ApartmentSettings, 'financingChargeDeductible'>,
): CostDeduction {
  switch (CATEGORIES[cost.category].treatment) {
    case 'financing':
      return settings.financingChargeDeductible ? 'expense' : 'none';
    case 'furniture':
      return cost.amount <= FURNITURE_LIMIT || cost.spreadYears === 1 ? 'expense' : 'furniture';
    case 'improvement':
      return 'improvement';
    case 'interest':
      return 'interest';
    default:
      return 'expense';
  }
}

/** The years an improvement is spread over, within the 1–10 the law allows. */
export const improvementYears = (c: Pick<CostEntry, 'spreadYears'>) =>
  Math.min(Math.max(Math.round(c.spreadYears ?? IMPROVEMENT_YEARS), 1), IMPROVEMENT_YEARS);

/**
 * The part of a basic improvement deducted in `year`: equal parts from the year
 * it was paid, the last part taking the rounding so the parts add up exactly.
 */
export function improvementPart(c: Pick<CostEntry, 'date' | 'amount' | 'spreadYears'>, year: number): number {
  const n = improvementYears(c);
  const k = year - Number(c.date.slice(0, 4));
  if (k < 0 || k >= n) return 0;
  const part = round2(c.amount / n);
  return k === n - 1 ? round2(c.amount - part * (n - 1)) : part;
}

/** The part of a dear piece of furniture deducted in `year`: 25 % of what is left of it. */
export function furniturePart(c: Pick<CostEntry, 'date' | 'amount'>, year: number): number {
  const k = year - Number(c.date.slice(0, 4));
  if (k < 0) return 0;
  return round2(c.amount * FURNITURE_RATE * (1 - FURNITURE_RATE) ** k);
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
  // Months before the first log ever made (the apartment may have been bought
  // mid-year) are not missing, and with no log at all there is nothing to warn about.
  const firstLog = ledger.rents.map((r) => r.month).sort()[0];
  const firstMonth = !firstLog || firstLog > `${y}-12` ? 13 : firstLog < `${y}-01` ? 1 : Number(firstLog.slice(5, 7));
  let unloggedMonths = 0;
  for (let m = firstMonth; m <= lastMonth; m++) {
    if (!logged.has(`${y}-${String(m).padStart(2, '0')}`)) unloggedMonths++;
  }

  const s = ledger.settings;
  const costsInYear = ledger.costs.filter((c) => c.date.startsWith(y));
  // Costs deducted (or refused) as a whole this year; spread ones are depreciation.
  const wholeCosts = costsInYear.filter((c) => {
    const d = deductionOf(c, s);
    return d === 'expense' || d === 'none' || d === 'interest';
  });
  const lines: TaxLine[] = COST_CATEGORIES.map((cat) => {
    const ofCat = wholeCosts.filter((c) => c.category === cat);
    return {
      category: cat,
      label: CATEGORIES[cat].label,
      fi: CATEGORIES[cat].fi,
      deductible: ofCat.every((c) => deductionOf(c, s) !== 'none'),
      amount: round2(ofCat.reduce((a, c) => a + c.amount, 0)),
    };
  }).filter((l) => l.amount !== 0);

  const sumOf = (kind: CostDeduction, part: (c: CostEntry) => number) =>
    round2(ledger.costs.filter((c) => deductionOf(c, s) === kind).reduce((a, c) => a + part(c), 0));
  const depreciationLines = depreciationFrom({
    building: computeDepreciation(ledger),
    improvements: sumOf('improvement', (c) => improvementPart(c, year)),
    furniture: sumOf('furniture', (c) => furniturePart(c, year)),
  });

  const figures = figuresFrom(rentIncome, lines, depreciationLines);

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
  // Kept line for line, like `lines`, so each of the apartment's lines has the owner's part beside it.
  const depreciation = t.depreciationLines.map((d) => ({ ...d, amount: part(d.amount) }));
  return { sharePct, ...figuresFrom(part(t.rentIncome), lines, depreciation) };
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

function depreciationFrom(parts: Record<DepreciationKind, number>): DepreciationLine[] {
  return (Object.keys(parts) as DepreciationKind[])
    .map((kind) => ({ kind, amount: parts[kind] }))
    .filter((d) => d.amount !== 0);
}

function figuresFrom(rentIncome: number, lines: TaxLine[], depreciationLines: DepreciationLine[]): TaxFigures {
  const depreciation = round2(depreciationLines.reduce((a, d) => a + d.amount, 0));
  const deductibleCosts = round2(lines.filter((l) => l.deductible).reduce((a, l) => a + l.amount, 0));
  const nonDeductibleCosts = round2(lines.filter((l) => !l.deductible).reduce((a, l) => a + l.amount, 0));
  const netIncome = round2(rentIncome - deductibleCosts - depreciation);
  return {
    rentIncome,
    lines,
    deductibleCosts,
    nonDeductibleCosts,
    depreciationLines,
    depreciation,
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome),
  };
}

export const eur = (n: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);

export const pct = (n: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n)} %`;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
