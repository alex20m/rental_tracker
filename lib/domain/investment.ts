import { computeTax, ownerShare, round2 } from './tax';
import { CATEGORIES, type ApartmentView, type CostCategory, type CostEntry } from './types';

/**
 * The apartment as an investment, for one owner: what it earned them after
 * every cost and the tax, what was left on their account once the loan was paid
 * down, and what it has given since they bought it.
 *
 * It is not the tax calculation. Every cost counts in full in the year it was
 * paid — a basic improvement and furniture too, which the tax spreads over
 * years, and a cost the tax refuses — because the money left then. The tax
 * itself is the Tax page's estimate for the year. The loan interest is among
 * the costs only if the owner logged it there; the banks report it to the Tax
 * Administration themselves, so many do not. Every amount is the owner's own
 * part: the apartment's figures by their share, and their own loan and value.
 */

export type InvestmentLedger = Pick<
  ApartmentView,
  'settings' | 'rents' | 'costs' | 'mySharePct' | 'mySale' | 'acquisitionCosts' | 'myInvestment' | 'myLoanYears'
>;

/** The flows of one year, or of several summed. */
export interface InvestmentFlows {
  /** The rent received. */
  rentIncome: number;
  /** Every cost paid, except improvements and furniture: the operating costs and the financing costs. */
  runningCosts: number;
  /** What running the apartment cost: every cost but its financing, improvements and furniture. */
  operatingCosts: number;
  /** What the money cost: loan interest and the housing company's financing charges, as logged. */
  financingCosts: number;
  /** The rent less the operating costs: what the apartment earns before its financing, renovations and tax. */
  netOperatingIncome: number;
  /** Basic improvements and furniture, in full in the year paid. */
  investments: number;
  profitBeforeTax: number;
  /** The estimated tax; negative when a deficit gives a credit instead. */
  tax: number;
  profitAfterTax: number;
  /** What was paid off the loan. */
  amortization: number;
  /** What was left on the account: the profit after tax less the amortization. */
  cashFlow: number;
}

export interface InvestmentYear extends InvestmentFlows {
  year: number;
  /**
   * What the tax is worked out on: the rent less the year's deductions as the
   * tax takes them, which spreads improvements and furniture over years. It
   * differs from the profit before tax in a year one is paid, and in the years
   * after, while its parts are still deducted.
   */
  taxableIncome: number;
  /** The loan left at the end of the year, from the latest statement given; null before the first. */
  loanBalance: number | null;
  /** The months logged as paid out of the months logged, in percent; null with none logged. */
  occupancy: number | null;
}

/** Ratios in percent, to a tenth; null when a figure they need is missing or nothing. */
export interface InvestmentRatios {
  /** The year's rent against the purchase price. */
  grossYield: number | null;
  /** The year's net operating income against everything invested (the price and the acquisition costs). */
  netYield: number | null;
  /** Cash-on-cash: what was left on the account before tax against the owner's own money in it. */
  cashOnCash: number | null;
  /** The loan against the estimated value. */
  loanToValue: number | null;
}

export interface InvestmentSummary {
  /** The year looked at. */
  year: InvestmentYear;
  /** Every year from the purchase (or the first thing logged) to the year looked at. */
  years: InvestmentYear[];
  /** Those years summed. */
  totals: InvestmentFlows;
  purchasePrice: number;
  /** The purchase price and the acquisition costs. */
  invested: number;
  /** Borrowed for the purchase; 0 when not given. */
  loanAmount: number;
  /** Invested less the loan: the owner's own money put in. */
  equityInvested: number;
  /** The year looked at's balance (see `InvestmentYear`). */
  loanBalance: number | null;
  /** What is owed now: the year's balance, or what was borrowed while no balance is given. */
  loanNow: number;
  /** The owner's estimate of what their part is worth; null when not given. */
  marketValue: number | null;
  /** The estimate less the purchase price. */
  valueChange: number | null;
  /** The estimate less what is left of the loan. */
  equityNow: number | null;
  /** The profit after tax of every year, and the estimate less what was invested. */
  totalReturn: number | null;
  ratios: InvestmentRatios;
}

const FLOWS: (keyof InvestmentFlows)[] = [
  'rentIncome',
  'runningCosts',
  'operatingCosts',
  'financingCosts',
  'netOperatingIncome',
  'investments',
  'profitBeforeTax',
  'tax',
  'profitAfterTax',
  'amortization',
  'cashFlow',
];

const yearOf = (date: string) => Number(date.slice(0, 4));

/** A percentage to a tenth, or null when there is nothing to divide by. */
const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** The let part of a cost: a cost of the whole home counts only by the let share, as in the tax. */
const letPart = (ledger: InvestmentLedger, c: CostEntry) =>
  CATEGORIES[c.category].shared ? (c.amount * ledger.settings.letSharePct) / 100 : c.amount;

/** Which of the three a cost is: running the flat, financing it, or improving and furnishing it. */
function kindOf(c: CostEntry): 'operating' | 'financing' | 'investment' {
  const { treatment } = CATEGORIES[c.category];
  if (treatment === 'improvement' || treatment === 'furniture') return 'investment';
  return treatment === 'interest' || treatment === 'financing' ? 'financing' : 'operating';
}

/**
 * The owner's part of the costs paid in `year` up to the end of month
 * `through` (12: the whole year), by kind. Each sum is rounded before the
 * share is taken, so a month's running total and the year's agree to the cent.
 */
function costsPaid(ledger: InvestmentLedger, year: number, through = 12) {
  const sums = { operating: 0, financing: 0, investment: 0 };
  for (const c of ledger.costs) {
    if (yearOf(c.date) !== year || Number(c.date.slice(5, 7)) > through) continue;
    sums[kindOf(c)] += letPart(ledger, c);
  }
  const part = (n: number) => round2((round2(n) * ledger.mySharePct) / 100);
  const operatingCosts = part(sums.operating);
  const financingCosts = part(sums.financing);
  return {
    operatingCosts,
    financingCosts,
    runningCosts: round2(operatingCosts + financingCosts),
    investmentCosts: part(sums.investment),
  };
}

/** The owner's part of the year's costs, by category, the largest first; improvements and loan interest included. */
export function costsByCategory(ledger: InvestmentLedger, year: number): { category: CostCategory; amount: number }[] {
  const sums = new Map<CostCategory, number>();
  for (const c of ledger.costs) {
    if (yearOf(c.date) === year) sums.set(c.category, (sums.get(c.category) ?? 0) + letPart(ledger, c));
  }
  return [...sums]
    .map(([category, sum]) => ({ category, amount: round2((round2(sum) * ledger.mySharePct) / 100) }))
    .sort((a, b) => b.amount - a.amount);
}

export function investmentYear(ledger: InvestmentLedger, year: number, today: Date = new Date()): InvestmentYear {
  const whole = computeTax(ledger, year, today);
  const tax = ownerShare(whole, ledger.mySharePct);
  const { runningCosts, operatingCosts, financingCosts, investmentCosts } = costsPaid(ledger, year);
  const logged = whole.paidMonths + whole.vacantMonths + whole.unpaidMonths;

  const profitBeforeTax = round2(tax.rentIncome - runningCosts - investmentCosts);
  const taxEffect = round2(tax.estimatedTax - tax.deficitCredit);
  const profitAfterTax = round2(profitBeforeTax - taxEffect);

  const statement = ledger.myLoanYears.find((l) => l.year === year);
  const amortization = statement?.amortization ?? 0;
  const latest = ledger.myLoanYears.filter((l) => l.year <= year).sort((a, b) => b.year - a.year)[0];

  return {
    year,
    taxableIncome: tax.netIncome,
    rentIncome: tax.rentIncome,
    runningCosts,
    operatingCosts,
    financingCosts,
    netOperatingIncome: round2(tax.rentIncome - operatingCosts),
    investments: investmentCosts,
    profitBeforeTax,
    tax: taxEffect,
    profitAfterTax,
    amortization,
    cashFlow: round2(profitAfterTax - amortization),
    loanBalance: latest?.balance ?? null,
    occupancy: logged ? Math.round((whole.paidMonths / logged) * 100) : null,
  };
}

/** The owner's purchase price: what they entered on the sale page, else their part of the apartment's. */
function purchasePriceOf(ledger: InvestmentLedger): { price: number; date: string } {
  const own = ledger.mySale;
  if (own && own.purchasePrice > 0) return { price: own.purchasePrice, date: own.purchaseDate || ledger.settings.purchaseDate };
  return {
    price: round2((ledger.settings.purchasePrice * ledger.mySharePct) / 100),
    date: own?.purchaseDate || ledger.settings.purchaseDate,
  };
}

/** The first year of the investment: the purchase, else the first thing logged; null when there is neither. */
function firstYear(ledger: InvestmentLedger, purchaseDate: string): number | null {
  if (purchaseDate) return yearOf(purchaseDate);
  const logged = [
    ...ledger.rents.filter((r) => r.receivedDate).map((r) => yearOf(r.receivedDate)),
    ...ledger.costs.map((c) => yearOf(c.date)),
    ...ledger.myLoanYears.map((l) => l.year),
  ];
  return logged.length ? Math.min(...logged) : null;
}

export function investmentSummary(ledger: InvestmentLedger, year: number, today: Date = new Date()): InvestmentSummary {
  const current = investmentYear(ledger, year, today);
  const { price, date } = purchasePriceOf(ledger);
  const first = firstYear(ledger, date);

  const years: InvestmentYear[] = [];
  if (first !== null) for (let y = first; y <= year; y++) years.push(y === year ? current : investmentYear(ledger, y, today));

  const totals = Object.fromEntries(
    FLOWS.map((k) => [k, round2(years.reduce((a, y) => a + y[k], 0))]),
  ) as unknown as InvestmentFlows;

  const invested = round2(price + ledger.acquisitionCosts.reduce((a, c) => a + c.amount, 0));
  const loanAmount = ledger.myInvestment?.loanAmount ?? 0;
  const equityInvested = round2(invested - loanAmount);
  const marketValue = ledger.myInvestment?.marketValue || null;
  // With no year-end balance given yet, what was borrowed is what is owed.
  const owed = current.loanBalance ?? loanAmount;

  return {
    year: current,
    years,
    totals,
    purchasePrice: price,
    invested,
    loanAmount,
    equityInvested,
    loanBalance: current.loanBalance,
    loanNow: owed,
    marketValue,
    valueChange: marketValue === null ? null : round2(marketValue - price),
    equityNow: marketValue === null ? null : round2(marketValue - owed),
    totalReturn: marketValue === null ? null : round2(totals.profitAfterTax + marketValue - invested),
    ratios: {
      grossYield: ratio(current.rentIncome, price),
      netYield: ratio(current.netOperatingIncome, invested),
      cashOnCash: ratio(round2(current.cashFlow + current.tax), equityInvested),
      loanToValue: marketValue === null ? null : ratio(owed, marketValue),
    },
  };
}

/** One month of the account: what came in and went out in it, and the running total from the start of the year. */
export interface CashMonth {
  month: number;
  rentIn: number;
  costsOut: number;
  /** A twelfth of the year's tax (negative: of a deficit credit), however it is really paid. */
  taxOut: number;
  /** A twelfth of the year's repayment, as banks take it monthly. */
  amortization: number;
  net: number;
  cumulative: number;
}

/**
 * The year's cash flow month by month, to this month in the current year and
 * none in a year to come. Rent counts in the month it was received and a cost
 * in the month it was paid; the tax and the loan repayment are known only for
 * the year, so each month carries a twelfth of them. Every running total is
 * worked out from the year's own sums, so December's is the year's cash flow
 * to the cent.
 */
export function cashByMonth(ledger: InvestmentLedger, year: number, today: Date = new Date()): CashMonth[] {
  const thisYear = today.getFullYear();
  const last = year < thisYear ? 12 : year === thisYear ? today.getMonth() + 1 : 0;
  const y = investmentYear(ledger, year, today);
  const part = (n: number) => round2((n * ledger.mySharePct) / 100);
  const prefix = `${year}-`;

  const totals = (m: number) => {
    const rent = part(
      round2(
        ledger.rents
          .filter((r) => r.status === 'paid' && r.receivedDate.startsWith(prefix) && Number(r.receivedDate.slice(5, 7)) <= m)
          .reduce((a, r) => a + r.amount, 0),
      ),
    );
    const { runningCosts, investmentCosts } = costsPaid(ledger, year, m);
    return {
      rent,
      costs: round2(runningCosts + investmentCosts),
      tax: round2((y.tax * m) / 12),
      amortization: round2((y.amortization * m) / 12),
    };
  };

  const months: CashMonth[] = [];
  let before = totals(0);
  for (let m = 1; m <= last; m++) {
    const now = totals(m);
    const cumulative = round2(now.rent - now.costs - now.tax - now.amortization);
    const previous = round2(before.rent - before.costs - before.tax - before.amortization);
    months.push({
      month: m,
      rentIn: round2(now.rent - before.rent),
      costsOut: round2(now.costs - before.costs),
      taxOut: round2(now.tax - before.tax),
      amortization: round2(now.amortization - before.amortization),
      net: round2(cumulative - previous),
      cumulative,
    });
    before = now;
  }
  return months;
}
