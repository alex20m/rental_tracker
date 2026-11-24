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

/** The parts of one of the money bars: how each is drawn and its width in percent of the longer bar. */
const parts = (cash: Locator, bar: number) =>
  cash
    .locator('.io-bar')
    .nth(bar)
    .locator('i')
    .evaluateAll((els) => els.map((e) => [e.className, Math.round(parseFloat((e as HTMLElement).style.width) * 10) / 10]));

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
  test('opens on the two answers: the profit after tax and what was left on the account', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    await expect(hero(page)).toContainText('Your profit after tax 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('420,00 €');
    await expect(page.getByTestId('net-profit')).not.toHaveClass(/neg/);
    await expect(hero(page)).toContainText('Left on your account 2025');
    await expect(page.getByTestId('cash-flow')).toHaveText('−3 580,00 €');
    await expect(page.getByTestId('cash-flow')).toHaveClass(/neg/);
    await expect(hero(page)).toContainText('800 €Rent');
    await expect(hero(page)).toContainText('200 €Costs');
    await expect(hero(page)).toContainText('180 €Tax');
  });

  test('works the cash flow out from the rent to the account, and draws money in against money out', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const cash = region(page, 'Cash flow 2025');
    await expect(cash).toContainText('You paid 3 580,00 € more than the rent brought in.');
    await expect(cash.locator('.io-head')).toHaveText(['Money in800,00 €', 'Money out4 380,00 €']);
    // One scale, set by the longer bar: the costs and the tax are thin slivers, the repayment most of it, hollow.
    expect(await parts(cash, 0)).toEqual([['in', 18.3]]);
    expect(await parts(cash, 1)).toEqual([
      ['out', 4.6],
      ['quiet', 4.1],
      ['loan', 91.3],
    ]);
    await expect(cash.locator('.kv')).toHaveText([
      'Rent received800,00 €',
      'Costs−200,00 €',
      'Profit before tax600,00 €',
      'Estimated tax−180,00 €',
      'Profit after tax420,00 €',
      'Loan repaid−4 000,00 €',
      'Left on your account−3 580,00 €',
      'Loan left at the end of 202574 000,00 €',
    ]);
    // Taxed on exactly the profit: nothing to explain.
    await expect(cash.getByRole('button', { name: 'About this year’s tax' })).toHaveCount(0);
  });

  test('follows the account through the year, a month in words when it is pointed at or focused', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const months = region(page, 'Month by month 2025');
    await expect(months.locator('.io-head')).toHaveText('On your account since January−3 580,00 €');
    const monthsInfo = await openInfo(page, months.getByRole('button', { name: 'About the months' }));
    await expect(monthsInfo).toContainText('The tax and the loan repayment are spread evenly over the months.');
    await page.keyboard.press('Escape');
    const readout = months.locator('.cum-readout');
    await expect(readout).toHaveText('Point at or tap a month to see it.');
    await expect(months.locator('.cum-dot')).toHaveCount(0);

    // January: the rent in; out a twelfth of the 180 € tax and of the 4 000 € repaid.
    const january = months.getByRole('button', { name: /^January 2025/ });
    await expect(january).toHaveAccessibleName('January 2025: in 800,00 €, out 348,33 €. On your account since January: 451,67 €.');
    await january.hover();
    await expect(readout).toHaveText('January 2025: in 800,00 €, out 348,33 €. On your account since January: 451,67 €.');
    await expect(months.locator('.cum-dot')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(readout).toHaveText('Point at or tap a month to see it.');

    // March, from the keyboard: the 200 € repair, and the account already below zero.
    await months.getByRole('button', { name: /^March 2025/ }).focus();
    await expect(readout).toHaveText('March 2025: in 0,00 €, out 548,33 €. On your account since January: −445,00 €.');
    await months.getByRole('button', { name: /^March 2025/ }).blur();
    await expect(readout).toHaveText('Point at or tap a month to see it.');
    await expect(months.getByRole('button', { name: /^[A-Z][a-z]+ 2025: / })).toHaveCount(12);
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

      const months = region(page, 'Månad för månad 2025');
      await months.getByRole('button', { name: /^Januari 2025/ }).focus();
      await expect(months.locator('.cum-readout')).toHaveText(
        'Januari 2025: in 800,00 €, ut 348,33 €. På kontot sedan januari: 451,67 €.',
      );
    });
  });

  test('compares the years by what was left, or by the profit, with the year looked at marked', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const years = region(page, 'Year by year');
    await expect(years.getByRole('radio', { name: 'Left on your account' })).toBeChecked();
    await expect(years.locator('.pc-labels li')).toHaveText(['2024−1 440 €', '2025−3 580 €']);
    await expect(years.locator('.pc-labels li.now')).toHaveText('2025−3 580 €');
    await expect(years.locator('.pc-col i').first()).toHaveClass(/down/);
    await expect(years.locator('.kv')).toHaveText('In all 2024–2025−5 020,00 €');

    await years.getByRole('radio', { name: 'Profit after tax' }).click();

    await expect(years.locator('.pc-labels li')).toHaveText(['2024560 €', '2025420 €']);
    await expect(years.locator('.pc-col i').first()).not.toHaveClass(/down/);
    await expect(years.locator('.kv')).toHaveText('In all 2024–2025980,00 €');
  });

  test('shows what you own beside the bank, and the loan shrinking year by year', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const own = region(page, 'What you own');
    // The amounts are on the page; the sentence that puts them together is behind the "i".
    await expect(own).not.toContainText('Your part is worth');
    const ownInfo = await openInfo(page, own.getByRole('button', { name: 'About what you own' }));
    await expect(ownInfo).toHaveText(
      'Your part is worth about 110 000,00 €, as you estimated it. Of that, 36 000,00 € is yours and 74 000,00 € is still the bank’s.',
    );
    await expect(own.locator('.legend')).toHaveText('Yours 36 000,00 €The bank’s 74 000,00 €');
    expect(await own.locator('.equity i.quiet').evaluate((e) => (e as HTMLElement).style.width)).toBe('67.3%');
    await expect(own).toContainText('Your loan has gone from 80 000,00 € to 74 000,00 €.');
    await expect(own.locator('.pc-labels li')).toHaveText(['Bought80 000 €', '202478 000 €', '202574 000 €']);
  });

  test('keeps the ratios and the full account since the purchase further down', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, bought);
    await openInvestment(page);

    const ratios = region(page, 'Key figures 2025');
    await expect(ratios).not.toContainText('For comparing');
    const ratiosInfo = await openInfo(page, ratios.getByRole('button', { name: 'About the key figures' }));
    await expect(ratiosInfo).toHaveText('For comparing the apartment with other investments.');
    await page.keyboard.press('Escape');
    await expect(ratios).toContainText('0,8 %Gross yield');
    await expect(ratios).toContainText('0,6 %Return before tax');
    await expect(ratios).toContainText('1,9 %Return on equity');
    await expect(ratios).toContainText('67,3 %Loan to value');

    const since = region(page, 'Since you bought it');
    await expect(since).toContainText('Invested (price and acquisition costs)102 000,00 €');
    await expect(since).toContainText('Loan at the purchase−80 000,00 €');
    await expect(since).toContainText('Your own money put in22 000,00 €');
    await expect(since).toContainText('Profit after tax, in all980,00 €');
    await expect(since).toContainText('Loan repaid, in all6 000,00 €');
    await expect(since).toContainText('Left on your account, in all−5 020,00 €');
    await expect(since).toContainText('Estimated value now110 000,00 €');
    await expect(since).toContainText('Change in value10 000,00 €');
    await expect(since).toContainText('Your equity now36 000,00 €');
    await expect(since).toContainText('Total return8 980,00 €');

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

    await expect(hero(page)).toContainText('Your loss after tax 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('−2 910,00 €');
    await expect(page.getByTestId('net-profit')).toHaveClass(/neg/);

    const cash = region(page, 'Cash flow 2025');
    await expect(cash).toContainText('You paid 2 910,00 € more than the rent brought in.');
    await expect(cash.locator('.io-head')).toHaveText(['Money in90,00 €', 'Money out3 000,00 €']);
    // The credit comes in, grey like the tax it comes from; no rent, so no green.
    expect(await parts(cash, 0)).toEqual([['quiet', 3]]);
    await expect(cash).toContainText('Basic improvements and furniture−3 000,00 €');
    await expect(cash).toContainText('Estimated deficit credit90,00 €');
    await expect(cash).not.toContainText('Estimated tax');
    // The why is behind the "i" beside the tax, not spelled out on the page.
    await expect(cash).not.toContainText('Why is the tax');
    const cashInfo = await openInfo(page, cash.getByRole('button', { name: 'About this year’s tax' }));
    await expect(cashInfo).toHaveText(
      'Why is the tax this size? It is worked out on −300,00 €, not on the profit before tax: 2 700,00 € of this year’s costs is deducted only in later years (a basic improvement over up to ten years, an expensive piece of furniture a quarter a year), or not at all. Those later deductions lower your tax in the years to come.',
    );
    // Nothing to repay, no balance to show.
    await expect(cash).not.toContainText('Loan left');

    const years = region(page, 'Year by year');
    await expect(years.locator('.pc-labels li')).toHaveText(['2024350 €', '2025−2 910 €']);
    await expect(years.locator('.pc-col i').nth(1)).toHaveClass(/down/);

    // Without a price, a loan or a value there is nothing to divide by, and nothing to say about them.
    await expect(region(page, 'Key figures 2025').getByText('—', { exact: true })).toHaveCount(4);
    await expect(region(page, 'What you own')).toHaveCount(0);
    const since = region(page, 'Since you bought it');
    await expect(since).not.toContainText('Loan at the purchase');
    await expect(since).not.toContainText('Total return');
    await expect(since).toContainText('Add the estimated value below to see more.');
    await expect(form(page).getByText('Saved', { exact: true })).toHaveCount(0);
  });

  test('explains a tax smaller than the profit: part of an earlier improvement is deducted this year', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat' },
      {
        rents: [{ month: '2025-01', status: 'paid', amount: 1000, receivedDate: '2025-01-02', note: '' }],
        costs: [{ id: 'c1', date: '2024-04-01', category: 'improvement', description: '', amount: 1000, hasReceipt: false }],
      },
    );
    await openInvestment(page);

    const cash = region(page, 'Cash flow 2025');
    await expect(cash).toContainText('730,00 € was left on your account.');
    const cashInfo = await openInfo(page, cash.getByRole('button', { name: 'About this year’s tax' }));
    await expect(cashInfo).toHaveText(
      'Why is the tax this small? It is worked out on 900,00 €, less than the profit before tax: 100,00 € is this year’s part of earlier improvements, furniture or depreciation, deducted although no money left your account for it this year.',
    );
  });

  test('shows only the year’s money for an apartment with nothing logged yet', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await openInvestment(page);

    await expect(hero(page)).toContainText('Your profit after tax 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('0,00 €');
    await expect(page.getByTestId('cash-flow')).toHaveText('0,00 €');
    await expect(region(page, 'Cash flow 2025').locator('.io-bar i')).toHaveCount(0);
    await expect(region(page, 'Month by month 2025').locator('.io-head')).toHaveText('On your account since January0,00 €');
    await expect(region(page, 'Year by year')).toHaveCount(0);
    await expect(region(page, 'What you own')).toHaveCount(0);
    await expect(page.getByLabel('Loan at the purchase (€)')).toHaveValue('');
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
    await expect(region(page, 'Cash flow 2025')).toContainText('Loan repaid−3 000,00 €');
    await expect(region(page, 'Cash flow 2025')).toContainText('Loan left at the end of 202577 000,50 €');
    await expect(region(page, 'Since you bought it')).toContainText('Estimated value now120 000,00 €');

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
    // A loan but no value: the loan's years, and no split of a value nobody gave.
    const own = region(page, 'What you own');
    await expect(own).toContainText('Your loan has gone from 80 000,00 € to 79 000,00 €.');
    await expect(own.locator('.equity')).toHaveCount(0);
    await expect(own.getByRole('button', { name: 'About what you own' })).toHaveCount(0);

    for (const label of ['Loan at the purchase (€)', 'Repaid in 2025 (€)', 'Loan left 31.12.2025 (€)']) {
      await page.getByLabel(label).fill('');
    }
    await save(page).click();

    // The balance goes from the page only once both are saved and read back. The button is no sign:
    // it is disabled while saving as well as once there is nothing left to save.
    await expect(region(page, 'Cash flow 2025')).not.toContainText('Loan left');
    await expect(own).toHaveCount(0);
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
    await expect(region(page, 'Cash flow 2025')).toContainText('Loan left at the end of 202550 000,00 €');

    // 2024 is offered only because the loan has a statement for it.
    await page.getByLabel('Tax year').selectOption('2024');

    await expect(page.getByLabel('Repaid in 2024 (€)')).toHaveValue('1000');
    await expect(page.getByLabel('Loan left 31.12.2024 (€)')).toHaveValue('50000');
    await expect(region(page, 'Cash flow 2024')).toContainText('Loan repaid−1 000,00 €');

    await page.getByLabel('Repaid in 2024 (€)').fill('1200');
    await page.getByLabel('Tax year').selectOption('2025');
    // Typed but not saved, for another year: gone, not carried over.
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('');

    // A year still to come has its statement, but no months behind it yet.
    await page.getByLabel('Tax year').selectOption('2026');
    await expect(page.getByLabel('Repaid in 2026 (€)')).toHaveValue('500');
    await expect(region(page, 'Cash flow 2026')).toBeVisible();
    await expect(region(page, 'Month by month 2026')).toHaveCount(0);
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
