import { expect, test } from './fixtures';
import { alert, section } from './nav';

type Page = import('@playwright/test').Page;

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

test.describe('the apartment as your investment', () => {
  test('shows the year’s profit before and after tax, the cash flow, the ratios and everything since the purchase', async ({ page, api }) => {
    // Bought in June 2024 for 100 000 € with 80 000 € of loan and 2 000 € of
    // acquisition costs; worth 110 000 € now. 800 € of rent each year, and a
    // 200 € repair in 2025.
    api.addApartment(
      { name: 'Flat' },
      {
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
        rents: [
          { month: '2024-07', status: 'paid', amount: 800, receivedDate: '2024-07-02', note: '' },
          { month: '2025-01', status: 'paid', amount: 800, receivedDate: '2025-01-02', note: '' },
        ],
        costs: [{ id: 'c1', date: '2025-03-01', category: 'repairs', description: '', amount: 200, hasReceipt: false }],
      },
    );
    await openInvestment(page);

    await expect(hero(page)).toContainText('Your net profit 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('420,00 €');
    await expect(page.getByTestId('net-profit')).not.toHaveClass(/neg/);
    await expect(hero(page)).toContainText('600 €Before tax');
    await expect(hero(page)).toContainText('180 €Tax');
    await expect(hero(page)).toContainText('−3 580 €Left over');

    const flow = region(page, 'From rent to your account 2025');
    await expect(flow.locator('.flow-row')).toHaveText([
      'Rent received800,00 €',
      'Costs−200,00 €',
      'Profit before tax600,00 €',
      'Estimated tax−180,00 €',
      'Net profit after tax420,00 €',
      'Loan repaid−4 000,00 €',
      'Left on your account−3 580,00 €',
    ]);
    await expect(flow).not.toContainText('Basic improvements');
    await expect(flow).toContainText('Loan left at the end of 202574 000,00 €');
    // Money in is green, money out yellow, the loan grey and each result ink.
    const bars = flow.locator('.flow-bar');
    expect(await bars.evaluateAll((els) => els.map((e) => e.className.replace('flow-bar ', '')))).toEqual([
      'in',
      'out',
      'total',
      'out',
      'total',
      'quiet',
      'total',
    ]);
    // One scale from −3 580 to 800: the rent starts at zero, and what was left ends there.
    const zero = await flow.locator('.flow-zero').first().evaluate((e) => (e as HTMLElement).style.left);
    expect(parseFloat(zero)).toBeCloseTo(81.74, 1);
    expect(await bars.first().evaluate((e) => (e as HTMLElement).style.left)).toBe(zero);
    expect(await bars.last().evaluate((e) => [(e as HTMLElement).style.left, (e as HTMLElement).style.width])).toEqual(['0%', zero]);

    const ratios = region(page, 'Key figures 2025');
    await expect(ratios).toContainText('0,8 %Gross yield');
    await expect(ratios).toContainText('0,6 %Return before tax');
    await expect(ratios).toContainText('1,9 %Return on equity');
    await expect(ratios).toContainText('67,3 %Loan to value');

    const since = region(page, 'Since you bought it');
    await expect(since).toContainText('Invested (price and acquisition costs)102 000,00 €');
    await expect(since).toContainText('Loan at the purchase−80 000,00 €');
    await expect(since).toContainText('Your own money put in22 000,00 €');
    await expect(since).toContainText('Net profit after tax, in all980,00 €');
    await expect(since).toContainText('Loan repaid, in all6 000,00 €');
    await expect(since).toContainText('Left on your account, in all−5 020,00 €');
    await expect(since).toContainText('Estimated value now110 000,00 €');
    await expect(since).toContainText('Change in value10 000,00 €');
    await expect(since).toContainText('Your equity now36 000,00 €');
    await expect(since).toContainText('Total return8 980,00 €');
    // The value split into what is still the bank's and what is yours.
    await expect(since).toContainText('Loan 74 000,00 €');
    await expect(since).toContainText('Your equity 36 000,00 €');
    expect(await since.locator('.equity i.quiet').evaluate((e) => (e as HTMLElement).style.width)).toBe('67.3%');

    // Newest first.
    const years = region(page, 'By year').getByRole('listitem');
    await expect(years).toHaveCount(2);
    await expect(years.nth(0)).toHaveText('2025Left on your account −3 580,00 €420,00 €');
    await expect(years.nth(1)).toHaveText('2024Left on your account −1 440,00 €560,00 €');
    // Oldest first in the chart, each column telling its figures on hover; what was left in 2024 hangs below zero.
    const columns = region(page, 'By year').locator('.yc-col');
    await expect(columns).toHaveCount(2);
    await expect(columns.nth(0)).toHaveAttribute('title', /^2024: net profit 560,00\s€, left on your account −1\s440,00\s€$/);
    await expect(columns.nth(1)).toHaveAttribute('title', /^2025: net profit 420,00\s€, left on your account −3\s580,00\s€$/);
    await expect(columns.nth(0).locator('i.quiet')).toHaveClass(/down/);
    await expect(columns.nth(0).locator('i.net')).not.toHaveClass(/down/);
    await expect(region(page, 'By year').locator('.yc-labels')).toHaveText('20242025');

    await expect(page.getByLabel('Loan at the purchase (€)')).toHaveValue('80000');
    await expect(page.getByLabel('Estimated value now (€)')).toHaveValue('110000');
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('4000');
    await expect(page.getByLabel('Loan left 31.12.2025 (€)')).toHaveValue('74000');
    await expect(form(page).getByText('Saved', { exact: true })).toBeVisible();
    await expect(save(page)).toBeDisabled();
  });

  test('counts an improvement in full in the year paid, and adds back the deficit credit of a loss', async ({ page, api }) => {
    // No rent: the tax deducts a tenth of the 3 000 €, a 300 € deficit, and credits 30 % of it.
    api.addApartment(
      { name: 'Flat' },
      { costs: [{ id: 'c1', date: '2025-04-01', category: 'improvement', description: '', amount: 3000, hasReceipt: false }] },
    );
    await openInvestment(page);

    await expect(hero(page)).toContainText('Your net loss 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('−2 910,00 €');
    await expect(page.getByTestId('net-profit')).toHaveClass(/neg/);

    const flow = region(page, 'From rent to your account 2025');
    await expect(flow).toContainText('Basic improvements and furniture−3 000,00 €');
    await expect(flow).toContainText('Profit before tax−3 000,00 €');
    await expect(flow).toContainText('Estimated deficit credit90,00 €');
    await expect(flow).not.toContainText('Estimated tax');
    // The credit comes in, so it is drawn green like the rent.
    await expect(flow.locator('.flow-row', { hasText: 'Estimated deficit credit' }).locator('.flow-bar')).toHaveClass(/\bin\b/);

    // Without a price, a loan or a value there is nothing to divide by.
    await expect(region(page, 'Key figures 2025').getByText('—', { exact: true })).toHaveCount(4);
    await expect(region(page, 'From rent to your account 2025')).not.toContainText('Loan left');
    const since = region(page, 'Since you bought it');
    await expect(since).not.toContainText('Loan at the purchase');
    await expect(since).not.toContainText('Total return');
    await expect(since.locator('.equity')).toHaveCount(0);
    await expect(since).toContainText('Enter the estimated value below to see the change in value, your equity and the total return.');
    await expect(region(page, 'By year').getByRole('listitem')).toHaveCount(1);
    await expect(form(page).getByText('Saved', { exact: true })).toHaveCount(0);
  });

  test('has no years to list for an apartment with nothing logged yet', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await openInvestment(page);

    await expect(hero(page)).toContainText('Your net profit 2025');
    await expect(page.getByTestId('net-profit')).toHaveText('0,00 €');
    await expect(region(page, 'By year')).toHaveCount(0);
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
    await expect(region(page, 'From rent to your account 2025')).toContainText('Loan repaid−3 000,00 €');
    await expect(region(page, 'From rent to your account 2025')).toContainText('Loan left at the end of 202577 000,50 €');
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

    for (const label of ['Loan at the purchase (€)', 'Repaid in 2025 (€)', 'Loan left 31.12.2025 (€)']) {
      await page.getByLabel(label).fill('');
    }
    await expect(region(page, 'From rent to your account 2025')).toContainText('Loan left at the end of 2025');
    await save(page).click();

    // The balance goes from the page only once both are saved and read back. The button is no sign:
    // it is disabled while saving as well as once there is nothing left to save.
    await expect(region(page, 'From rent to your account 2025')).not.toContainText('Loan left');
    await expect(save(page)).toBeDisabled();
    await expect(form(page).getByText('Saved', { exact: true })).toHaveCount(0);
    expect(apt.myInvestment).toBeNull();
    expect(apt.myLoanYears).toEqual([]);
  });

  test('keeps each year’s statement to its year, and carries the last balance into a year without one', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { myLoanYears: [{ year: 2024, amortization: 1000, balance: 50000 }] });
    await openInvestment(page);
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('');
    await expect(region(page, 'From rent to your account 2025')).toContainText('Loan left at the end of 202550 000,00 €');

    // 2024 is offered only because the loan has a statement for it.
    await page.getByLabel('Tax year').selectOption('2024');

    await expect(page.getByLabel('Repaid in 2024 (€)')).toHaveValue('1000');
    await expect(page.getByLabel('Loan left 31.12.2024 (€)')).toHaveValue('50000');
    await expect(region(page, 'From rent to your account 2024')).toContainText('Loan repaid−1 000,00 €');

    await page.getByLabel('Repaid in 2024 (€)').fill('1200');
    await page.getByLabel('Tax year').selectOption('2025');
    // Typed but not saved, for another year: gone, not carried over.
    await expect(page.getByLabel('Repaid in 2025 (€)')).toHaveValue('');
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
