import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';

const alert = (page: import('@playwright/test').Page) => page.locator('.alert[role=alert]');
const tab = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true }).click();

test.describe('an apartment overview', () => {
  test("shows a co-owned apartment's totals and the viewer's share of them", async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await page.getByText('Kauppakatu 12', { exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Kauppakatu 12' })).toBeVisible();
    await expect(page.getByText('Kauppakatu 12 B 7, Vaasa')).toBeVisible();
    const whole = page.locator('.card').filter({ hasText: 'Whole apartment' });
    await expect(whole).toContainText('2 400,00 €');
    await expect(whole).toContainText('−316,00 €');
    const mine = page.locator('.card').filter({ hasText: 'Your share · 60 %' });
    await expect(mine).toContainText('−189,60 €');
    await expect(mine).toContainText('Owned with 2 others (1 invited, not joined yet)');
    await expect(page.getByText('3 paid · 1 vacant')).toBeVisible();
    await expect(page.getByText('Gross yield · net 2.2%')).toBeVisible();
    // Most recent first: April's vacancy, then March's costs.
    await expect(page.locator('.list li').first()).toContainText(`Vacant ${m(4)}`);
    await expect(page.locator('.list li').nth(1)).toContainText('Rahoitusvastike');

    await mine.click();
    await expect(page.getByRole('heading', { name: 'Apartment settings' })).toBeVisible();
  });

  test('shows a sole-owned apartment with the tax estimate and no share card', async ({ page, api }) => {
    api.addApartment({ name: 'Solo', purchasePrice: 50000 }, { rents: [{ month: m(1), status: 'unpaid', amount: 0, receivedDate: '', note: '' }] });
    await page.goto('/');
    await page.getByText('Solo', { exact: true }).click();

    await expect(page.getByText('Est. tax', { exact: true })).toBeVisible();
    await expect(page.getByText(/Your share ·/)).toHaveCount(0);
    await expect(page.getByText('0 paid · 0 vacant · 1 unpaid')).toBeVisible();
    await expect(page.getByText('Unpaid ' + m(1))).toBeVisible();
  });

  test('points at what is missing, and the button leads to the declaration', async ({ page, api }) => {
    api.addApartment({ name: 'Bare' });
    await page.goto('/');
    await page.getByText('Bare', { exact: true }).click();

    await expect(page.getByText('Nothing logged yet.')).toBeVisible();
    await expect(page.getByText('—', { exact: true }).first()).toBeVisible(); // no occupancy or yield yet
    await page.getByText('Add the purchase price and property details in the apartment settings →').click();
    await expect(page.getByRole('heading', { name: 'Apartment settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Apartment settings' }).click();
    await expect(page.getByRole('heading', { name: 'Bare' })).toBeVisible();

    await page.getByText(/month(s)? of \d{4} not logged yet →/).click();
    await expect(page.getByRole('heading', { name: 'Rent log' })).toBeVisible();
    await tab(page, 'Overview');
    await page.getByRole('button', { name: `Prepare ${YEAR} tax declaration` }).click();
    await expect(page.getByRole('heading', { name: 'Tax declaration' })).toBeVisible();
  });

  test('says "1 other" and "1 month" in the singular', async ({ page, api }) => {
    api.addApartment(
      { name: 'Pair', purchasePrice: 1 },
      { owners: [{ userId: 'usr_me', email: 'me@example.test', sharePct: 50 }, { userId: 'usr_b', email: 'b@example.test', sharePct: 50 }], mySharePct: 50 },
    );
    await page.clock.setFixedTime(new Date(`${YEAR}-01-15T12:00:00`));
    await page.goto('/');
    await page.getByText('Pair', { exact: true }).click();

    await expect(page.getByText('Owned with 1 other — tap to see the owners.')).toBeVisible();
    await expect(page.getByText(`1 month of ${YEAR} not logged yet →`)).toBeVisible();
  });

  test('switches between apartments and years, and remembers the choice', async ({ page, api }) => {
    coOwned(api, 'First');
    api.addApartment({ name: 'Second', address: 'Toinen katu 2' }, ledger());
    await page.goto('/');
    await page.getByText('Second', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Second' })).toBeVisible();

    await page.getByLabel('Apartment', { exact: true }).selectOption({ label: 'First' });
    await expect(page.getByRole('heading', { name: 'First' })).toBeVisible();
    await page.getByLabel('Tax year').selectOption(String(YEAR - 1));
    await expect(page.locator('.card').filter({ hasText: 'Whole apartment' })).toContainText('0,00 €');

    await page.reload();
    await tab(page, 'Overview');
    await expect(page.getByRole('heading', { name: 'First' })).toBeVisible();
  });

  test('still works when the browser refuses to store anything', async ({ page, api }) => {
    api.addApartment({ name: 'Private mode' });
    await page.addInitScript(() => {
      const refuse = () => {
        throw new Error('storage disabled');
      };
      Object.defineProperty(window, 'localStorage', { get: refuse });
    });
    await page.goto('/');
    await page.getByText('Private mode', { exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Private mode' })).toBeVisible();
  });
});

test.describe('the rent log', () => {
  test('logs a paid month with the usual rent pre-filled, and the year it counts in', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat', monthlyRent: 750 });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Rent log');
    await page.locator('.month').first().click();

    await expect(page.getByRole('heading', { name: `Rent for ${m(1)}` })).toBeVisible();
    await expect(page.getByLabel('Amount received (€)')).toHaveValue('750');
    await page.getByLabel('Received on').fill(`${m(2)}-02`);
    await page.getByLabel('Note').fill(' late ');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.month.paid').first()).toContainText('750,00 €');
    expect(apt.rents).toEqual([{ month: m(1), status: 'paid', amount: 750, receivedDate: `${m(2)}-02`, note: 'late' }]);
  });

  test('marks a month vacant or unpaid, edits it, and deletes it', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Rent log');

    await page.locator('.month').nth(1).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled(); // paid needs an amount
    await page.getByRole('button', { name: 'Vacant' }).click();
    await expect(page.getByLabel('Note')).toHaveAttribute('placeholder', 'e.g. between tenants');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.month.vacant')).toContainText('Vacant');
    expect(apt.rents[0]).toMatchObject({ status: 'vacant', amount: 0, receivedDate: '' });

    await page.locator('.month.vacant').click();
    await page.getByRole('button', { name: 'Unpaid' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.month.unpaid')).toContainText('Unpaid');

    await page.locator('.month.unpaid').click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.month.unpaid')).toHaveCount(0);
    expect(apt.rents).toEqual([]);
  });

  test('shows months still to come as such, and explains a failed save', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('PUT', /\/rents\//, { status: 400, body: { error: 'A paid month needs an amount and the date it was received' } });
    await page.clock.setFixedTime(new Date(`${YEAR}-06-15T12:00:00`));
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Rent log');

    await expect(page.locator('.month.future')).toHaveCount(6);
    await expect(page.locator('.month').first()).toContainText('Not logged');
    await page.locator('.month').first().click();
    await page.getByLabel('Amount received (€)').fill('700');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(alert(page)).toHaveText('A paid month needs an amount and the date it was received');
    // Closing the sheet by tapping outside it.
    await page.locator('.sheet-bg').click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('reminds co-owners to log the whole rent', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await page.getByText('Kauppakatu 12', { exact: true }).click();
    await tab(page, 'Rent log');
    await expect(page.getByText('Log the rent for the whole apartment')).toBeVisible();
  });
});

test.describe('costs and receipts', () => {
  const photo = `${__dirname}/receipt.jpg`;

  test('adds a cost with a receipt photo, then shows its thumbnail', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Costs');
    await expect(page.getByText(`No costs for ${YEAR}.`)).toBeVisible();

    await page.getByRole('button', { name: '+ Add cost' }).click();
    await page.getByLabel('Date').fill(`${m(2)}-14`);
    await page.getByLabel('Amount (€)').fill('142.50');
    await page.getByLabel('Category').selectOption('financing_charge');
    await expect(page.getByText('Not deductible as an expense')).toBeVisible();
    await page.getByLabel('Category').selectOption('repairs');
    await page.getByLabel('Description').fill('Kitchen tap ');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Take / choose photo' }).click()]);
    await chooser.setFiles(photo);
    await expect(page.getByAltText('Receipt preview')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.list li')).toContainText('Kitchen tap');
    await expect(page.locator('.list img.thumb')).toBeVisible();
    expect(apt.costs[0]).toMatchObject({ date: `${m(2)}-14`, category: 'repairs', description: 'Kitchen tap', amount: 142.5, hasReceipt: true });
    expect([...api.receipts.values()][0]!.contentType).toBe('image/jpeg');
  });

  test('edits a cost, removes its photo, and deletes it', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    apt.costs[0]!.hasReceipt = true;
    api.receipts.set(apt.costs[0]!.id, { contentType: 'image/jpeg', data: readFileSync(photo) });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Costs');
    await expect(page.locator('.card').first()).toContainText('216,00 €'); // financing charge left out
    await expect(page.getByText('not deductible', { exact: false }).first()).toBeVisible();

    await page.getByText('Kitchen tap').click();
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await page.getByLabel('Amount (€)').fill('130');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.list li').filter({ hasText: 'Kitchen tap' })).toContainText('130,00 €');
    expect(apt.costs.find((c) => c.id === 'c-repair')).toMatchObject({ amount: 130, hasReceipt: false });

    // A cost without a description is listed by its category.
    await page.getByText('Insurance', { exact: true }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Insurance', { exact: true })).toHaveCount(0);
  });

  test('replaces a photo on an existing cost, and removes an unsaved one without calling the server', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Costs');

    await page.getByText('Kitchen tap').click();
    await page.locator('input[type=file]').setInputFiles(photo);
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(api.callsTo('DELETE')).toEqual([]);

    await page.getByText('Kitchen tap').click();
    await page.locator('input[type=file]').setInputFiles(photo);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.list img.thumb')).toHaveCount(1);
    expect(apt.costs.find((c) => c.id === 'c-repair')!.hasReceipt).toBe(true);
  });

  test('explains a photo it cannot read and a save that failed', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('POST', /\/costs$/, { status: 400, body: { error: 'Amount must be more than zero' } });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await tab(page, 'Costs');
    await page.getByRole('button', { name: '+ Add cost' }).click();

    await page.locator('input[type=file]').setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await expect(alert(page)).toHaveText('Could not read that image.');
    await page.locator('input[type=file]').setInputFiles([]);

    await page.getByLabel('Amount (€)').fill('5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(alert(page)).toHaveText('Amount must be more than zero');
  });

  test('says the total is for the whole apartment when it is co-owned', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await page.getByText('Kauppakatu 12', { exact: true }).click();
    await tab(page, 'Costs');
    await expect(page.getByText(/entries · whole apartment/)).toBeVisible();
  });
});

test.describe('the tax declaration', () => {
  test("shows every warning, each leading to where it is fixed, and the viewer's share of every line", async ({ page, api }) => {
    coOwned(api);
    await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
    await page.goto('/');
    await page.getByText('Kauppakatu 12', { exact: true }).click();
    await tab(page, 'Tax');

    await expect(page.getByText('Your ownership: 60 %')).toBeVisible();
    const income = page.locator('.card').filter({ hasText: 'Income (Vuokratulot)' });
    await expect(income).toContainText('2 400,00 €');
    await expect(income).toContainText('1 440,00 €');
    await expect(page.locator('.kv').filter({ hasText: 'Repairs & upkeep' })).toContainText('72,00 €');
    await expect(page.locator('.kv').filter({ hasText: 'Financing charge' })).toContainText('not deductible');
    await expect(page.locator('.kv').filter({ hasText: 'Depreciation' })).toContainText('1 500,00 €');
    await expect(page.getByText('Rental loss')).toBeVisible();
    await expect(page.getByText('Estimated capital income tax on your share')).toBeVisible();

    for (const [warning, heading] of [
      ['Your name for the declaration is missing →', 'Portfolio'],
      ['8 month(s) not logged in the rent log →', 'Rent log'],
      ['3 cost(s) have no receipt photo →', 'Costs & receipts'],
      ["1 invited owner(s) haven't joined yet — check the shares are final →", 'Apartment settings'],
    ] as const) {
      await page.getByText(warning).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await tab(page, 'Tax');
    }
  });

  test('downloads the declaration package with the PDF, the ledger and the receipts', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.costs[0]!.hasReceipt = true;
    apt.costs[1]!.hasReceipt = true;
    api.receipts.set(apt.costs[0]!.id, { contentType: 'image/jpeg', data: readFileSync(`${__dirname}/receipt.jpg`) });
    api.receipts.set(apt.costs[1]!.id, { contentType: 'image/png', data: Buffer.from([0x89, 0x50]) });
    apt.costs[2]!.hasReceipt = true;
    api.receipts.set(apt.costs[2]!.id, { contentType: 'image/webp', data: Buffer.from('RIFF') });
    api.profile = { taxpayerName: 'Aino Aalto' };
    await page.clock.install();
    await page.goto('/');
    await page.getByText('Kauppakatu 12', { exact: true }).click();
    await tab(page, 'Tax');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Generate ${YEAR} declaration (.zip)` }).click()]);
    expect(download.suggestedFilename()).toBe(`rental-tax-${YEAR}.zip`);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      `ledger-${YEAR}.csv`,
      'receipts/',
      expect.stringMatching(/^receipts\/.*Kitchen-tap.*\.jpg$/),
      expect.stringMatching(/^receipts\/.*insurance.*\.png$/),
      expect.stringMatching(/^receipts\/.*Rahoitusvastike.*\.webp$/),
      `summary-${YEAR}.json`,
      `vuokratulot-ja-menot-${YEAR}.pdf`,
    ].sort((a, b) => String(a).localeCompare(String(b))) as unknown as string[]);
    const csv = await zip.file(`ledger-${YEAR}.csv`)!.async('string');
    expect(csv).toContain('"your_share_eur_60pct"');
    expect(csv).toContain(`"Rent for ${m(4)} – Between tenants"`);
    // The download link's object URL is released once the browser has it.
    await page.clock.runFor(2500);
  });

  test('includes a receipt the server lost as no file, and downloads the PDF on its own', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Solo', purchasePrice: 100000, useDepreciation: true }, ledger());
    apt.costs[0]!.hasReceipt = true; // but the server has no photo for it
    api.profile = { taxpayerName: 'Aino Aalto' };
    await page.goto('/');
    await page.getByText('Solo', { exact: true }).click();
    await tab(page, 'Tax');
    await expect(page.getByText('Your ownership')).toHaveCount(0);
    await expect(page.getByText('Estimated capital income tax', { exact: true })).toBeVisible();

    const [zipDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /declaration \(\.zip\)/ }).click()]);
    const zip = await JSZip.loadAsync(readFileSync(await zipDownload.path()));
    expect(Object.keys(zip.files).filter((n) => n.startsWith('receipts/') && n !== 'receipts/')).toEqual([]);

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    expect(pdf.suggestedFilename()).toBe(`vuokratulot-ja-menot-${YEAR}.pdf`);
    expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('says when the package could not be built', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Solo' }, ledger());
    apt.costs[0]!.hasReceipt = true;
    api.failNext('GET', /\/receipt$/, { abort: true });
    await page.goto('/');
    await page.getByText('Solo', { exact: true }).click();
    await tab(page, 'Tax');
    await page.getByRole('button', { name: /declaration \(\.zip\)/ }).click();

    await expect(alert(page)).toContainText('Could not build the package:');
  });

  test('shows a taxable profit, an unpaid month and a year with no costs', async ({ page, api }) => {
    api.addApartment(
      { name: 'Profit', purchasePrice: 10 },
      { rents: [...ledger().rents, { month: m(5), status: 'unpaid', amount: 0, receivedDate: '', note: '' }] },
    );
    api.profile = { taxpayerName: 'Aino' };
    await page.goto('/');
    await page.getByText('Profit', { exact: true }).click();
    await tab(page, 'Tax');

    await expect(page.getByText(`No costs logged for ${YEAR}.`)).toBeVisible();
    await expect(page.getByText('Taxable rental income')).toBeVisible();
    await expect(page.getByText('Purchase price missing')).toHaveCount(0);
    await page.getByText('1 month(s) marked unpaid — not counted as income →').click();
    await expect(page.getByRole('heading', { name: 'Rent log' })).toBeVisible();
  });

  test('fits a full co-owned year onto as many PDF pages as it needs', async ({ page, api }) => {
    // Every month paid (December's arriving in January), every kind of cost,
    // depreciation: more lines than one A4 page holds.
    const rents = Array.from({ length: 12 }, (_, i) => ({
      month: m(i + 1),
      status: 'paid' as const,
      amount: 800,
      receivedDate: `${m(i + 1)}-03`,
      note: '',
    }));
    rents.push({ month: `${YEAR - 1}-12`, status: 'paid', amount: 800, receivedDate: `${m(1)}-02`, note: '' });
    const categories = ['maintenance_charge', 'financing_charge', 'repairs', 'loan_interest', 'insurance', 'brokerage', 'utilities', 'other'] as const;
    const costs = categories.map((category, i) => ({ id: `k${i}`, date: `${m(i + 1)}-07`, category, description: '', amount: 100 + i, hasReceipt: false }));
    api.addApartment(
      { name: 'Full year', purchaseDate: '2019-03-01', purchasePrice: 150000, useDepreciation: true },
      {
        rents,
        costs,
        owners: [{ userId: 'usr_me', email: 'me@example.test', sharePct: 70 }],
        invites: [{ id: '99999999-0000-4000-8000-000000000002', email: 'x@example.test', sharePct: 30 }],
        mySharePct: 70,
      },
    );
    api.profile = { taxpayerName: 'Aino' };
    await page.goto('/');
    await page.getByText('Full year', { exact: true }).click();
    await page.getByRole('button', { name: 'Tax', exact: true }).click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /declaration \(\.zip\)/ }).click()]);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const text = Buffer.from(await zip.file(`vuokratulot-ja-menot-${YEAR}.pdf`)!.async('uint8array')).toString('latin1');
    expect(text).toContain('page 2/2');
    expect(text).toContain('2019-03-01 for 150 000,00 EUR');
    expect(text).toContain('The apartment has 1 owner and 1 pending.');
    // December's rent, received this January, is in this year's ledger.
    expect(await zip.file(`ledger-${YEAR}.csv`)!.async('string')).toContain(`"${m(1)}-02","rent","paid","Rent for ${YEAR - 1}-12"`);
  });

  test('describes co-owners in the PDF when nobody is still invited, and leaves out an empty section', async ({ page, api }) => {
    const { rents, costs } = ledger();
    api.addApartment(
      { name: 'Pair' },
      {
        rents,
        costs: costs.filter((c) => c.category !== 'financing_charge'),
        owners: [
          { userId: 'usr_me', email: 'me@example.test', sharePct: 50 },
          { userId: 'usr_b', email: 'b@example.test', sharePct: 50 },
        ],
        mySharePct: 50,
      },
    );
    await page.goto('/');
    await page.getByText('Pair', { exact: true }).click();
    await page.getByRole('button', { name: 'Tax', exact: true }).click();

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toContain('The apartment has 2 owners. Each owner declares');
    expect(text).not.toContain('Not deductible');
  });
});
