import { CATEGORIES, COST_CATEGORIES } from './types';
import type { ApartmentSettings, CostCategory, CostEntry, Ledger } from './types';
import { LATEST_RULES_YEAR, rulesFor } from './taxRules';

// Every rate, limit and amount the law sets lives in ./taxRules, by tax year.
// Nothing below writes one out.

export interface TaxLine {
  category: CostCategory;
  label: string;
  fi: string;
  deductible: boolean;
  /** What is deducted: for a cost of the whole home, only the let share of it. */
  amount: number;
}

/**
 * What is deducted other than as a whole cost in the year it was paid:
 * `building` (poisto), `improvements` and `furniture` (this year's part of
 * costs deducted over several years) and `flatRate` (a furnished flat's
 * deduction per month, which takes the place of the furniture's own costs).
 */
export type DepreciationKind = 'building' | 'improvements' | 'furniture' | 'flatRate';

export interface DepreciationLine {
  kind: DepreciationKind;
  amount: number;
}

/** The figures that are money, as opposed to bookkeeping counts. */
export interface TaxFigures {
  /** The tax year; its rules decide the rates. */
  year: number;
  rentIncome: number;
  /** Costs paid this year that are deducted (or refused) as a whole, by category. */
  lines: TaxLine[];
  deductibleCosts: number;
  nonDeductibleCosts: number;
  /** This year's part of costs deducted over several years, by kind; zero kinds left out. */
  depreciationLines: DepreciationLine[];
  /** The sum of `depreciationLines`. */
  depreciation: number;
  /** Rent below the usual: the deductions may not exceed the rent. */
  rentLimited: boolean;
  /** The part of the deductions that the rent cannot take, when `rentLimited`. */
  limitAdjustment: number;
  netIncome: number;
  estimatedTax: number;
  /** The most the year's deficit gives back as a credit on tax on earned income (alijäämähyvitys), before children are counted. */
  deficitCredit: number;
}

/** One apartment, one year, the whole apartment (every owner together). */
export interface TaxResult extends TaxFigures {
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
  deficitCredit: number;
}

/**
 * Rounds to the cent, a half cent away from zero. A share or a rate of a
 * two-decimal amount often lands exactly on a half cent (25 % of 1 200,10 is
 * 300,025), which binary floating point stores a hair either side of; a plain
 * Math.round then goes the wrong way about one time in eight. Fifteen
 * significant digits is all a double holds exactly, so the noise is dropped
 * before the rounding.
 */
export const round2 = (n: number) => {
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  return cents === 0 ? 0 : (Math.sign(n) * cents) / 100;
};

const yearOf = (date: string) => Number(date.slice(0, 4));

export function estimateCapitalTax(net: number, year: number = LATEST_RULES_YEAR): number {
  if (net <= 0) return 0;
  const { lowRate, highRate, limit } = rulesFor(year).capitalIncome;
  const low = Math.min(net, limit) * lowRate;
  const high = Math.max(net - limit, 0) * highRate;
  return round2(low + high);
}

/**
 * What a deficit gives back as a credit on tax on earned income: its share at
 * the capital income rate, at most the maximum. The maximum is higher for a
 * taxpayer with minor children, which the app does not know, and the credit
 * can only take as much as that tax holds — so this is the most it can be.
 */
export function deficitCreditOf(net: number, year: number = LATEST_RULES_YEAR): number {
  if (net >= 0) return 0;
  const { rate, max } = rulesFor(year).deficitCredit;
  return Math.min(round2(-net * rate), max);
}

/** The deduction for kilometres driven in one's own car in a year. */
export const mileageAmount = (km: number, year: number) => round2(km * rulesFor(year).mileagePerKm);

/** What the deductions took off the rent: the rent less the net income. */
export const deductionsOf = (f: Pick<TaxFigures, 'rentIncome' | 'netIncome'>) => round2(f.rentIncome - f.netIncome);

/** The first tax year building depreciation is calculated for: the one chosen, else the year of the first rent logged. */
export function depreciationStartYear(ledger: Pick<Ledger, 'settings' | 'rents'>, viewed: number): number {
  const s = ledger.settings;
  if (s.depreciationFromYear > 0) return s.depreciationFromYear;
  const firstLogged = ledger.rents.map((r) => r.month).sort()[0];
  if (firstLogged) return yearOf(firstLogged);
  return s.purchaseDate ? yearOf(s.purchaseDate) : viewed;
}

/** The rows of form 7K's depreciation table for the building, for one tax year (the whole apartment). */
export interface DepreciationDetail {
  /** 4.1 The let building's part of the property's acquisition cost: the price and purchase costs, by the building and let shares. */
  cost: number;
  /** 4.2 Unwritten-off cost at the start of the year. */
  start: number;
  /** 4.3 Additions during the year: improvements paid. */
  added: number;
  /** 4.4 Unwritten-off cost after additions. */
  base: number;
  /** 4.5 The year's depreciation. */
  part: number;
  /** 4.6 Unwritten-off cost at the end of the year. */
  end: number;
  /** The rate used, in percent: the one chosen, at most the highest for the kind of building. */
  rate: number;
}

/**
 * Building depreciation (poisto) of a property's let building in a tax year:
 * the highest rate of the building kind, on the cost that is left — the
 * building's part of the price and purchase costs, plus what improvements it
 * got, less what was deducted before. Worked through every year from the
 * first, assuming the highest was claimed each time. Never for a share in a
 * housing company: that price is deducted when the share is sold. Null when
 * there is none to calculate.
 */
export function depreciationDetail(ledger: Ledger, year: number): DepreciationDetail | null {
  const s = ledger.settings;
  if (s.propertyType !== 'property' || !s.useDepreciation) return null;
  const first = depreciationStartYear(ledger, year);
  if (year < first) return null;
  const letPart = s.letSharePct / 100;
  const cost = round2(((s.purchasePrice + s.purchaseCosts) * s.buildingSharePct * letPart) / 100);
  let left = Math.max(cost - s.depreciationPrior, 0);
  let detail!: DepreciationDetail;
  for (let y = first; y <= year; y++) {
    const rules = rulesFor(y);
    const added = round2(
      ledger.costs.filter((c) => c.category === 'improvement' && yearOf(c.date) === y).reduce((a, c) => a + c.amount, 0),
    );
    const start = round2(left);
    const base = round2(start + added);
    const rate = Math.min(s.depreciationRate, rules.buildingRate[s.buildingKind]);
    // What was claimed before and is under the at-once limit is deducted whole.
    const wholeNow = (y > first || s.depreciationPrior > 0) && base > 0 && base <= rules.movable.atOnceLimit;
    const part = wholeNow ? base : round2((base * rate) / 100);
    left = round2(base - part);
    detail = { cost, start, added, base, part, end: left, rate };
  }
  return detail;
}

/** The year's building depreciation: row 4.5, or nothing. */
export const computeDepreciation = (ledger: Ledger, year: number): number => depreciationDetail(ledger, year)?.part ?? 0;

/** One piece of furniture or appliance that is depreciated over several years, in one tax year. */
export interface MovableItem {
  id: string;
  date: string;
  description: string;
  price: number;
  /** What is left of it at the start of the year; 0 in the year it is bought. */
  start: number;
  added: number;
  part: number;
  end: number;
}

/** The loose-property rows of form 7K, and the inventory list the law asks for: every item still being depreciated this year. */
export interface MovableDetail {
  start: number;
  added: number;
  part: number;
  end: number;
  items: MovableItem[];
}

export function movableDetail(ledger: Pick<Ledger, 'settings' | 'costs'>, year: number): MovableDetail {
  const items: MovableItem[] = [];
  for (const c of ledger.costs) {
    if (deductionOf(c, ledger.settings) !== 'furniture' || yearOf(c.date) > year) continue;
    const part = furniturePart(c, year);
    let before = 0;
    for (let y = yearOf(c.date); y < year; y++) before = round2(before + furniturePart(c, y));
    const bought = yearOf(c.date) === year;
    const start = bought ? 0 : round2(c.amount - before);
    // Fully deducted in an earlier year: no longer on the list.
    if (!bought && start <= 0) continue;
    const added = bought ? c.amount : 0;
    items.push({
      id: c.id,
      date: c.date,
      description: c.description,
      price: c.amount,
      start,
      added,
      part,
      end: round2(start + added - part),
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  const sum = (pick: (i: MovableItem) => number) => round2(items.reduce((a, i) => a + pick(i), 0));
  return { start: sum((i) => i.start), added: sum((i) => i.added), part: sum((i) => i.part), end: sum((i) => i.end), items };
}

export type CostDeduction = 'expense' | 'none' | 'improvement' | 'addition' | 'furniture' | 'interest';

/**
 * How one logged cost is deducted for this apartment:
 * `expense`, `interest` — as a whole, in the year paid (interest on the other form);
 * `improvement`, `furniture` — this year's part of a cost spread over years;
 * `addition` — a property's improvement, which joins the building's cost;
 * `none` — not deducted.
 */
export function deductionOf(
  cost: Pick<CostEntry, 'category' | 'amount' | 'spreadYears'> & Partial<Pick<CostEntry, 'date'>>,
  settings: Pick<ApartmentSettings, 'financingChargeDeductible' | 'furnishing' | 'propertyType' | 'belowMarketRent'>,
): CostDeduction {
  const rules = rulesFor(cost.date ? yearOf(cost.date) : LATEST_RULES_YEAR);
  switch (CATEGORIES[cost.category].treatment) {
    case 'financing':
      return settings.financingChargeDeductible ? 'expense' : 'none';
    case 'furniture':
      // The flat rate already covers all furniture and loose appliances.
      if (settings.furnishing === 'flat') return 'none';
      return cost.amount <= rules.movable.atOnceLimit || cost.spreadYears === 1 ? 'expense' : 'furniture';
    case 'improvement':
      return settings.propertyType === 'property' ? 'addition' : 'improvement';
    case 'interest':
      return settings.belowMarketRent ? 'none' : 'interest';
    default:
      return 'expense';
  }
}

/** The years an improvement of a flat is spread over, within what the law allows. */
export const improvementYears = (c: Pick<CostEntry, 'date' | 'spreadYears'>) => {
  const { minYears, maxYears } = rulesFor(yearOf(c.date)).improvement;
  return Math.min(Math.max(Math.round(c.spreadYears ?? maxYears), minYears), maxYears);
};

/**
 * The part of an improvement of a flat deducted in `year`: equal parts from the
 * year it was paid, the last part taking the rounding so the parts add up exactly.
 */
export function improvementPart(c: Pick<CostEntry, 'date' | 'amount' | 'spreadYears'>, year: number): number {
  const n = improvementYears(c);
  const k = year - yearOf(c.date);
  if (k < 0 || k >= n) return 0;
  const part = round2(c.amount / n);
  return k === n - 1 ? round2(c.amount - part * (n - 1)) : part;
}

/**
 * The part of a dear piece of furniture deducted in `year`: a share of what is
 * left of it, and the whole of what is left once that is no more than the
 * at-once limit at the start of a year.
 */
export function furniturePart(c: Pick<CostEntry, 'date' | 'amount'>, year: number): number {
  const first = yearOf(c.date);
  let left = c.amount;
  for (let y = first; y <= year; y++) {
    const { atOnceLimit, rate } = rulesFor(y).movable;
    const part = y > first && left <= atOnceLimit ? left : round2(left * rate);
    if (y === year) return part;
    left = round2(left - part);
  }
  return 0;
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
    const deductible = ofCat.every((c) => deductionOf(c, s) !== 'none');
    const paid = round2(ofCat.reduce((a, c) => a + c.amount, 0));
    return {
      category: cat,
      label: CATEGORIES[cat].label,
      fi: CATEGORIES[cat].fi,
      deductible,
      // A cost of the whole home counts by the let share; a refused one is shown as paid.
      amount: deductible && CATEGORIES[cat].shared ? round2((paid * s.letSharePct) / 100) : paid,
    };
  }).filter((l) => l.amount !== 0);

  const sumOf = (kind: CostDeduction, part: (c: CostEntry) => number) =>
    round2(ledger.costs.filter((c) => deductionOf(c, s) === kind).reduce((a, c) => a + part(c), 0));
  const { studio, larger } = rulesFor(year).furnishedFlatRate;
  const letMonths = monthRows.filter((r) => r.status !== 'vacant').length;
  const depreciationLines = depreciationFrom({
    building: computeDepreciation(ledger, year),
    improvements: sumOf('improvement', (c) => improvementPart(c, year)),
    furniture: sumOf('furniture', (c) => furniturePart(c, year)),
    flatRate: s.furnishing === 'flat' ? round2(letMonths * (s.roomClass === 'studio' ? studio : larger)) : 0,
  });

  const figures = figuresFrom(year, rentIncome, lines, depreciationLines, s.belowMarketRent);

  return {
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
  return { sharePct, ...figuresFrom(t.year, part(t.rentIncome), lines, depreciation, t.rentLimited) };
}

/**
 * The owner's whole portfolio for a year. Capital income tax is progressive
 * over the person's total, so it is estimated on the summed net — a loss on one
 * apartment offsets a profit on another.
 */
export function portfolioTotals(
  shares: Pick<TaxFigures, 'rentIncome' | 'deductibleCosts' | 'depreciation' | 'netIncome'>[],
  year: number = LATEST_RULES_YEAR,
): PortfolioTotals {
  const sum = (pick: (s: (typeof shares)[number]) => number) => round2(shares.reduce((a, s) => a + pick(s), 0));
  const netIncome = sum((s) => s.netIncome);
  return {
    rentIncome: sum((s) => s.rentIncome),
    deductibleCosts: sum((s) => s.deductibleCosts),
    depreciation: sum((s) => s.depreciation),
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome, year),
    deficitCredit: deficitCreditOf(netIncome, year),
  };
}

function depreciationFrom(parts: Record<DepreciationKind, number>): DepreciationLine[] {
  return (Object.keys(parts) as DepreciationKind[])
    .map((kind) => ({ kind, amount: parts[kind] }))
    .filter((d) => d.amount !== 0);
}

function figuresFrom(
  year: number,
  rentIncome: number,
  lines: TaxLine[],
  depreciationLines: DepreciationLine[],
  rentLimited: boolean,
): TaxFigures {
  const depreciation = round2(depreciationLines.reduce((a, d) => a + d.amount, 0));
  const deductibleCosts = round2(lines.filter((l) => l.deductible).reduce((a, l) => a + l.amount, 0));
  const nonDeductibleCosts = round2(lines.filter((l) => !l.deductible).reduce((a, l) => a + l.amount, 0));
  // Below-market rent: costs and depreciation together may not exceed the rent.
  const limitAdjustment = rentLimited ? Math.max(round2(deductibleCosts + depreciation - rentIncome), 0) : 0;
  const netIncome = round2(rentIncome - deductibleCosts - depreciation + limitAdjustment);
  return {
    year,
    rentIncome,
    lines,
    deductibleCosts,
    nonDeductibleCosts,
    depreciationLines,
    depreciation,
    rentLimited,
    limitAdjustment,
    netIncome,
    estimatedTax: estimateCapitalTax(netIncome, year),
    deficitCredit: deficitCreditOf(netIncome, year),
  };
}

export const eur = (n: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);

export const pct = (n: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n)} %`;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
