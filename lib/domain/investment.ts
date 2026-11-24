import { computeTax, ownerShare, round2 } from './tax';
import { CATEGORIES, type ApartmentView } from './types';

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
  /** Every cost paid, except improvements and furniture. */
  runningCosts: number;
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
  /** The loan left at the end of the year, from the latest statement given; null before the first. */
  loanBalance: number | null;
}

/** Ratios in percent, to a tenth; null when a figure they need is missing or nothing. */
export interface InvestmentRatios {
  /** The year's rent against the purchase price. */
  grossYield: number | null;
  /** The year's profit before tax against everything invested. */
  returnBeforeTax: number | null;
  /** The year's profit after tax against the owner's own money in it; only with a loan. */
  returnOnEquity: number | null;
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

export function investmentYear(ledger: InvestmentLedger, year: number, today: Date = new Date()): InvestmentYear {
  const s = ledger.settings;
  const part = (n: number) => round2((n * ledger.mySharePct) / 100);
  const tax = ownerShare(computeTax(ledger, year, today), ledger.mySharePct);

  let running = 0;
  let investments = 0;
  for (const c of ledger.costs) {
    if (yearOf(c.date) !== year) continue;
    const { treatment, shared } = CATEGORIES[c.category];
    // A cost of the whole home is the let part's only by the let share, as in the tax.
    const amount = shared ? (c.amount * s.letSharePct) / 100 : c.amount;
    if (treatment === 'improvement' || treatment === 'furniture') investments += amount;
    else running += amount;
  }
  const runningCosts = part(round2(running));
  const investmentCosts = part(round2(investments));

  const profitBeforeTax = round2(tax.rentIncome - runningCosts - investmentCosts);
  const taxEffect = round2(tax.estimatedTax - tax.deficitCredit);
  const profitAfterTax = round2(profitBeforeTax - taxEffect);

  const statement = ledger.myLoanYears.find((l) => l.year === year);
  const amortization = statement?.amortization ?? 0;
  const latest = ledger.myLoanYears.filter((l) => l.year <= year).sort((a, b) => b.year - a.year)[0];

  return {
    year,
    rentIncome: tax.rentIncome,
    runningCosts,
    investments: investmentCosts,
    profitBeforeTax,
    tax: taxEffect,
    profitAfterTax,
    amortization,
    cashFlow: round2(profitAfterTax - amortization),
    loanBalance: latest?.balance ?? null,
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
    marketValue,
    valueChange: marketValue === null ? null : round2(marketValue - price),
    equityNow: marketValue === null ? null : round2(marketValue - owed),
    totalReturn: marketValue === null ? null : round2(totals.profitAfterTax + marketValue - invested),
    ratios: {
      grossYield: ratio(current.rentIncome, price),
      returnBeforeTax: ratio(current.profitBeforeTax, invested),
      returnOnEquity: loanAmount > 0 ? ratio(current.profitAfterTax, equityInvested) : null,
      loanToValue: marketValue === null ? null : ratio(owed, marketValue),
    },
  };
}
