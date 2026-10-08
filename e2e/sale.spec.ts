import { expect, test } from './fixtures';
import { ME } from './fakeApi';
import { alert, section } from './nav';

/** A flat bought in March 2018 for 100 000 €, with the sale details left to the test. */
const BOUGHT = { name: 'Flat', purchaseDate: '2018-03-01', purchasePrice: 100000 };

const hero = (page: import('@playwright/test').Page) => page.locator('.hero');
type Page = import('@playwright/test').Page;
/** The card of a method, which names itself in bold. */
const card = (page: Page, title: string) => page.locator('.card', { hasText: title });
/** A section by its heading. */
const section_ = (page: Page, heading: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });

async function enterSale(page: import('@playwright/test').Page, sale: { date: string; price: string; costs?: string }) {
  await page.getByLabel('Sale date').fill(sale.date);
  await page.getByLabel('Selling price (€)').fill(sale.price);
  if (sale.costs) await page.getByLabel('Costs of selling (€)').fill(sale.costs);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test.describe('selling the apartment', () => {
  test('asks for the sale first, and keeps Save off until there is a date and a price', async ({ page, api }) => {
    api.addApartment(BOUGHT);
    await page.goto('/');
    await section(page, 'Sale');

    await expect(hero(page)).toContainText('No sale entered');
    await expect(hero(page)).toContainText('Enter the sale below to see the gain and the tax on it.');
    await expect(page.getByText('Nothing listed yet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Two ways to count the gain' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove the sale' })).toHaveCount(0);

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('Sale date').fill('2025-06-15');
    await expect(save).toBeDisabled();
    await page.getByLabel('Selling price (€)').fill('160000');
    await expect(save).toBeEnabled();
    await page.getByLabel('Sale date').fill('');
    await expect(save).toBeDisabled();
  });

  test('works out the gain by the actual costs, with the acquisition costs listed, and the tax on it', async ({ page, api }) => {
    const apt = api.addApartment(BOUGHT, {
      acquisitionCosts: [
        { id: 'a1', date: '2018-03-02', kind: 'transfer_tax', description: '', amount: 900 },
        { id: 'a2', date: '2025-02-10', kind: 'inspection', description: 'Fuktmätning', amount: 300 },
      ],
    });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-06-15', price: '160000', costs: '4000' });

    expect(api.callsTo('PATCH')).toEqual([
      { call: `PATCH /api/apartments/${apt.id}`, body: { saleDate: '2025-06-15', salePrice: 160000, saleCosts: 4000 } },
    ]);
    // 160 000 − 100 000 − 900 − 300 − 4 000 = 54 800; tax 30 % of 30 000 and 34 % of 24 800.
    await expect(hero(page)).toContainText('Your gain from the sale');
    await expect(hero(page)).toContainText('54 800,00 €');
    await expect(hero(page)).toContainText('Estimated tax 17 432,00 €');

    const actual = card(page, 'Actual costs');
    await expect(actual).toContainText('Better for you');
    await expect(actual).toContainText('Purchase price−100 000,00 €');
    await expect(actual).toContainText('Transfer tax−900,00 €');
    await expect(actual).toContainText('Inspection or survey−300,00 €');
    await expect(actual).toContainText('Costs of selling−4 000,00 €');
    await expect(actual).toContainText('Gain on the whole apartment54 800,00 €');
    await expect(actual).not.toContainText('Building depreciation');

    const assumed = card(page, 'Assumed acquisition cost');
    await expect(assumed).not.toContainText('Better for you');
    await expect(assumed).toContainText('20 % of the selling price−32 000,00 €');
    await expect(assumed).toContainText('Gain on the whole apartment128 000,00 €');
    await expect(page.getByText('Owned for 7 years.')).toBeVisible();
  });

  test('prefers the assumed cost of 40 % when the flat has been owned ten years and its real costs are small', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchaseDate: '2012-05-01', purchasePrice: 10000 });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-05-01', price: '80000' });

    await expect(card(page, 'Assumed acquisition cost')).toContainText('Better for you');
    await expect(card(page, 'Actual costs')).not.toContainText('Better for you');
    await expect(card(page, 'Assumed acquisition cost')).toContainText('40 % of the selling price−32 000,00 €');
    await expect(hero(page)).toContainText('48 000,00 €');
    await expect(hero(page)).toContainText('Estimated tax 15 120,00 €');
    await expect(page.getByText('Owned for 13 years.')).toBeVisible();
  });

  test('assumes 20 % and says so when the purchase date is missing', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchasePrice: 10000 });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-05-01', price: '80000' });

    await expect(page.getByText('No purchase date in the apartment settings, so 20 % is assumed.')).toBeVisible();
    await expect(card(page, 'Assumed acquisition cost')).toContainText('20 % of the selling price−16 000,00 €');
  });

  test('raises the part of the gain taxed at 34 % with the other capital income of the year', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchaseDate: '2012-05-01', purchasePrice: 10000 });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-05-01', price: '80000' });
    await expect(hero(page)).toContainText('Estimated tax 15 120,00 €');

    await page.getByLabel('Your other capital income that year (€)').fill('20000');

    await expect(hero(page)).toContainText('Estimated tax 15 920,00 €');
    await expect(section_(page, 'Your tax')).toContainText('Tax on the gain15 920,00 €');
  });

  test('makes the sale of a home lived in for two years tax-free, and still tells you to report it', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchaseDate: '2018-03-01', purchasePrice: 100000 });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-06-15', price: '160000' });
    await expect(hero(page)).toContainText('Estimated tax');

    await page.getByRole('switch', { name: 'It was my permanent home for 2 years' }).click();

    await expect(hero(page).locator('.chip')).toHaveText('tax-free');
    await expect(page.getByText('Tax-free: owned for at least 2 years and lived in. Report the sale in OmaVero anyway.')).toBeVisible();
    await expect(page.getByText('Tax on the gain')).toHaveCount(0);
    await expect(page.getByText('Report the sale in OmaVero in the year it was made')).toBeVisible();
  });

  test('shows a loss as a loss that can be deducted, and not when the home’s gain would have been tax-free', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchaseDate: '2022-01-01', purchasePrice: 200000 });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-01-01', price: '150000' });

    await expect(hero(page)).toContainText('Your loss on the sale');
    await expect(hero(page)).toContainText('−50 000,00 €');
    await expect(hero(page)).toContainText('Estimated tax 0,00 €');
    await expect(page.getByText('A loss is set against your other capital income, and for 5 more years if there is none to take it.')).toBeVisible();

    await page.getByRole('switch', { name: 'It was my permanent home for 2 years' }).click();

    await expect(page.getByText('The loss on a home whose gain would be tax-free cannot be deducted.')).toBeVisible();
    await expect(page.getByText('A loss is set against your other capital income')).toHaveCount(0);
  });

  test('shows only the viewer’s share of the gain and the tax when the apartment has several owners', async ({ page, api }) => {
    api.addApartment(BOUGHT, {
      owners: [
        { ...ME, sharePct: 60 },
        { userId: 'usr_bob', email: 'bob@example.test', sharePct: 40 },
      ],
      mySharePct: 60,
    });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-06-15', price: '160000' });

    // 160 000 − 100 000 = 60 000 for the apartment; 60 % of it is 36 000, taxed 9 000 + 6 000 × 34 %.
    await expect(section_(page, 'Your tax')).toContainText('Your 60 % share of the gain36 000,00 €');
    await expect(hero(page)).toContainText('36 000,00 €');
    await expect(hero(page)).toContainText('Estimated tax 11 040,00 €');
    await expect(card(page, 'Actual costs')).toContainText('Gain on the whole apartment60 000,00 €');
  });

  test('takes the building depreciation already deducted off a property’s cost', async ({ page, api }) => {
    api.addApartment({
      ...BOUGHT,
      propertyType: 'property',
      useDepreciation: true,
      buildingSharePct: 50,
      depreciationRate: 4,
      depreciationFromYear: 2022,
    });
    await page.goto('/');
    await section(page, 'Sale');
    await enterSale(page, { date: '2025-06-15', price: '160000' });

    await expect(card(page, 'Actual costs')).toContainText('Building depreciation already deducted5 763,20 €');
    await expect(card(page, 'Actual costs')).toContainText('Gain on the whole apartment65 763,20 €');
  });

  test('adds, changes and deletes an acquisition cost', async ({ page, api }) => {
    const apt = api.addApartment(BOUGHT);
    await page.goto('/');
    await section(page, 'Sale');

    await page.getByRole('button', { name: 'Add an acquisition cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add an acquisition cost' });
    const save = sheet.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await sheet.getByLabel('Amount (€)').fill('911.25');
    await expect(sheet.getByRole('radio', { name: 'Transfer tax' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('radio', { name: 'Inspection or survey' }).click();
    await sheet.getByLabel('Description').fill(' Fuktmätning ');
    await sheet.getByLabel('Date').fill('2025-02-10');
    await save.click();

    await expect(page.getByRole('button', { name: /Fuktmätning/ })).toContainText('Inspection or survey');
    await expect(page.getByRole('button', { name: /Fuktmätning/ })).toContainText('911,25 €');
    expect(apt.acquisitionCosts).toMatchObject([{ kind: 'inspection', description: 'Fuktmätning', amount: 911.25, date: '2025-02-10' }]);

    await page.getByRole('button', { name: /Fuktmätning/ }).click();
    const edit = page.getByRole('dialog', { name: 'Edit the acquisition cost' });
    await expect(edit.getByLabel('Amount (€)')).toHaveValue('911.25');
    await edit.getByLabel('Amount (€)').fill('300');
    await edit.getByLabel('Description').fill('');
    await edit.getByRole('radio', { name: 'Other', exact: true }).click();
    await edit.getByRole('button', { name: 'Save' }).click();

    // Without a description the list names the kind.
    await expect(page.getByRole('button', { name: /^Other/ })).toContainText('300,00 €');
    expect(apt.acquisitionCosts).toMatchObject([{ kind: 'other', description: '', amount: 300 }]);

    await page.getByRole('button', { name: /^Other/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Nothing listed yet.')).toBeVisible();
    expect(apt.acquisitionCosts).toEqual([]);
  });

  test('keeps the form open and says why when an acquisition cost cannot be saved', async ({ page, api }) => {
    api.addApartment(BOUGHT);
    await page.goto('/');
    await section(page, 'Sale');
    await page.getByRole('button', { name: 'Add an acquisition cost' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Amount (€)').fill('300');
    api.failNext('POST', /\/acquisition$/, { status: 400, body: { error: 'amount: At most two decimals' } });

    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('amount: At most two decimals');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('takes a saved sale back, emptying the form', async ({ page, api }) => {
    const apt = api.addApartment({ ...BOUGHT, saleDate: '2025-06-15', salePrice: 160000, saleCosts: 4000 });
    await page.goto('/');
    await section(page, 'Sale');
    await expect(page.getByLabel('Selling price (€)')).toHaveValue('160000');
    await expect(page.getByLabel('Costs of selling (€)')).toHaveValue('4000');

    await page.getByRole('button', { name: 'Remove the sale' }).click();

    await expect(hero(page)).toContainText('No sale entered');
    await expect(page.getByLabel('Sale date')).toHaveValue('');
    await expect(page.getByLabel('Selling price (€)')).toHaveValue('');
    await expect(page.getByLabel('Costs of selling (€)')).toHaveValue('');
    expect(apt.settings).toMatchObject({ saleDate: '', salePrice: 0, saleCosts: 0 });
  });

  test('says why the sale could not be saved and keeps what was typed', async ({ page, api }) => {
    api.addApartment(BOUGHT);
    await page.goto('/');
    await section(page, 'Sale');
    api.failNext('PATCH', /\/api\/apartments\/[^/]+$/, { status: 400, body: { error: 'salePrice: At most two decimals' } });

    await enterSale(page, { date: '2025-06-15', price: '160000.123' });

    await expect(alert(page)).toHaveText('salePrice: At most two decimals');
    await expect(page.getByLabel('Selling price (€)')).toHaveValue('160000.123');
    await expect(hero(page)).toContainText('No sale entered');
  });
});
