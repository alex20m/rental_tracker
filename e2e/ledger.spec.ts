import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';
import { alert, section } from './nav';

const photo = `${__dirname}/receipt.jpg`;

test.describe('the rent log', () => {
  test('closes a form with Escape, and only with Escape, handing focus back to where it was opened', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Rent');
    const january = page.locator('.month').first();
    await january.click();
    const sheet = page.getByRole('dialog', { name: `January ${YEAR}` });

    await page.keyboard.press('a');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(january).toBeFocused();
  });

  test('logs a paid month with the usual rent pre-filled, and a note', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat', monthlyRent: 750 });
    await page.goto('/');
    await section(page, 'Rent');
    await page.locator('.month').first().click();

    const sheet = page.getByRole('dialog', { name: `January ${YEAR}` });
    await expect(sheet.getByLabel('Amount received (€)')).toHaveValue('750');
    await sheet.getByLabel('Received on').fill(`${m(2)}-02`);
    await sheet.getByRole('button', { name: '+ Add a note' }).click();
    await sheet.getByLabel('Note').fill(' late ');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.month.paid')).toContainText('750,00 €');
    await expect(page.locator('.hero')).toContainText('750,00 €');
    expect(apt.rents).toEqual([{ month: m(1), status: 'paid', amount: 750, receivedDate: `${m(2)}-02`, note: 'late' }]);
  });

  test('marks a month vacant or unpaid, edits it, and deletes it', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Rent');

    await page.locator('.month').nth(1).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled(); // paid needs an amount
    await sheet.getByRole('radio', { name: 'Vacant' }).click();
    await sheet.getByRole('button', { name: '+ Add a note' }).click();
    await expect(sheet.getByLabel('Note')).toHaveAttribute('placeholder', 'e.g. between tenants');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.month.vacant')).toContainText('Vacant');
    expect(apt.rents[0]).toMatchObject({ status: 'vacant', amount: 0, receivedDate: '' });

    await page.locator('.month.vacant').click();
    // An empty note was not saved, so the field stays folded away.
    await expect(sheet.getByRole('button', { name: '+ Add a note' })).toBeVisible();
    await sheet.getByRole('radio', { name: 'Unpaid' }).click();
    await expect(sheet.getByText('Unpaid rent isn’t counted as income until you receive it.')).toBeVisible();
    await sheet.getByRole('button', { name: '+ Add a note' }).click();
    await expect(sheet.getByLabel('Note')).toHaveAttribute('placeholder', '');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.month.unpaid')).toContainText('Unpaid');

    await page.locator('.month.unpaid').click();
    await sheet.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.month.unpaid')).toHaveCount(0);
    expect(apt.rents).toEqual([]);
  });

  test('reopens a month with its note showing', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');
    await section(page, 'Rent');
    await page.locator('.month.vacant').click();

    await expect(page.getByRole('dialog').getByLabel('Note')).toHaveValue('Between tenants');
  });

  test('shows months still to come, and explains a failed save', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('PUT', /\/rents\//, { status: 400, body: { error: 'A paid month needs an amount and the date it was received' } });
    await page.clock.setFixedTime(new Date(`${YEAR}-06-15T12:00:00`));
    await page.goto('/');
    await section(page, 'Rent');

    await expect(page.locator('.month.future')).toHaveCount(6);
    await expect(page.locator('.month.future').first()).toBeDisabled();
    await expect(page.locator('.month:not(.future)').first()).toBeEnabled();
    await expect(page.locator('.month').first()).toContainText('Add');
    await page.locator('.month').first().click();
    await page.getByLabel('Amount received (€)').fill('700');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('A paid month needs an amount and the date it was received');
  });

  test('explains rent timing, mentioning co-owners only for a shared apartment', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await section(page, 'Rent');
    await page.getByRole('button', { name: 'About rent timing' }).click();

    await expect(page.getByRole('note')).toContainText('Log the rent for the whole apartment');
  });
});

test.describe('costs and receipts', () => {
  test('adds a cost with a receipt photo, then shows its thumbnail', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
    await page.goto('/');
    await section(page, 'Costs');
    await expect(page.getByText(`No costs logged for ${YEAR}.`)).toBeVisible();

    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('142.50');
    await sheet.getByRole('radio', { name: 'Financing charge' }).click();
    await expect(sheet.getByText('Not deductible', { exact: true })).toBeVisible();
    await sheet.getByRole('radio', { name: 'Repairs & upkeep' }).click();
    await expect(sheet.getByText('Not deductible', { exact: true })).toHaveCount(0);
    await sheet.getByLabel('Description').fill('Kitchen tap ');
    await sheet.getByLabel('Date').fill(`${m(2)}-14`);
    // The button's accessible name is its label, "Receipt"; its text says what it will do.
    const receipt = sheet.getByRole('button', { name: 'Receipt' });
    await expect(receipt).toHaveText('Add photo');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), receipt.click()]);
    await chooser.setFiles(photo);
    await expect(sheet.getByAltText('Receipt preview')).toBeVisible();
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.list li')).toContainText('Kitchen tap');
    await expect(page.locator('.list li')).toContainText('14 Feb · Repairs & upkeep');
    await expect(page.locator('.list img.thumb')).toBeVisible();
    expect(apt.costs[0]).toMatchObject({ date: `${m(2)}-14`, category: 'repairs', description: 'Kitchen tap', amount: 142.5, hasReceipt: true });
  });

  test('will not save a cost dated in a month that has not started', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.clock.setFixedTime(new Date(`${YEAR}-06-15T12:00:00`));
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('50');
    const save = sheet.getByRole('button', { name: 'Save' });

    await sheet.getByLabel('Date').fill(`${m(7)}-01`);
    await expect(save).toBeDisabled();
    await sheet.getByLabel('Date').fill(`${m(6)}-30`);
    await expect(save).toBeEnabled();
  });

  test('lists costs, leaves the financing charge out of the total, and says how many there are', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    apt.costs[0]!.hasReceipt = true;
    api.receipts.set(apt.costs[0]!.id, { contentType: 'image/jpeg', data: readFileSync(photo) });
    await page.goto('/');
    await section(page, 'Costs');

    await expect(page.locator('.hero .big')).toHaveText('216,00 €');
    await expect(page.locator('li').filter({ hasText: 'Rahoitusvastike' })).toContainText('not deductible');
    await expect(page.getByRole('img', { name: 'No receipt photo' })).toHaveCount(2);
    await page.getByRole('button', { name: 'About costs' }).click();
    await expect(page.getByRole('note')).toContainText('3 entries this year.');
  });

  test('says "1 entry", and mentions co-owners for a shared apartment', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.costs = apt.costs.slice(0, 1);
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'About costs' }).click();

    await expect(page.getByRole('note')).toContainText('1 entry this year.');
    await expect(page.getByRole('note')).toContainText('Log costs for the whole apartment');
  });

  test('edits a cost, removes its photo, and deletes another', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    apt.costs[0]!.hasReceipt = true;
    api.receipts.set(apt.costs[0]!.id, { contentType: 'image/jpeg', data: readFileSync(photo) });
    await page.goto('/');
    await section(page, 'Costs');

    await page.getByRole('button', { name: /Kitchen tap/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit cost' });
    await expect(sheet.getByRole('button', { name: 'Receipt' })).toHaveText('Replace photo');
    await sheet.getByRole('button', { name: 'Remove' }).click();
    await sheet.getByLabel('Amount (€)').fill('130');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('li').filter({ hasText: 'Kitchen tap' })).toContainText('130,00 €');
    expect(apt.costs.find((c) => c.id === 'c-repair')).toMatchObject({ amount: 130, hasReceipt: false });

    // A cost without a description is listed by its category. (A row's name
    // starts with its thumbnail's — "No receipt photo" — so it is not anchored.)
    await page.getByRole('button', { name: /Insurance/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: /Insurance/ })).toHaveCount(0);
  });

  test('adds a photo to an existing cost, and drops an unsaved one without calling the server', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');
    await section(page, 'Costs');

    await page.getByRole('button', { name: /Kitchen tap/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.locator('input[type=file]').setInputFiles(photo);
    await sheet.getByRole('button', { name: 'Remove' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toHaveCount(0);
    expect(api.callsTo('DELETE')).toEqual([]);

    await page.getByRole('button', { name: /Kitchen tap/ }).click();
    await sheet.locator('input[type=file]').setInputFiles(photo);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.list img.thumb')).toHaveCount(1);
    expect(apt.costs.find((c) => c.id === 'c-repair')!.hasReceipt).toBe(true);
  });

  test('adds a cost after a photo was picked and dropped again, uploading nothing', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('20');
    await sheet.locator('input[type=file]').setInputFiles(photo);
    await sheet.getByRole('button', { name: 'Remove' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(sheet).toHaveCount(0);
    expect(apt.costs).toHaveLength(1);
    expect(api.calls.map((c) => c.call.replace(apt.id, ':id'))).toEqual(['POST /api/apartments/:id/costs']);
  });

  test('explains a photo it cannot read and a save that failed', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('POST', /\/costs$/, { status: 400, body: { error: 'Amount must be more than zero' } });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog');

    await sheet.locator('input[type=file]').setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await expect(alert(page)).toHaveText('Could not read that image.');
    await sheet.locator('input[type=file]').setInputFiles([]);

    await sheet.getByLabel('Amount (€)').fill('5');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(alert(page)).toHaveText('Amount must be more than zero');
  });

  test('spreads a basic improvement over the years chosen, and counts only this year’s part', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('3000');
    await expect(sheet.getByLabel('Spread over (years)')).toHaveCount(0);
    await sheet.getByRole('radio', { name: 'Basic improvement' }).click();
    await expect(sheet.getByLabel('Spread over (years)')).toHaveValue('10');
    await sheet.getByRole('button', { name: 'About spreading' }).click();
    await expect(page.getByRole('note')).toContainText('equal parts over 10 years');
    await page.keyboard.press('Escape');
    // Eleven years is more than the law allows, so it cannot be saved.
    await sheet.getByLabel('Spread over (years)').fill('11');
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
    await sheet.getByLabel('Spread over (years)').fill('4');
    await sheet.getByLabel('Description').fill('New kitchen');
    await sheet.getByLabel('Date').fill(`${m(5)}-02`);
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.list li')).toContainText('over 4 years');
    // 3 000 € over four years: 750 € this year.
    await expect(page.locator('.hero .big')).toHaveText('750,00 €');
    expect(apt.costs[0]).toMatchObject({ category: 'improvement', amount: 3000, spreadYears: 4 });
  });

  test('depreciates dear furniture at 25 % a year unless it lasts under three years', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByRole('radio', { name: 'Furniture & appliances' }).click();
    const shortLived = sheet.getByRole('switch', { name: 'Lasts under 3 years — deduct at once' });
    // Up to 1 200 € it is deducted at once anyway.
    await sheet.getByLabel('Amount (€)').fill('1200');
    await expect(shortLived).toHaveCount(0);
    await sheet.getByLabel('Amount (€)').fill('2000');
    await sheet.getByLabel('Description').fill('Sofa');
    await sheet.getByLabel('Date').fill(`${m(3)}-02`);
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.list li')).toContainText('25 % a year');
    await expect(page.locator('.hero .big')).toHaveText('500,00 €');
    expect(apt.costs[0]).toMatchObject({ category: 'furniture', amount: 2000, spreadYears: 10 });

    await page.locator('.list li').click();
    const edit = page.getByRole('dialog', { name: 'Edit cost' });
    await edit.getByRole('switch', { name: 'Lasts under 3 years — deduct at once' }).click();
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.list li')).not.toContainText('25 % a year');
    await expect(page.locator('.hero .big')).toHaveText('2 000,00 €');
    expect(apt.costs[0]).toMatchObject({ spreadYears: 1 });

    await page.locator('.list li').click();
    await page.getByRole('dialog', { name: 'Edit cost' }).getByRole('switch', { name: 'Lasts under 3 years — deduct at once' }).click();
    await page.getByRole('dialog', { name: 'Edit cost' }).getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.hero .big')).toHaveText('500,00 €');
  });

  test('counts the financing charge once the housing company books it as income', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', financingChargeDeductible: true }, ledger());
    await page.goto('/');
    await section(page, 'Costs');

    // 120 repair + 96 insurance + 80 financing charge.
    await expect(page.locator('.hero .big')).toHaveText('296,00 €');
    await expect(page.locator('li').filter({ hasText: 'Rahoitusvastike' })).not.toContainText('not deductible');
  });

  test('names the category on the Finnish form', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    await page.getByRole('button', { name: 'About this category' }).click();

    await expect(page.getByRole('note')).toHaveText('On the Finnish form: Hoitovastike. Deducted in the year it is paid.');
  });
});
