import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';
import { alert, openApartment, openInfo, section } from './nav';

test.describe('the tax page', () => {
  test("shows the viewer's share of every line, or the whole apartment's", async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await section(page, 'Tax');

    await expect(page.getByText(`Rental loss · ${YEAR}`)).toBeVisible();
    const kv = (label: string) => page.locator('.kv').filter({ hasText: label });
    await expect(kv('Rent received')).toContainText('1 440,00 €');
    await expect(kv('Repairs & upkeep')).toContainText('72,00 €');
    await expect(kv('Financing charge')).toContainText('not deductible');
    await expect(kv('Building depreciation')).toContainText('1 500,00 €');
    await expect(kv('Deductible total')).toContainText('1 629,60 €');

    await page.getByRole('radio', { name: 'Whole apartment' }).click();
    await expect(kv('Rent received')).toContainText('2 400,00 €');
    await expect(kv('Deductible total')).toContainText('2 716,00 €');

    await page.getByRole('button', { name: 'About co-ownership' }).click();
    await expect(page.getByRole('note')).toContainText('Each owner declares their own share.');
  });

  test('ticks off what is done and links each open item to where it is fixed', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat', purchasePrice: 10 },
      { rents: [...ledger().rents, { month: m(5), status: 'unpaid', amount: 0, receivedDate: '', note: '' }] },
    );
    await page.clock.setFixedTime(new Date(`${YEAR}-05-20T12:00:00`));
    await page.goto('/');
    await section(page, 'Tax');

    const list = page.locator('.todo');
    await expect(list.locator('.done')).toHaveText(['Purchase price set', 'Every month logged', 'Every cost has a receipt']);
    await list.getByRole('button', { name: '1 month unpaid — not counted as income' }).click();
    await expect(page.getByRole('heading', { name: 'Months' })).toBeVisible();

    await section(page, 'Tax');
    await expect(page.getByText('Taxable rental income · ' + YEAR)).toBeVisible();
    await expect(page.getByText(`No costs logged for ${YEAR}.`)).toBeVisible();
    await page.getByRole('button', { name: 'About rent months' }).click();
    await expect(page.getByRole('note')).toContainText(`3 paid, 1 vacant and 1 unpaid months logged for ${YEAR}`);
  });

  test('downloads the declaration package with the PDF, the ledger and the receipts', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.costs[0]!.hasReceipt = true;
    apt.costs[1]!.hasReceipt = true;
    apt.costs[2]!.hasReceipt = true;
    api.receipts.set(apt.costs[0]!.id, { contentType: 'image/jpeg', data: readFileSync(`${__dirname}/receipt.jpg`) });
    api.receipts.set(apt.costs[1]!.id, { contentType: 'image/png', data: Buffer.from([0x89, 0x50]) });
    api.receipts.set(apt.costs[2]!.id, { contentType: 'image/webp', data: Buffer.from('RIFF') });
    await page.clock.install();
    await page.goto('/');
    await section(page, 'Tax');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Download ${YEAR} declaration (.zip)` }).click()]);
    expect(download.suggestedFilename()).toBe(`rental-tax-${YEAR}.zip`);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    expect(Object.keys(zip.files).sort()).toEqual([
      `ledger-${YEAR}.csv`,
      'receipts/',
      // Named by date, so they sort in the order they were paid.
      expect.stringMatching(/^receipts\/.*Kitchen-tap.*\.jpg$/),
      expect.stringMatching(/^receipts\/.*insurance.*\.png$/),
      expect.stringMatching(/^receipts\/.*Rahoitusvastike.*\.webp$/),
      `summary-${YEAR}.json`,
      `vuokratulot-ja-menot-${YEAR}.pdf`,
    ]);
    const csv = await zip.file(`ledger-${YEAR}.csv`)!.async('string');
    expect(csv).toContain('"your_share_eur_60pct"');
    expect(csv).toContain(`"Rent for ${m(4)} – Between tenants"`);
    // The download link's object URL is released once the browser has it.
    await page.clock.runFor(2500);
  });

  test('leaves a lost receipt out of the zip, and downloads the PDF on its own', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Solo', purchasePrice: 100000, useDepreciation: true }, ledger());
    apt.costs[0]!.hasReceipt = true; // but the server has no photo for it
    await page.goto('/');
    await section(page, 'Tax');
    await expect(page.getByRole('radiogroup', { name: 'Figures for' })).toHaveCount(0);

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
    await section(page, 'Tax');
    await page.getByRole('button', { name: /declaration \(\.zip\)/ }).click();

    await expect(alert(page)).toContainText('Could not build the package:');
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
    await page.goto('/');
    await section(page, 'Tax');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /declaration \(\.zip\)/ }).click()]);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const text = Buffer.from(await zip.file(`vuokratulot-ja-menot-${YEAR}.pdf`)!.async('uint8array')).toString('latin1');
    expect(text).toContain('page 2/2');
    expect(text).toContain('2019-03-01 for 150 000,00 EUR');
    expect(text).toContain('The apartment has 1 owner and 1 pending.');
    expect(await zip.file(`ledger-${YEAR}.csv`)!.async('string')).toContain(`"${m(1)}-02","rent","paid","Rent for ${YEAR - 1}-12"`);
  });

  test('shows this year’s part of spread costs, and loan interest as declared separately, in the page and the PDF', async ({ page, api }) => {
    const { rents } = ledger();
    api.addApartment(
      { name: 'Flat' },
      {
        rents,
        costs: [
          { id: 'k1', date: `${m(1)}-10`, category: 'loan_interest', description: '', amount: 400, hasReceipt: false },
          { id: 'k2', date: `${YEAR - 1}-06-01`, category: 'improvement', description: 'Balcony glazing', amount: 3000, hasReceipt: false },
          { id: 'k3', date: `${m(2)}-10`, category: 'furniture', description: 'Sofa', amount: 2000, hasReceipt: false },
        ],
      },
    );
    await page.goto('/');
    await section(page, 'Tax');

    const kv = (label: string) => page.locator('.kv').filter({ hasText: label });
    await expect(kv('Loan interest')).toContainText('declared separately');
    // Paid last year, so this is its second of ten parts.
    await expect(kv('Basic improvements, this year’s part')).toContainText('300,00 €');
    await expect(kv('Furniture & appliances, this year’s part')).toContainText('500,00 €');
    // Scroll the icon clear of the bottom bar first, as a person would: Playwright would otherwise scroll
    // mid-click, and that scroll rightly closes the popover.
    const about = page.getByRole('button', { name: 'About Basic improvements, this year’s part' });
    await about.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await about.click();
    await expect(page.getByRole('note')).toContainText('equal parts');
    await page.keyboard.press('Escape');
    // 400 + 300 + 500
    await expect(kv('Deductible total')).toContainText('1 200,00 €');
    await expect(page.locator('.kv').filter({ hasText: 'Building depreciation' })).toHaveCount(0);

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toContain('figures for tax form 7H / OmaVero');
    expect(text).toContain('Declared separately');
    expect(text).toContain('Basic improvements deducted over several years');
    expect(text).toContain('Balcony glazing');
    expect(text).toContain('Inventory of furniture and appliances');
    expect(text).toContain('Items over 1 200 EUR: 25% of what is left a year.');
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
    await section(page, 'Tax');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toContain('The apartment has 2 owners. Each owner declares');
    expect(text).not.toContain('Not deductible');
  });

  const paidRent = (n: number, amount = 800) => ({ month: m(n), status: 'paid' as const, amount, receivedDate: `${m(n)}-03`, note: '' });
  const repair = (amount: number) => ({ id: 'k-repair', date: `${m(2)}-10`, category: 'repairs' as const, description: '', amount, hasReceipt: false });

  test('shows the deficit credit under a rental loss, at most the maximum', async ({ page, api }) => {
    api.addApartment({ name: 'Loss' }, { rents: [paidRent(1)], costs: [repair(3000)] });
    api.addApartment({ name: 'Big loss' }, { rents: [paidRent(1)], costs: [repair(10000)] });
    await page.goto('/');
    await section(page, 'Tax');

    await expect(page.getByText(`Rental loss · ${YEAR}`)).toBeVisible();
    // 800 − 3 000 = −2 200 €, and 30 % of that.
    await expect(page.locator('.hero')).toContainText('Deficit credit, up to 660,00 €');
    await openInfo(page, 'About the deficit credit');
    await expect(page.getByRole('note')).toContainText('at most €1 400 — €1 800 with one minor child and €2 200 with two or more');
    await expect(page.getByRole('note')).toContainText('loss you can set against capital income for 10 years');
    await page.keyboard.press('Escape');

    await openApartment(page, 'Big loss');
    await section(page, 'Tax');
    await expect(page.locator('.hero')).toContainText('Deficit credit, up to 1 400,00 €');
  });

  test('shows no deficit credit while there is a profit', async ({ page, api }) => {
    api.addApartment({ name: 'Profit' }, { rents: [paidRent(1)], costs: [repair(100)] });
    await page.goto('/');
    await section(page, 'Tax');

    await expect(page.getByText(`Taxable rental income · ${YEAR}`)).toBeVisible();
    await expect(page.locator('.hero')).not.toContainText('Deficit credit');
  });

  test('shows the flat-rate furniture deduction for a furnished flat, per month it was let', async ({ page, api }) => {
    api.addApartment({ name: 'Studio', furnishing: 'flat', roomClass: 'studio' }, ledger());
    await page.goto('/');
    await section(page, 'Tax');

    // Three months of rent paid and one vacant: 3 × 40 €.
    await expect(page.locator('.kv').filter({ hasText: 'Furnished flat, flat rate' })).toContainText('120,00 €');
    await openInfo(page, 'About Furnished flat, flat rate');
    await expect(page.getByRole('note')).toContainText('€40 a month for a studio or one room, €60 for a larger flat');
  });

  test('limits the deductions to the rent when the rent is below the usual, so there is no loss', async ({ page, api }) => {
    api.addApartment(
      { name: 'Relative', belowMarketRent: true },
      { rents: ledger().rents, costs: [{ id: 'k-m', date: `${m(2)}-10`, category: 'maintenance_charge', description: '', amount: 3000, hasReceipt: false }] },
    );
    await page.goto('/');
    await section(page, 'Tax');

    await expect(page.getByText(`Taxable rental income · ${YEAR}`)).toBeVisible();
    await expect(page.locator('.hero .big')).toHaveText('0,00 €');
    // 2 400 € of rent against 3 000 € of costs.
    await expect(page.locator('.kv').filter({ hasText: 'Limited to the rent received' })).toContainText('600,00 €');
    await expect(page.locator('.kv').filter({ hasText: 'Deductible total' })).toContainText('2 400,00 €');
    await openInfo(page, 'About Limited to the rent received');
    await expect(page.getByRole('note')).toContainText('no loss arises');
  });

  test('lays the declaration out like form 7K for a property, with its depreciation tables', async ({ page, api }) => {
    api.addApartment(
      { name: 'House', propertyType: 'property', useDepreciation: true, purchasePrice: 100000, depreciationPrior: 20000, purchaseDate: `${YEAR - 1}-01-02` },
      {
        rents: [paidRent(1, 12000)],
        costs: [
          repair(500),
          { id: 'k-tax', date: `${m(9)}-01`, category: 'property_tax', description: '', amount: 200, hasReceipt: false },
          { id: 'k-roof', date: `${m(5)}-01`, category: 'improvement', description: 'New roof', amount: 20000, hasReceipt: false },
          { id: 'k-sofa', date: `${m(3)}-01`, category: 'furniture', description: 'Sofa', amount: 2000, hasReceipt: false },
          { id: 'k-int', date: `${m(4)}-01`, category: 'loan_interest', description: '', amount: 900, hasReceipt: false },
        ],
      },
    );
    await page.goto('/');
    await section(page, 'Tax');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toContain('figures for tax form 7K / OmaVero');
    expect(text).toContain('Form 7K - Hyresinkomster - fastighet');
    // 3.3 is the building's 4 000 € and the sofa's 500 €; 3.4 is what the rent leaves before interest.
    expect(text).toMatch(/\(3\.3\) Tj[\s\S]*?\(4 500,00 EUR\) Tj/);
    expect(text).toMatch(/\(3\.4\) Tj[\s\S]*?\(6 800,00 EUR\) Tj/);
    // The building's table: 80 000 left + 20 000 of improvement, 4 %, 96 000 left.
    expect(text).toContain('(Verovuoden poisto) Tj');
    expect(text).toMatch(/\(4\.6\) Tj[\s\S]*?\(96 000,00 EUR\) Tj/);
    expect(text).toContain('Depreciation of loose property');
    expect(text).toContain('Inventory of furniture and appliances');
    expect(text).toContain('Declared separately');
  });

  test('tells in the PDF how the rows come down for a rent below the usual, and what is let', async ({ page, api }) => {
    api.addApartment(
      { name: 'Relative', belowMarketRent: true, letSharePct: 60, furnishing: 'flat' },
      { rents: ledger().rents, costs: [{ id: 'k-m', date: `${m(2)}-10`, category: 'maintenance_charge', description: '', amount: 5000, hasReceipt: false }] },
    );
    await page.goto('/');
    await section(page, 'Tax');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toContain('(below the usual rent) Tj');
    expect(text).toContain('(Share of the home that is let) Tj');
    expect(text).toContain('Furnished flat, flat-rate deduction');
    // 60 % of 5 000 € and 180 € of flat rate against 2 400 € of rent.
    expect(text).toMatch(/Reduce the rows above by\) Tj[\s\S]*?\(780,00 EUR\) Tj/);
  });

  test('tells in the PDF about the deficit credit under a loss', async ({ page, api }) => {
    api.addApartment({ name: 'Loss' }, { rents: [paidRent(1)], costs: [repair(3000)] });
    await page.goto('/');
    await section(page, 'Tax');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF summary only' }).click()]);
    const text = readFileSync(await pdf.path()).toString('latin1');
    expect(text).toMatch(/\(Deficit credit, up to\) Tj[\s\S]*?\(660,00 EUR\) Tj/);
    expect(text).toContain('alij');
  });
});
