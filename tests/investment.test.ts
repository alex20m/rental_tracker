import { describe, expect, it } from 'vitest';
import { cashByMonth, costsByCategory, investmentSummary, investmentYear, type InvestmentLedger } from '@/lib/domain/investment';
import { defaultSettings, type CostEntry, type RentEntry } from '@/lib/domain/types';

const today = new Date('2026-11-24T12:00:00Z');

const rent = (month: string, amount: number, receivedDate: string): RentEntry => ({
  month,
  status: 'paid',
  amount,
  receivedDate,
  note: '',
});

const cost = (date: string, category: CostEntry['category'], amount: number): CostEntry => ({
  id: `${date}-${category}-${amount}`,
  date,
  category,
  description: '',
  amount,
  hasReceipt: false,
});

const ledger = (over: Partial<InvestmentLedger> = {}): InvestmentLedger => ({
  settings: { ...defaultSettings },
  rents: [],
  costs: [],
  mySharePct: 100,
  mySale: null,
  acquisitionCosts: [],
  myInvestment: null,
  myLoanYears: [],
  ...over,
});

describe("a year's profit", () => {
  // 2 400 € of rent received in 2025 — one of it for December 2024, none of
  // what came for December 2025 in January — against costs of every kind.
  const year2025 = ledger({
    rents: [
      rent('2024-12', 800, '2025-01-05'),
      rent('2025-01', 800, '2025-01-02'),
      rent('2025-02', 800, '2025-02-02'),
      rent('2025-12', 800, '2026-01-02'),
    ],
    costs: [
      cost('2025-03-01', 'maintenance_charge', 300),
      cost('2025-04-01', 'repairs', 100),
      cost('2025-05-01', 'loan_interest', 250),
      cost('2025-06-01', 'improvement', 1000),
      cost('2025-07-01', 'furniture', 2000),
      cost('2024-07-01', 'repairs', 999),
    ],
  });

  it('counts the rent received in the year, whatever month it was for', () => {
    expect(investmentYear(year2025, 2025, today).rentIncome).toBe(2400);
  });

  it('takes every cost paid in the year, the loan interest logged with them included', () => {
    expect(investmentYear(year2025, 2025, today).runningCosts).toBe(650);
  });

  it('splits the running costs into the apartment’s own and its financing, and takes the own ones off the rent for the net operating income', () => {
    // Loan interest and financing charges pay for the money, not the flat: net operating income is before them.
    const y = investmentYear(year2025, 2025, today);
    expect(y.operatingCosts).toBe(400);
    expect(y.financingCosts).toBe(250);
    expect(y.netOperatingIncome).toBe(2000);
  });

  it('counts a financing charge with the loan interest, deductible or not', () => {
    const y = investmentYear(ledger({ costs: [cost('2025-03-01', 'financing_charge', 120), cost('2025-03-01', 'water_charge', 30)] }), 2025, today);
    expect(y.financingCosts).toBe(120);
    expect(y.operatingCosts).toBe(30);
  });

  it('gives the occupancy as the paid months out of the months logged, and none with nothing logged', () => {
    const logged = ledger({
      rents: [
        rent('2025-01', 800, '2025-01-02'),
        { month: '2025-02', status: 'vacant', amount: 0, receivedDate: '', note: '' },
        { month: '2025-03', status: 'unpaid', amount: 0, receivedDate: '', note: '' },
      ],
    });
    expect(investmentYear(logged, 2025, today).occupancy).toBe(33);
    expect(investmentYear(year2025, 2025, today).occupancy).toBe(100);
    expect(investmentYear(ledger(), 2025, today).occupancy).toBeNull();
  });

  it('takes an improvement and furniture in full in the year paid, not spread as the tax spreads them', () => {
    expect(investmentYear(year2025, 2025, today).investments).toBe(3000);
  });

  it('subtracts all of it from the rent for the profit before tax', () => {
    expect(investmentYear(year2025, 2025, today).profitBeforeTax).toBe(-1250);
  });

  it("takes off the tax the Tax page estimates, which spreads the improvement and furniture", () => {
    // Taxed: 2 400 − 650 − 100 (a tenth of the improvement) − 500 (a quarter of the furniture) = 1 150 → 30 %.
    const y = investmentYear(year2025, 2025, today);
    expect(y.taxableIncome).toBe(1150);
    expect(y.tax).toBe(345);
    expect(y.profitAfterTax).toBe(-1595);
  });

  it('lets the tax deduct a part of an earlier year’s improvement, though no money left this year', () => {
    const y = investmentYear(ledger({ costs: [cost('2025-06-01', 'improvement', 1000)] }), 2026, today);
    expect(y.profitBeforeTax).toBe(0);
    expect(y.taxableIncome).toBe(-100);
    expect(y.tax).toBe(-30);
    expect(y.profitAfterTax).toBe(30);
  });

  it('adds the deficit credit of a year at a loss instead of taking off tax', () => {
    const y = investmentYear(ledger({ costs: [cost('2025-04-01', 'repairs', 1000)] }), 2025, today);
    expect(y.profitBeforeTax).toBe(-1000);
    expect(y.tax).toBe(-300);
    expect(y.profitAfterTax).toBe(-700);
  });

  it('counts a cost the tax refuses, because it was still paid', () => {
    // Below-market rent: the interest is not deductible, so the tax is on the whole rent.
    const y = investmentYear(
      ledger({
        settings: { ...defaultSettings, belowMarketRent: true },
        rents: [rent('2025-01', 2400, '2025-01-02')],
        costs: [cost('2025-05-01', 'loan_interest', 250)],
      }),
      2025,
      today,
    );
    expect(y.runningCosts).toBe(250);
    expect(y.profitBeforeTax).toBe(2150);
    expect(y.tax).toBe(720);
    expect(y.profitAfterTax).toBe(1430);
  });

  it("is the owner's part, with a cost of the whole home counted by the let share", () => {
    const y = investmentYear(
      ledger({
        settings: { ...defaultSettings, letSharePct: 60 },
        mySharePct: 50,
        rents: [rent('2025-01', 2400, '2025-01-02')],
        costs: [cost('2025-03-01', 'maintenance_charge', 300), cost('2025-04-01', 'repairs', 100)],
      }),
      2025,
      today,
    );
    // 300 × 60 % + 100 = 280, half of it the owner's.
    expect(y.rentIncome).toBe(1200);
    expect(y.runningCosts).toBe(140);
    expect(y.profitBeforeTax).toBe(1060);
  });

  it("rounds the owner's part to the cent, a half cent away from zero", () => {
    const y = investmentYear(
      ledger({ mySharePct: 50, costs: [cost('2025-04-01', 'repairs', 100.01)] }),
      2025,
      today,
    );
    expect(y.runningCosts).toBe(50.01);
  });

  it('is all zero in a year with nothing in it', () => {
    expect(investmentYear(year2025, 2023, today)).toMatchObject({
      rentIncome: 0,
      runningCosts: 0,
      investments: 0,
      profitBeforeTax: 0,
      tax: 0,
      profitAfterTax: 0,
      amortization: 0,
      cashFlow: 0,
      loanBalance: null,
    });
  });
});

describe("a year's cash flow", () => {
  const withLoan = ledger({
    rents: [rent('2025-01', 10000, '2025-01-02')],
    myLoanYears: [
      { year: 2024, amortization: 5000, balance: 95000 },
      { year: 2025, amortization: 6000, balance: 89000 },
    ],
  });

  it('takes the amortization off the profit after tax', () => {
    const y = investmentYear(withLoan, 2025, today);
    expect(y.profitAfterTax).toBe(7000);
    expect(y.amortization).toBe(6000);
    expect(y.cashFlow).toBe(1000);
    expect(y.loanBalance).toBe(89000);
  });

  it('carries the last balance given into a year with no statement, and nothing paid off', () => {
    const y = investmentYear(withLoan, 2026, today);
    expect(y.amortization).toBe(0);
    expect(y.loanBalance).toBe(89000);
  });

  it('has no balance before the first statement', () => {
    expect(investmentYear(withLoan, 2023, today).loanBalance).toBeNull();
  });
});

describe('the investment since it was bought', () => {
  // Bought in June 2024 for 100 000 € with 80 000 € of loan; 2 000 € of
  // transfer tax and fees; worth 110 000 € now.
  const bought = ledger({
    mySale: { purchaseDate: '2024-06-01', purchasePrice: 100000, saleDate: '', salePrice: 0, saleCosts: 0 },
    acquisitionCosts: [
      { id: 'tt', date: '2024-06-01', kind: 'transfer_tax', description: '', amount: 1500, hasPhoto: false },
      { id: 'fee', date: '2024-06-01', kind: 'purchase_fees', description: '', amount: 500, hasPhoto: false },
    ],
    myInvestment: { loanAmount: 80000, marketValue: 110000 },
    myLoanYears: [
      { year: 2024, amortization: 2000, balance: 78000 },
      { year: 2025, amortization: 4000, balance: 74000 },
    ],
    rents: [rent('2024-07', 800, '2024-07-02'), rent('2025-01', 800, '2025-01-02')],
    costs: [cost('2025-03-01', 'repairs', 200)],
  });

  it('lists every year from the purchase to the year looked at', () => {
    const s = investmentSummary(bought, 2025, today);
    expect(s.years.map((y) => [y.year, y.profitAfterTax, y.cashFlow])).toEqual([
      [2024, 560, -1440],
      [2025, 420, -3580],
    ]);
  });

  it('adds the years up', () => {
    expect(investmentSummary(bought, 2025, today).totals).toEqual({
      rentIncome: 1600,
      runningCosts: 200,
      operatingCosts: 200,
      financingCosts: 0,
      netOperatingIncome: 1400,
      investments: 0,
      profitBeforeTax: 1400,
      tax: 420,
      profitAfterTax: 980,
      amortization: 6000,
      cashFlow: -5020,
    });
  });

  it('counts the price and the acquisition costs as invested, and the loan off it as own money', () => {
    const s = investmentSummary(bought, 2025, today);
    expect(s.purchasePrice).toBe(100000);
    expect(s.invested).toBe(102000);
    expect(s.loanAmount).toBe(80000);
    expect(s.equityInvested).toBe(22000);
  });

  it('values the part by the estimate: its change, the equity in it and the total return', () => {
    const s = investmentSummary(bought, 2025, today);
    expect(s.marketValue).toBe(110000);
    expect(s.valueChange).toBe(10000);
    expect(s.loanBalance).toBe(74000);
    expect(s.loanNow).toBe(74000);
    expect(s.equityNow).toBe(36000);
    // 980 of profit, and 110 000 worth for 102 000 put in.
    expect(s.totalReturn).toBe(8980);
  });

  it("gives the year's yields and the loan's share of the value in percent, to a tenth", () => {
    expect(investmentSummary(bought, 2025, today).ratios).toEqual({
      grossYield: 0.8, // 800 / 100 000
      netYield: 0.6, // 600 of net operating income / 102 000 put in
      cashOnCash: -15.5, // (−3 580 left + 180 of tax) / 22 000 of own money
      loanToValue: 67.3, // 74 000 / 110 000
    });
  });

  it('has no years and nothing summed before the purchase', () => {
    const s = investmentSummary(bought, 2023, today);
    expect(s.years).toEqual([]);
    expect(s.totals.profitAfterTax).toBe(0);
    expect(s.totals.cashFlow).toBe(0);
  });

  it('starts from the first year with anything logged when the purchase date is not known', () => {
    const s = investmentSummary(ledger({ rents: [rent('2023-05', 500, '2023-05-02')] }), 2025, today);
    expect(s.years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
  });

  it('has no years at all with nothing logged and no purchase date', () => {
    expect(investmentSummary(ledger(), 2025, today).years).toEqual([]);
  });

  it("takes the owner's part of the apartment's price when they have not entered their own", () => {
    const s = investmentSummary(
      ledger({ settings: { ...defaultSettings, purchasePrice: 120000 }, mySharePct: 50 }),
      2025,
      today,
    );
    expect(s.purchasePrice).toBe(60000);
    expect(s.invested).toBe(60000);
  });

  it('leaves out what needs a figure the owner has not given', () => {
    const s = investmentSummary(
      ledger({ settings: { ...defaultSettings, purchasePrice: 120000 }, rents: [rent('2025-01', 800, '2025-01-02')] }),
      2025,
      today,
    );
    expect(s.loanAmount).toBe(0);
    expect(s.equityInvested).toBe(120000);
    expect(s.loanBalance).toBeNull();
    expect(s.marketValue).toBeNull();
    expect(s.valueChange).toBeNull();
    expect(s.equityNow).toBeNull();
    expect(s.totalReturn).toBeNull();
    expect(s.ratios.loanToValue).toBeNull();
    expect(s.ratios.grossYield).toBe(0.7);
    // No loan: all of it is own money. 560 left after 240 of tax, against 120 000.
    expect(s.ratios.cashOnCash).toBe(0.7);
  });

  it('has no yields without a price', () => {
    const s = investmentSummary(ledger({ rents: [rent('2025-01', 800, '2025-01-02')] }), 2025, today);
    expect(s.ratios.grossYield).toBeNull();
    expect(s.ratios.netYield).toBeNull();
    expect(s.ratios.cashOnCash).toBeNull();
  });

  it('takes the loan at purchase as the balance until a year-end balance is given', () => {
    const s = investmentSummary(
      ledger({ myInvestment: { loanAmount: 50000, marketValue: 100000 } }),
      2025,
      today,
    );
    expect(s.loanBalance).toBeNull();
    expect(s.loanNow).toBe(50000);
    expect(s.equityNow).toBe(50000);
    expect(s.ratios.loanToValue).toBe(50);
  });

  it('has no return on equity when the loan covered all of it', () => {
    const s = investmentSummary(
      ledger({
        mySale: { purchaseDate: '2024-06-01', purchasePrice: 100000, saleDate: '', salePrice: 0, saleCosts: 0 },
        myInvestment: { loanAmount: 100000, marketValue: 0 },
        rents: [rent('2025-01', 800, '2025-01-02')],
      }),
      2025,
      today,
    );
    expect(s.equityInvested).toBe(0);
    expect(s.ratios.cashOnCash).toBeNull();
  });
});

describe('the money on the account month by month', () => {
  // A rent of 800 € a month, December's paid in January; a repair in February
  // and an improvement in March; 1 200 € paid off the loan in the year.
  const spring = ledger({
    rents: [
      rent('2024-12', 800, '2025-01-05'),
      rent('2025-01', 800, '2025-01-02'),
      rent('2025-02', 800, '2025-02-02'),
      rent('2025-03', 800, '2025-03-02'),
    ],
    costs: [cost('2025-02-10', 'repairs', 300), cost('2025-03-01', 'improvement', 1200)],
    myLoanYears: [{ year: 2025, amortization: 1200, balance: 50000 }],
  });

  it('runs to this month in the current year, each month its rent in, its costs out and a twelfth of the tax and the repayment', () => {
    // The year: 3 200 € of rent, 1 500 € of costs, tax 30 % of 3 200 − 300 − 120 = 834 €.
    expect(cashByMonth(spring, 2025, new Date('2025-03-15T12:00:00Z'))).toEqual([
      { month: 1, rentIn: 1600, costsOut: 0, taxOut: 69.5, amortization: 100, net: 1430.5, cumulative: 1430.5 },
      { month: 2, rentIn: 800, costsOut: 300, taxOut: 69.5, amortization: 100, net: 330.5, cumulative: 1761 },
      { month: 3, rentIn: 800, costsOut: 1200, taxOut: 69.5, amortization: 100, net: -569.5, cumulative: 1191.5 },
    ]);
  });

  it('runs all twelve months of a past year and ends on what was left on the account', () => {
    const months = cashByMonth(spring, 2025, today);
    expect(months).toHaveLength(12);
    expect(months[11]!.cumulative).toBe(-334);
    expect(investmentYear(spring, 2025, today).cashFlow).toBe(-334);
  });

  it('has no months yet in a year that has not begun', () => {
    expect(cashByMonth(spring, 2027, today)).toEqual([]);
  });

  it("is the owner's part, rounded so the months add up to the year", () => {
    const months = cashByMonth(
      ledger({ mySharePct: 50, rents: [rent('2025-01', 100.01, '2025-01-02'), rent('2025-02', 100.01, '2025-02-02')] }),
      2025,
      today,
    );
    expect(months[0]!.rentIn).toBe(50.01);
    expect(months[1]!.rentIn).toBe(50.0);
    expect(months[11]!.cumulative).toBe(investmentYear(ledger({ mySharePct: 50, rents: [rent('2025-01', 100.01, '2025-01-02'), rent('2025-02', 100.01, '2025-02-02')] }), 2025, today).cashFlow);
  });
});

describe('the costs of a year by kind', () => {
  it('lists every kind paid in the year, the largest first, improvements and loan interest included', () => {
    const year = ledger({
      costs: [
        cost('2025-03-01', 'maintenance_charge', 300),
        cost('2025-04-01', 'repairs', 100),
        cost('2025-05-01', 'loan_interest', 250),
        cost('2025-06-01', 'improvement', 1000),
        cost('2025-07-01', 'furniture', 2000),
        cost('2025-08-01', 'repairs', 50),
        cost('2024-07-01', 'insurance', 999),
      ],
    });
    expect(costsByCategory(year, 2025)).toEqual([
      { category: 'furniture', amount: 2000 },
      { category: 'improvement', amount: 1000 },
      { category: 'maintenance_charge', amount: 300 },
      { category: 'loan_interest', amount: 250 },
      { category: 'repairs', amount: 150 },
    ]);
  });

  it("is the owner's part, a cost of the whole home by the let share", () => {
    const shared = ledger({
      settings: { ...defaultSettings, letSharePct: 60 },
      mySharePct: 50,
      costs: [cost('2025-03-01', 'maintenance_charge', 300), cost('2025-04-01', 'repairs', 100)],
    });
    expect(costsByCategory(shared, 2025)).toEqual([
      { category: 'maintenance_charge', amount: 90 },
      { category: 'repairs', amount: 50 },
    ]);
  });

  it('is empty in a year without costs', () => {
    expect(costsByCategory(ledger(), 2025)).toEqual([]);
  });
});
