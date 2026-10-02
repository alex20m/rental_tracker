import { CATEGORIES } from './types';
import type { CostCategory, DB } from './types';

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

export interface TaxResult {
  year: number;
  rentIncome: number;
  paidMonths: number;
  vacantMonths: number;
  unpaidMonths: number;
  unloggedMonths: number;
  lines: TaxLine[];
  deductibleCosts: number;
  nonDeductibleCosts: number;
  depreciation: number;
  netIncome: number;
  estimatedTax: number;
  costsWithoutReceipt: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function estimateCapitalTax(net: number): number {
  if (net <= 0) return 0;
  const low = Math.min(net, CAPITAL_TAX_LIMIT) * CAPITAL_TAX_LOW;
  const high = Math.max(net - CAPITAL_TAX_LIMIT, 0) * CAPITAL_TAX_HIGH;
  return round2(low + high);
}

/** Depreciation (poisto) — reducing-balance on the building part of the acquisition cost. */
export function computeDepreciation(db: DB): number {
  const s = db.settings;
  if (!s.useDepreciation || s.purchasePrice <= 0) return 0;
  const base = (s.purchasePrice * s.buildingSharePct) / 100;
  const remaining = Math.max(base - s.depreciationPrior, 0);
  return round2(remaining * (s.depreciationRate / 100));
}

export function computeTax(db: DB, year: number): TaxResult {
  const y = String(year);

  // Rent is taxed when received (cash basis) → use receivedDate's year.
  const rentsInYear = db.rents.filter((r) => r.status === 'paid' && r.receivedDate.startsWith(y));
  const rentIncome = round2(rentsInYear.reduce((a, r) => a + r.amount, 0));

  // Month bookkeeping uses the month the rent is for.
  const monthRows = db.rents.filter((r) => r.month.startsWith(y));
  const paidMonths = monthRows.filter((r) => r.status === 'paid').length;
  const vacantMonths = monthRows.filter((r) => r.status === 'vacant').length;
  const unpaidMonths = monthRows.filter((r) => r.status === 'unpaid').length;

  // Only count "unlogged" months up to today for the current year.
  const now = new Date();
  const lastMonth = year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0;
  const logged = new Set(monthRows.map((r) => r.month));
  let unloggedMonths = 0;
  for (let m = 1; m <= lastMonth; m++) {
    if (!logged.has(`${y}-${String(m).padStart(2, '0')}`)) unloggedMonths++;
  }

  const costsInYear = db.costs.filter((c) => c.date.startsWith(y));
  const lines: TaxLine[] = (Object.keys(CATEGORIES) as CostCategory[])
    .map((cat) => ({
      category: cat,
      label: CATEGORIES[cat].label,
      fi: CATEGORIES[cat].fi,
      deductible: CATEGORIES[cat].deductible,
      amount: round2(costsInYear.filter((c) => c.category === cat).reduce((a, c) => a + c.amount, 0)),
    }))
    .filter((l) => l.amount !== 0);

  const deductibleCosts = round2(lines.filter((l) => l.deductible).reduce((a, l) => a + l.amount, 0));
  const nonDeductibleCosts = round2(lines.filter((l) => !l.deductible).reduce((a, l) => a + l.amount, 0));
  const depreciation = computeDepreciation(db);
  const netIncome = round2(rentIncome - deductibleCosts - depreciation);

  return {
    year,
    rentIncome,
    paidMonths,
    vacantMonths,
    unpaidMonths,
    unloggedMonths,
    lines,
    deductibleCosts,
    nonDeductibleCosts,
    depreciation,
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome),
    costsWithoutReceipt: costsInYear.filter((c) => !c.hasReceipt).length,
  };
}

export const eur = (n: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
