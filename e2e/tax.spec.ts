import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';
import { alert, section } from './nav';

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
    await expect(kv('Depreciation')).toContainText('1 500,00 €');
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
    api.profile = { taxpayerName: 'Aino' };
    await page.clock.setFixedTime(new Date(`${YEAR}-05-20T12:00:00`));
    await page.goto('/');
    await section(page, 'Tax');

    const list = page.locator('.todo');
    await expect(list.locator('.done')).toHaveText(['Name on the declaration', 'Purchase price set', 'Every month logged', 'Every cost has a receipt']);
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
    api.profile = { taxpayerName: 'Aino Aalto' };
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
});
