import { expect, test } from './fixtures';
import { coOwned } from './data';
import { ME } from './fakeApi';

const alert = (page: import('@playwright/test').Page) => page.locator('.alert[role=alert]');

async function openSettings(page: import('@playwright/test').Page, name: string) {
  await page.goto('/');
  await page.getByText(name, { exact: true }).click();
  await page.getByRole('button', { name: 'Apartment settings' }).click();
  await expect(page.getByRole('heading', { name: 'Apartment settings' })).toBeVisible();
}

test.describe('owners and shares', () => {
  test('shares the apartment by email, taking the share from the viewer', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await openSettings(page, 'Flat');
    await expect(page.getByRole('button', { name: 'Change shares' })).toHaveCount(0); // nobody to share with yet

    await page.getByLabel('Share this apartment with another owner').fill(' Bob@Example.test ');
    await page.getByLabel('Their share in percent').fill('40');
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    const bob = page.locator('.list li').filter({ hasText: 'bob@example.test' });
    await expect(bob).toContainText('invited');
    await expect(bob).toContainText('40 %');
    await expect(page.locator('.list li').filter({ hasText: 'you' })).toContainText('60 %');
    await expect(page.getByLabel('Share this apartment with another owner')).toHaveValue('');
    expect(api.callsTo(`POST /api/apartments/${apt.id}/invites`)[0]!.body).toEqual({ email: 'Bob@Example.test', sharePct: 40 });
  });

  test('will not send a share larger than the viewer owns', async ({ page, api }) => {
    coOwned(api);
    await openSettings(page, 'Kauppakatu 12');
    await page.getByLabel('Share this apartment with another owner').fill('dan@example.test');
    await page.getByLabel('Their share in percent').fill('61');
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    await expect(page.getByLabel('Their share in percent')).toHaveJSProperty('validity.rangeOverflow', true);
    expect(api.callsTo('POST')).toEqual([]);
  });

  test('says why an invite was refused', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('POST', /\/invites$/, { status: 409, body: { error: 'That email has already been invited.' } });
    await openSettings(page, 'Flat');
    await page.getByLabel('Share this apartment with another owner').fill('bob@example.test');
    await page.getByLabel('Their share in percent').fill('10');
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    await expect(alert(page)).toHaveText('That email has already been invited.');
  });

  test('withdraws an invite and gives the share back', async ({ page, api }) => {
    coOwned(api);
    await openSettings(page, 'Kauppakatu 12');
    await page.locator('.list li').filter({ hasText: 'carol@example.test' }).getByRole('button', { name: 'Withdraw' }).click();

    await expect(page.getByText('carol@example.test')).toHaveCount(0);
    await expect(page.locator('.list li').filter({ hasText: 'you' })).toContainText('75 %');
  });

  test('rebalances shares, only once they add up to exactly 100 %', async ({ page, api }) => {
    const apt = coOwned(api);
    await openSettings(page, 'Kauppakatu 12');
    await page.getByRole('button', { name: 'Change shares' }).click();

    await page.getByLabel('Share for bob@example.test').fill('20');
    await expect(page.getByText('Total 95 % — must be exactly 100 %.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save shares' })).toBeDisabled();
    await page.getByLabel('Share for bob@example.test').fill('');
    await expect(page.getByText('Total 75 % — must be exactly 100 %.')).toBeVisible();
    await page.getByLabel('Share for me@example.test').fill('64.99');
    await page.getByLabel('Share for bob@example.test').fill('20.01');
    await page.getByRole('button', { name: 'Save shares' }).click();

    await expect(page.getByRole('button', { name: 'Change shares' })).toBeVisible();
    expect(api.callsTo(`PUT /api/apartments/${apt.id}/shares`)[0]!.body).toEqual({
      owners: [
        { userId: ME.userId, sharePct: 64.99 },
        { userId: 'usr_bob', sharePct: 20.01 },
      ],
      invites: [{ id: apt.invites[0]!.id, sharePct: 15 }],
    });
    await expect(page.locator('.list li').filter({ hasText: 'you' })).toContainText('64,99 %');
  });

  test('cancels an edit without saving, and explains a refused save', async ({ page, api }) => {
    coOwned(api);
    api.failNext('PUT', /\/shares$/, { status: 409, body: { error: 'The owners changed while you were editing. Reload and try again.' } });
    await openSettings(page, 'Kauppakatu 12');

    await page.getByRole('button', { name: 'Change shares' }).click();
    await page.getByLabel('Share for bob@example.test').fill('1');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.list li').filter({ hasText: 'bob@example.test' })).toContainText('25 %');
    expect(api.callsTo('PUT')).toEqual([]);

    await page.getByRole('button', { name: 'Change shares' }).click();
    await page.getByRole('button', { name: 'Save shares' }).click();
    await expect(alert(page)).toHaveText('The owners changed while you were editing. Reload and try again.');
  });

  test('removes another owner whose share is already 0 %', async ({ page, api }) => {
    coOwned(api);
    const apt = [...api.apartments.values()][0]!;
    apt.owners[1]!.sharePct = 0;
    apt.owners[0]!.sharePct = 85;
    await openSettings(page, 'Kauppakatu 12');
    await page.locator('.list li').filter({ hasText: 'bob@example.test' }).getByRole('button', { name: 'Remove' }).click();

    await expect(page.getByText('bob@example.test')).toHaveCount(0);
  });

  test('lets the viewer leave only once their share is 0 %, and asks first', async ({ page, api }) => {
    const apt = coOwned(api);
    await openSettings(page, 'Kauppakatu 12');
    await expect(page.getByRole('button', { name: /Leave this apartment \(set your share to 0 % first\)/ })).toBeDisabled();

    apt.owners[0]!.sharePct = 0;
    apt.owners[1]!.sharePct = 85;
    apt.mySharePct = 0;
    await page.reload();
    await page.getByRole('button', { name: 'Overview' }).click();
    await page.getByRole('button', { name: 'Apartment settings' }).click();

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Leave this apartment', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Apartment settings' })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Leave this apartment', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    await expect(page.getByText('No apartments yet.')).toBeVisible();
  });
});

test.describe('property details', () => {
  test('saves edited details, including depreciation, and only when something changed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await openSettings(page, 'Flat');
    const save = page.getByRole('button', { name: 'Save apartment details' });
    await expect(save).toBeDisabled();

    await page.getByLabel('Address').fill('Rantatie 5');
    await page.getByLabel('Housing company (asunto-osakeyhtiö)').fill('As Oy Ranta');
    await page.getByLabel('Purchase date').fill('2020-05-04');
    await page.getByLabel('Purchase price, whole apartment (€)').fill('120000');
    // Clearing a number field stores 0, not an empty string.
    await page.getByLabel('Usual monthly rent (€)').fill('900');
    await page.getByLabel('Usual monthly rent (€)').fill('');
    await page.getByLabel('Deduct depreciation in the declaration').check();
    await page.getByLabel('Depreciable share (%)').fill('80');
    await page.getByLabel('Rate (% / year)').fill('2.5');
    await page.getByLabel('Already depreciated in earlier years, whole apartment (€)').fill('1000');
    await expect(page.getByText('2 375,00 €')).toBeVisible(); // (120 000 × 80 % − 1 000) × 2.5 %
    await save.click();

    await expect(page.getByText('Saved.')).toBeVisible();
    expect(apt.settings).toMatchObject({
      address: 'Rantatie 5',
      housingCompany: 'As Oy Ranta',
      purchaseDate: '2020-05-04',
      purchasePrice: 120000,
      monthlyRent: 0,
      useDepreciation: true,
      buildingSharePct: 80,
      depreciationPrior: 1000,
    });

    await page.getByLabel('Name').fill('');
    await expect(save).toBeDisabled();
    await expect(page.getByText('Saved.')).toHaveCount(0);
  });

  test('explains a refused save', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('PATCH', /\/apartments\/[^/]+$/, { status: 400, body: { error: 'purchaseDate: Not a real date' } });
    await openSettings(page, 'Flat');
    await page.getByLabel('Address').fill('x');
    await page.getByRole('button', { name: 'Save apartment details' }).click();

    await expect(alert(page)).toHaveText('purchaseDate: Not a real date');
  });
});

test.describe('deleting', () => {
  test('deletes an apartment its only owner deletes, after asking', async ({ page, api }) => {
    api.addApartment({ name: 'Doomed' });
    api.addApartment({ name: 'Kept' });
    await openSettings(page, 'Doomed');

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Delete apartment' }).click();
    expect(api.apartments.size).toBe(2);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete apartment' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    await expect(page.locator('.list li')).toHaveText([/Kept/]);
  });

  test('explains a refused delete, and offers none for a co-owned apartment', async ({ page, api }) => {
    api.addApartment({ name: 'Solo' });
    coOwned(api);
    api.failNext('DELETE', /\/apartments\/[^/]+$/, { status: 409, body: { error: 'Other owners still own part of this apartment. Leave it instead.' } });
    await openSettings(page, 'Solo');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete apartment' }).click();
    await expect(alert(page)).toHaveText('Other owners still own part of this apartment. Leave it instead.');

    await page.getByLabel('Apartment', { exact: true }).selectOption({ label: 'Kauppakatu 12' });
    await expect(page.getByRole('button', { name: 'Delete apartment' })).toHaveCount(0);
  });

  test('reports a failed refresh after a change, and keeps the change', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await page.getByRole('button', { name: 'Rent log', exact: true }).click();

    api.failNext('GET', new RegExp(`/api/apartments/${apt.id}$`), { status: 500, body: { error: 'Database unavailable' } });
    await page.locator('.month').first().click();
    await page.getByRole('button', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('Database unavailable');
    expect(apt.rents).toHaveLength(1);
  });

  test('lets go of an apartment its other owner deleted meanwhile', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await page.getByRole('button', { name: 'Rent log', exact: true }).click();

    api.failNext('GET', new RegExp(`/api/apartments/${apt.id}$`), { status: 404, body: { error: 'Not found' } });
    await page.locator('.month').first().click();
    await page.getByRole('button', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Add an apartment on the Portfolio tab first.')).toBeVisible();
  });

  test('sends the viewer to sign in when their session ends mid-way', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await page.getByText('Flat', { exact: true }).click();
    await page.getByRole('button', { name: 'Rent log', exact: true }).click();
    api.signedIn = false;
    await page.locator('.month').first().click();
    await page.getByRole('button', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
