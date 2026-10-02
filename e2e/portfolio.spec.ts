import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';

const alert = (page: import('@playwright/test').Page) => page.locator('.alert[role=alert]');

test.describe('the portfolio', () => {
  test('starts empty and adds the first apartment, then opens it', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByText('No apartments yet.')).toBeVisible();
    // Other tabs have nothing to show until there is an apartment.
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(page.getByText('Add an apartment on the Portfolio tab first.')).toBeVisible();
    await page.getByRole('button', { name: 'Portfolio' }).click();

    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
    await page.getByLabel('New apartment').fill('  Rantatie 5  ');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByRole('heading', { name: 'Rantatie 5' })).toBeVisible();
    expect(api.callsTo('POST /api/apartments')[0]!.body).toEqual({ name: 'Rantatie 5' });
  });

  test('says why an apartment could not be added', async ({ page, api }) => {
    api.failNext('POST', /^\/api\/apartments$/, { status: 400, body: { error: 'name: Give the apartment a name' } });
    await page.goto('/');
    await page.getByLabel('New apartment').fill('x');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(alert(page)).toHaveText('name: Give the apartment a name');
  });

  test("lists each apartment with the viewer's share and adds up their part of the year", async ({ page, api }) => {
    coOwned(api);
    api.addApartment({ name: 'Rantatie 5' }, ledger());
    await page.goto('/');

    const rows = page.locator('.list li');
    await expect(rows.nth(0)).toContainText('Kauppakatu 12');
    await expect(rows.nth(0)).toContainText('You own 60 % · 2 owners · Kauppakatu 12 B 7, Vaasa');
    await expect(rows.nth(1)).toContainText('You own 100 %');
    // Rent 2 400 − 216 deductible − 2 500 depreciation = −316; 60 % = −189,60. Second flat: 2 400 − 216 = 2 184.
    await expect(rows.nth(0)).toContainText('−189,60 €');
    await expect(rows.nth(1)).toContainText('2 184,00 €');
    const card = page.locator('.card').filter({ hasText: `Your share of the portfolio in ${YEAR}` });
    await expect(card).toContainText('3 840,00 €'); // 1 440 + 2 400 rent
    await expect(card).toContainText('1 994,40 €'); // net
    await expect(card).toContainText('598,32 €'); // 30 % of the total, not apartment by apartment
  });

  test('leaves out an apartment whose details failed to load, but keeps it listed', async ({ page, api }) => {
    const broken = api.addApartment({ name: 'Flaky' });
    api.failNext('GET', new RegExp(`/api/apartments/${broken.id}$`), { status: 500 });
    await page.goto('/');

    await expect(page.locator('.list li')).toContainText('Flaky');
    await expect(page.locator('.list li .pos, .list li .neg')).toHaveCount(0);
  });

  test('shows why the portfolio could not be loaded', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/apartments$/, { status: 500, body: { error: 'Database unavailable' } });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Database unavailable');
    await expect(page.getByText('Loading…')).toHaveCount(0);
  });

  test('explains a server that answers without saying why', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/profile$/, { status: 502, text: 'Bad gateway' });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Request failed (502)');
  });

  test('says when the server cannot be reached at all', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/me$/, { abort: true });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Could not reach the server. Check your connection and try again.');
  });
});

test.describe('the account card', () => {
  test("saves the viewer's name for declarations, and only when it changed", async ({ page, api }) => {
    await page.goto('/');
    const save = page.locator('.card').filter({ hasText: 'Account' }).getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await page.getByLabel('Your name on declarations').fill('Aino Aalto ');
    await save.click();

    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(save).toBeDisabled();
    expect(api.profile).toEqual({ taxpayerName: 'Aino Aalto' });
  });

  test('says why the name could not be saved', async ({ page, api }) => {
    api.failNext('PUT', /^\/api\/profile$/, { status: 400, body: { error: 'taxpayerName: Too long' } });
    await page.goto('/');
    await page.getByLabel('Your name on declarations').fill('x');
    await page.locator('.card').filter({ hasText: 'Account' }).getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('taxpayerName: Too long');
  });
});

test.describe('importing a backup from the first version', () => {
  const backup = (receipts: Record<string, string>, taxpayerName = 'Old Name') =>
    Buffer.from(
      JSON.stringify({
        version: 1,
        db: {
          settings: { taxpayerName, propertyName: 'Imported flat', purchasePrice: 90000 },
          rents: [{ id: 'r', month: m(1), status: 'paid', amount: 700, receivedDate: `${m(1)}-03`, note: '' }],
          costs: [
            { id: 'old1', date: `${m(2)}-01`, category: 'repairs', description: 'Door', amount: 50, hasReceipt: true },
            { id: 'old2', date: `${m(2)}-02`, category: 'insurance', description: 'Policy', amount: 90, hasReceipt: true },
          ],
        },
        receipts,
      }),
    );
  const jpeg = `data:image/jpeg;base64,${readFileSync(`${__dirname}/receipt.jpg`).toString('base64')}`;

  test('creates the apartment with its photos, and takes the name when none is set', async ({ page, api }) => {
    await page.goto('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import backup (.json)' }).click()]);
    await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup({ old1: jpeg, old2: jpeg }) });

    await expect(page.getByText('Imported “Imported flat” as a new apartment.')).toBeVisible();
    await expect(page.locator('.list li')).toContainText('Imported flat');
    await expect(page.getByLabel('Your name on declarations')).toHaveValue('Old Name');
    expect(api.callsTo('PUT /api/apartments/').filter((c) => c.call.endsWith('/receipt'))).toHaveLength(2);
  });

  test('keeps an existing name, and counts photos that failed to upload', async ({ page, api }) => {
    api.profile = { taxpayerName: 'Current Name' };
    api.failNext('PUT', /\/receipt$/, { status: 400, body: { error: 'Not a JPEG, PNG or WebP image' } });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup({ old1: jpeg, old2: jpeg }) });

    await expect(page.getByText('Imported “Imported flat” as a new apartment, but 1 receipt photo(s) could not be uploaded.')).toBeVisible();
    await expect(page.getByLabel('Your name on declarations')).toHaveValue('Current Name');
    expect(api.profile).toEqual({ taxpayerName: 'Current Name' });
  });

  test('says when the portfolio could not be refreshed after an import', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByText('No apartments yet.')).toBeVisible();
    api.failNext('GET', /^\/api\/apartments$/, { status: 503, body: { error: 'Try again shortly' } });
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup({}) });

    await expect(alert(page)).toHaveText('Try again shortly');
    expect(api.apartments.size).toBe(1);
  });

  test('refuses a file that is not a backup, and creates nothing', async ({ page, api }) => {
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });

    await expect(alert(page)).toHaveText('Import failed: Not a Rental Tracker backup file');
    expect(api.apartments.size).toBe(0);
  });

  test('does nothing when the file picker is closed without a file', async ({ page, api }) => {
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles([]);
    await expect(page.getByText('No apartments yet.')).toBeVisible();
    expect(api.calls).toEqual([]);
  });
});
