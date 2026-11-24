import { expect, test } from './fixtures';
import { alert, section } from './nav';

type Page = import('@playwright/test').Page;
type Locator = import('@playwright/test').Locator;

/** The year the clock is set in, so the page opens on it. */
const YEAR = 2025;

const hero = (page: Page) => page.locator('.hero');
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const form = (page: Page) => region(page, 'Your loan and value');
const save = (page: Page) => form(page).getByRole('button', { name: 'Save', exact: true });

async function openInvestment(page: Page) {
  await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
  await page.goto('/');
  await section(page, 'Investment');
}

/**
 * Opens an "i" and returns its bubble. The bubble closes on scroll, and a click
 * that first has to scroll the button into view can be followed by that scroll's
 * own event; so the button is brought into view and left to settle first, as a
 * person would have scrolled to it before tapping.
 */
async function openInfo(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await button.click();
  return page.getByRole('note');
}

/** A style length of each element, in percent, to a tenth. */
const lengths = (marks: Locator, side: 'width' | 'height') =>
  marks.evaluateAll((els, s) => els.map((e) => Math.round(parseFloat((e as HTMLElement).style[s as 'width']) * 10) / 10), side);

/** Bought in June 2024 for 100 000 € with 80 000 € of loan; 800 € of rent each year, a 200 € repair in March 2025. */
const bought = {
  mySale: { purchaseDate: '2024-06-01', purchasePrice: 100000, saleDate: '', salePrice: 0, saleCosts: 0 },
  acquisitionCosts: [
    { id: 'tt', date: '2024-06-01', kind: 'transfer_tax' as const, description: '', amount: 1500, hasPhoto: false },
    { id: 'fee', date: '2024-06-01', kind: 'purchase_fees' as const, description: '', amount: 500, hasPhoto: false },
  ],
  myInvestment: { loanAmount: 80000, marketValue: 110000 },
  myLoanYears: [
    { year: 2024, amortization: 2000, balance: 78000 },
    { year: 2025, amortization: 4000, balance: 74000 },
  ],
  rents: [
    { month: '2024-07', status: 'paid' as const, amount: 800, receivedDate: '2024-07-02', note: '' },
    { month: '2025-01', status: 'paid' as const, amount: 800, receivedDate: '2025-01-02', note: '' },
  ],
  costs: [{ id: 'c1', date: '2025-03-01', category: 'repairs' as const, description: '', amount: 200, hasReceipt: false }],
};

test.describe('the apartment as your investment', () => {
  test('opens on the key figures: cash flow and profit, then income, costs, net operating income, yields and occupancy', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    await expect(page.getByTestId('cash-flow')).toHaveText('−3 580,00 €');
    await expect(page.getByTestId('cash-flow')).toHaveClass(/neg/);
    await expect(page.getByTestId('net-profit')).toHaveText('420,00 €');
    await expect(page.getByTestId('net-profit')).not.toHaveClass(/neg/);
    await expect(hero(page).locator('.kpi')).toHaveText([
      'Rental income800 €',
      'Costs200 €',
      'Gross yield0,8 %',
      'Net yield0,6 %',
      'Net operating income600 €',
      'Occupancy100 %',
    ]);
    // Income beside costs and gross beside net yield, on a phone's two columns as on a desktop's four.
    const tops = await hero(page).locator('.kpi').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops[1]).toBe(tops[0]);
    expect(tops[3]).toBe(tops[2]);
    // Every figure explains itself behind an "i", not on the page.
    const info = await openInfo(page, hero(page).getByRole('button', { name: 'About Net operating income' }));
    await expect(info).toContainText('before loan interest, financing charges, renovations and tax');
  });

  test('draws the rent and the costs month by month, a month in words when pointed at or focused', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const monthly = region(page, 'Income and costs 2025');
    const readout = monthly.locator('.mc-readout');
    await expect(readout).toHaveText('2025: rent 800,00 €, costs 200,00 €. Point at or tap a month.');
    await expect(monthly.locator('.mc-month')).toHaveCount(12);
    // January's rent is the tallest bar; March's repair a quarter of it.
    expect(await lengths(monthly.locator('.mc-month').nth(0).locator('i'), 'height')).toEqual([100, 0]);
    expect(await lengths(monthly.locator('.mc-month').nth(2).locator('i'), 'height')).toEqual([0, 25]);

    const january = monthly.getByRole('button', { name: 'January 2025: rent 800,00 €, costs 0,00 €.' });
    await january.hover();
    await expect(readout).toHaveText('January 2025: rent 800,00 €, costs 0,00 €.');
    await expect(january).toHaveClass(/on/);
    await page.mouse.move(0, 0);
    await expect(readout).toHaveText('2025: rent 800,00 €, costs 200,00 €. Point at or tap a month.');

    const march = monthly.getByRole('button', { name: 'March 2025: rent 0,00 €, costs 200,00 €.' });
    await march.focus();
    await expect(readout).toHaveText('March 2025: rent 0,00 €, costs 200,00 €.');
    await march.blur();
    await expect(readout).toHaveText('2025: rent 800,00 €, costs 200,00 €. Point at or tap a month.');
  });

  test('works the income statement out from the rent to the cash flow', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const statement = region(page, 'Income statement 2025');
    await expect(statement.locator('.kv')).toHaveText([
      'Rental income800,00 €',
      'Running costs−200,00 €',
      'Net operating income600,00 €',
      'Profit before tax600,00 €',
      'Estimated tax−180,00 €',
      'Profit after tax420,00 €',
      'Loan repaid−4 000,00 €',
      'Cash flow−3 580,00 €',
      'Loan left at the end of 202574 000,00 €',
    ]);
    // Taxed on exactly the profit: nothing to explain.
    await expect(statement.getByRole('button', { name: 'About this year’s tax' })).toHaveCount(0);
  });

  test('lists the costs by kind, the largest first, each a bar against the largest', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat' },
      {
        costs: [
          { id: 'a', date: '2025-03-01', category: 'repairs', description: '', amount: 200, hasReceipt: false },
          { id: 'b', date: '2025-04-01', category: 'improvement', description: '', amount: 800, hasReceipt: false },
          { id: 'c', date: '2025-05-01', category: 'repairs', description: '', amount: 200, hasReceipt: false },
        ],
      },
    );
    await openInvestment(page);

    const kinds = region(page, 'Costs by kind 2025');
    await expect(kinds.locator('li')).toHaveText(['Basic improvement800,00 €', 'Repairs & upkeep400,00 €']);
    expect(await lengths(kinds.locator('.kind-bar i'), 'width')).toEqual([100, 50]);
  });

  test('compares the cash flow of each year, the year looked at marked', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const years = region(page, 'Cash flow by year');
    await expect(years.locator('.pc-labels li')).toHaveText(['2024−1 440 €', '2025−3 580 €']);
    await expect(years.locator('.pc-labels li.now')).toHaveText('2025−3 580 €');
    await expect(years.locator('.pc-col i').first()).toHaveClass(/down/);
    await expect(years.locator('.kv')).toHaveText('In all 2024–2025−5 020,00 €');
  });

  test('sets the value against the loan, with what is yours and the returns on your own money', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const value = region(page, 'Value and loan');
    await expect(value.locator('.legend')).toHaveText('Your equity 36 000,00 €Loan 74 000,00 €');
    expect(await value.locator('.equity i.quiet').evaluate((e) => (e as HTMLElement).style.width)).toBe('67.3%');
    await expect(value.locator('.kpi')).toHaveText([
      'Estimated value110 000 €',
      'Loan74 000 €',
      'Loan to value67,3 %',
      // (−3 580 left + 180 of tax) against 22 000 of own money.
      'Cash-on-cash return−15,5 %',
    ]);
  });

  test('keeps the full account since the purchase further down', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const since = region(page, 'Since you bought it');
    await expect(since.locator('.kv')).toHaveText([
      'Invested (price and acquisition costs)102 000,00 €',
      'Loan at the purchase−80 000,00 €',
      'Your own money put in22 000,00 €',
      'Profit after tax, in all980,00 €',
      'Loan repaid, in all6 000,00 €',
      'Cash flow, in all−5 020,00 €',
      'Change in value10 000,00 €',
      'Total return8 980,00 €',
    ]);

    await expect(page.getByLabel('Loan at the purchase (€)')).toHaveValue('80000');
    await expect(page.getByLabel('Estimated value now (€)')).toHaveValue('110000');
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('4000');
    await expect(page.getByLabel('Loan left 31.12.2025 (€)')).toHaveValue('74000');
    await expect(form(page).getByText('Saved', { exact: true })).toBeVisible();
    await expect(save(page)).toBeDisabled();
  });

  test('explains a tax bigger than the profit: an improvement paid this year is deducted over years', async ({ page, api }) => {
    // No rent in 2025: the tax deducts a tenth of the 3 000 €, a 300 € deficit, and credits 30 % of it.
    api.addApartment(
      { name: 'Flat' },
      {
        rents: [{ month: '2024-06', status: 'paid', amount: 500, receivedDate: '2024-06-02', note: '' }],
        costs: [{ id: 'c1', date: '2025-04-01', category: 'improvement', description: '', amount: 3000, hasReceipt: false }],
      },
    );
    await openInvestment(page);

    await expect(page.getByTestId('net-profit')).toHaveText('−2 910,00 €');
    await expect(page.getByTestId('net-profit')).toHaveClass(/neg/);
    // No price and no month logged this year: nothing to divide by.
    await expect(hero(page).locator('.kpi .v')).toHaveText(['0 €', '3 000 €', '—', '—', '0 €', '—']);

    const statement = region(page, 'Income statement 2025');
    await expect(statement).toContainText('Basic improvements and furniture−3 000,00 €');
    await expect(statement).toContainText('Estimated deficit credit90,00 €');
    await expect(statement).not.toContainText('Estimated tax');
    await expect(statement).not.toContainText('Loan interest');
    await expect(statement).not.toContainText('Loan left');
    const info = await openInfo(page, statement.getByRole('button', { name: 'About this year’s tax' }));
    await expect(info).toHaveText(
      'Why is the tax this size? It is worked out on −300,00 €, not on the profit before tax: 2 700,00 € of this year’s costs is deducted only in later years (a basic improvement over up to ten years, an expensive piece of furniture a quarter a year), or not at all. Those later deductions lower your tax in the years to come.',
    );
    await page.keyboard.press('Escape');

    const years = region(page, 'Cash flow by year');
    await expect(years.locator('.pc-labels li')).toHaveText(['2024350 €', '2025−2 910 €']);
    await expect(years.locator('.pc-col i').nth(1)).toHaveClass(/down/);

    const value = region(page, 'Value and loan');
    await expect(value).toContainText('Add the estimated value below to see your equity.');
    await expect(value.locator('.equity')).toHaveCount(0);
    await expect(value.locator('.kpi .v')).toHaveText(['—', '—', '—', '—']);
    const since = region(page, 'Since you bought it');
    await expect(since).not.toContainText('Loan at the purchase');
    await expect(since).not.toContainText('Total return');
    await expect(form(page).getByText('Saved', { exact: true })).toHaveCount(0);
  });

  test('explains a tax smaller than the profit, and keeps loan interest apart from the running costs', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat' },
      {
        rents: [{ month: '2025-01', status: 'paid', amount: 1000, receivedDate: '2025-01-02', note: '' }],
        costs: [
          { id: 'c1', date: '2024-04-01', category: 'improvement', description: '', amount: 1000, hasReceipt: false },
          { id: 'c2', date: '2025-02-01', category: 'loan_interest', description: '', amount: 100, hasReceipt: false },
        ],
      },
    );
    await openInvestment(page);

    const statement = region(page, 'Income statement 2025');
    // Net operating income is before the interest; the interest comes after it.
    await expect(statement).toContainText('Net operating income1 000,00 €');
    await expect(statement).toContainText('Loan interest and financing charges−100,00 €');
    await expect(statement).toContainText('Profit before tax900,00 €');
    const info = await openInfo(page, statement.getByRole('button', { name: 'About this year’s tax' }));
    await expect(info).toHaveText(
      'Why is the tax this small? It is worked out on 800,00 €, less than the profit before tax: 100,00 € is this year’s part of earlier improvements, furniture or depreciation, deducted although no money left your account for it this year.',
    );
  });

  test('shows the empty year plainly for an apartment with nothing logged yet', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await openInvestment(page);

    await expect(page.getByTestId('net-profit')).toHaveText('0,00 €');
    await expect(page.getByTestId('cash-flow')).toHaveText('0,00 €');
    await expect(region(page, 'Income and costs 2025').locator('.mc-readout')).toHaveText(
      '2025: rent 0,00 €, costs 0,00 €. Point at or tap a month.',
    );
    await expect(region(page, 'Costs by kind 2025')).toContainText('No costs logged this year.');
    await expect(region(page, 'Cash flow by year')).toHaveCount(0);
    await expect(page.getByLabel('Loan at the purchase (€)')).toHaveValue('');
  });

  test.describe('in Swedish', () => {
    test.use({ locale: 'sv-SE' });

    test('opens the sentence about a month with a capital, though Swedish writes the month in lower case', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' }, bought);
      await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
      await page.goto('/');
      const toggle = page.getByRole('button', { name: 'Meny', exact: true });
      const nav = page.getByRole('navigation', { name: 'Avsnitt' });
      await toggle.or(nav).first().waitFor();
      if (await toggle.isVisible()) await toggle.click();
      await nav.getByRole('button', { name: 'Investering', exact: true }).click();

      const monthly = region(page, 'Intäkter och kostnader 2025');
      await monthly.getByRole('button', { name: /^Januari 2025/ }).focus();
      await expect(monthly.locator('.mc-readout')).toHaveText('Januari 2025: hyra 800,00 €, kostnader 0,00 €.');
    });
  });

  test('saves the loan, the value and the year’s statement, and then only what changed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await openInvestment(page);
    await expect(save(page)).toBeDisabled();

    await page.getByLabel('Loan at the purchase (€)').fill('80000');
    await page.getByLabel('Estimated value now (€)').fill('120000');
    await page.getByLabel('Repaid in 2025 (€)').fill('3000');
    await page.getByLabel('Loan left 31.12.2025 (€)').fill('77000.5');
    await save(page).click();

    await expect(form(page).getByText('Saved', { exact: true })).toBeVisible();
    expect(api.callsTo('PUT')).toEqual([
      { call: `PUT /api/apartments/${apt.id}/investment`, body: { loanAmount: 80000, marketValue: 120000 } },
      { call: `PUT /api/apartments/${apt.id}/investment/loan/2025`, body: { amortization: 3000, balance: 77000.5 } },
    ]);
    await expect(region(page, 'Income statement 2025')).toContainText('Loan repaid−3 000,00 €');
    await expect(region(page, 'Income statement 2025')).toContainText('Loan left at the end of 202577 000,50 €');
    await expect(region(page, 'Value and loan').locator('.kpi').first()).toHaveText('Estimated value120 000 €');

    api.calls.length = 0;
    await page.getByLabel('Estimated value now (€)').fill('125000');
    await save(page).click();
    await expect(form(page).getByText('Saved', { exact: true })).toBeVisible();
    expect(api.callsTo('PUT')).toEqual([
      { call: `PUT /api/apartments/${apt.id}/investment`, body: { loanAmount: 80000, marketValue: 125000 } },
    ]);

    api.calls.length = 0;
    await page.getByLabel('Repaid in 2025 (€)').fill('3500');
    await save(page).click();
    await expect(form(page).getByText('Saved', { exact: true })).toBeVisible();
    expect(api.callsTo('PUT')).toEqual([
      { call: `PUT /api/apartments/${apt.id}/investment/loan/2025`, body: { amortization: 3500, balance: 77000.5 } },
    ]);
  });

  test('forgets the loan and the value once every field is emptied', async ({ page, api }) => {
    const apt = api.addApartment(
      { name: 'Flat' },
      { myInvestment: { loanAmount: 80000, marketValue: 0 }, myLoanYears: [{ year: 2025, amortization: 1000, balance: 79000 }] },
    );
    await openInvestment(page);
    await expect(page.getByLabel('Estimated value now (€)')).toHaveValue('');
    const value = region(page, 'Value and loan');
    await expect(value.locator('.kpi').nth(1)).toHaveText('Loan79 000 €');

    for (const label of ['Loan at the purchase (€)', 'Repaid in 2025 (€)', 'Loan left 31.12.2025 (€)']) {
      await page.getByLabel(label).fill('');
    }
    await save(page).click();

    // The loan goes from the page only once both are saved and read back. The button is no sign:
    // it is disabled while saving as well as once there is nothing left to save.
    await expect(value.locator('.kpi').nth(1)).toHaveText('Loan—');
    await expect(region(page, 'Income statement 2025')).not.toContainText('Loan left');
    await expect(save(page)).toBeDisabled();
    await expect(form(page).getByText('Saved', { exact: true })).toHaveCount(0);
    expect(apt.myInvestment).toBeNull();
    expect(apt.myLoanYears).toEqual([]);
  });

  test('keeps each year’s statement to its year, and carries the last balance into a year without one', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat' },
      {
        myLoanYears: [
          { year: 2024, amortization: 1000, balance: 50000 },
          { year: 2026, amortization: 500, balance: 49500 },
        ],
      },
    );
    await openInvestment(page);
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('');
    await expect(region(page, 'Income statement 2025')).toContainText('Loan left at the end of 202550 000,00 €');

    // 2024 is offered only because the loan has a statement for it.
    await page.getByLabel('Tax year').selectOption('2024');

    await expect(page.getByLabel('Repaid in 2024 (€)')).toHaveValue('1000');
    await expect(page.getByLabel('Loan left 31.12.2024 (€)')).toHaveValue('50000');
    await expect(region(page, 'Income statement 2024')).toContainText('Loan repaid−1 000,00 €');

    await page.getByLabel('Repaid in 2024 (€)').fill('1200');
    await page.getByLabel('Tax year').selectOption('2025');
    // Typed but not saved, for another year: gone, not carried over.
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('');

    // A year still to come has its statement, but no months behind it yet.
    await page.getByLabel('Tax year').selectOption('2026');
    await expect(page.getByLabel('Repaid in 2026 (€)')).toHaveValue('500');
    await expect(region(page, 'Income statement 2026')).toBeVisible();
    await expect(region(page, 'Income and costs 2026')).toHaveCount(0);
  });

  test('says why the loan could not be saved and keeps what was typed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await openInvestment(page);
    api.failNext('PUT', /\/investment$/, { status: 503, body: { error: 'Try again shortly' } });

    await page.getByLabel('Loan at the purchase (€)').fill('80000');
    await save(page).click();

    await expect(alert(page)).toHaveText('Try again shortly');
    await expect(page.getByLabel('Loan at the purchase (€)')).toHaveValue('80000');
    await expect(save(page)).toBeEnabled();
    expect(apt.myInvestment).toBeNull();
  });
});
