import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';
import { section } from './nav';

const earlier = (years: number) => ({
  rents: [{ month: `${YEAR - years}-06`, status: 'paid' as const, amount: 500, receivedDate: `${YEAR - years}-06-02`, note: '' }],
  costs: [
    { id: 'c-old', date: `${YEAR - years}-07-01`, category: 'repairs' as const, description: 'Old boiler', amount: 120, hasReceipt: false },
  ],
});

test.describe('history', () => {
  test('lists this year and every earlier year with data, newest first, with the combined net income', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', useDepreciation: false }, {
      rents: [...ledger().rents, ...earlier(3).rents],
      costs: [...ledger().costs, ...earlier(3).costs],
    });
    await page.goto('/');
    await section(page, 'History');

    const rows = page.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(String(YEAR));
    await expect(rows.nth(0)).toContainText('Rent 2 400 € · Costs 216 €');
    await expect(rows.nth(1)).toContainText(String(YEAR - 3));
    await expect(rows.nth(1)).toContainText('Rent 500 € · Costs 120 €');
    await expect(rows.nth(1)).toContainText('380,00 €');
    // 2 400 − 216 + 500 − 120
    await expect(page.getByTestId('history-total')).toContainText('2 564,00 €');
    // The year stepper belongs to the other pages; history already shows every year.
    await expect(page.getByLabel('Tax year')).toHaveCount(0);
  });

  test('opens the tax summary of the year that is tapped', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, earlier(2));
    await page.goto('/');
    await section(page, 'History');
    await page.getByRole('button', { name: new RegExp(`^${YEAR - 2}`) }).click();

    await expect(page.getByRole('radio', { name: 'This year', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Tax year')).toHaveValue(String(YEAR - 2));
    await expect(page.locator('.kv').filter({ hasText: 'Rent received' })).toContainText('500,00 €');
  });

  test('shows a year with more costs than rent as a loss, and counts it against the total', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, {
      rents: [],
      costs: [{ id: 'c-roof', date: `${YEAR - 1}-05-05`, category: 'repairs', description: 'Roof', amount: 300, hasReceipt: false }],
    });
    await page.goto('/');
    await section(page, 'History');

    await expect(page.getByRole('listitem').nth(1)).toContainText('−300,00 €');
    await expect(page.getByTestId('history-total')).toHaveClass(/neg/);
  });

  test('shows years that net out to nothing as a total of zero, not as a loss of a fraction of a cent', async ({ page, api }) => {
    // 0,30 − 0,20 − 0,10 is 0 on paper but −2.8e-17 added up as floating point numbers.
    api.addApartment({ name: 'Flat' }, {
      rents: [{ month: m(1), status: 'paid', amount: 0.3, receivedDate: `${m(1)}-03`, note: '' }],
      costs: [
        { id: 'c-a', date: `${YEAR - 1}-05-05`, category: 'repairs', description: '', amount: 0.2, hasReceipt: false },
        { id: 'c-b', date: `${YEAR - 2}-05-05`, category: 'repairs', description: '', amount: 0.1, hasReceipt: false },
      ],
    });
    await page.goto('/');
    await section(page, 'History');

    await expect(page.getByTestId('history-total')).toHaveText('0,00 €');
    await expect(page.getByTestId('history-total')).not.toHaveClass(/neg/);
  });

  test('switches between your share and the whole apartment for a co-owned apartment', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await section(page, 'History');

    const thisYear = page.getByRole('listitem').first();
    await expect(thisYear).toContainText('Rent 1 440 €');
    await page.getByRole('radio', { name: 'Whole apartment' }).click();
    await expect(thisYear).toContainText('Rent 2 400 €');
  });

  test('says earlier years will show up once they have data', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'History');

    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByText('Earlier years appear here once you log rent or costs in them.')).toBeVisible();
  });
});
