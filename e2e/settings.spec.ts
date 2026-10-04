import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned } from './data';
import { ME } from './fakeApi';
import { alert, openApartment, openSettings, openTopic, section } from './nav';

const owner = (page: Page, email: string) => page.locator('li.owner').filter({ hasText: email });

test.describe('owners and shares', () => {
  test('shares the apartment by email, taking the share from the viewer', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Owners');
    await expect(page.getByRole('button', { name: 'Edit shares' })).toHaveCount(0); // nobody to share with yet

    await page.getByRole('button', { name: 'Invite a co-owner' }).click();
    const sheet = page.getByRole('dialog', { name: 'Invite a co-owner' });
    await expect(sheet.getByRole('button', { name: 'Share apartment' })).toBeDisabled();
    await sheet.getByLabel('Their email').fill(' Bob@Example.test ');
    await sheet.getByLabel('Their share (%)').fill('40');
    await sheet.getByRole('button', { name: 'Share apartment' }).click();

    await expect(sheet).toHaveCount(0);
    await expect(owner(page, 'bob@example.test')).toContainText('invited');
    await expect(owner(page, 'bob@example.test')).toContainText('40 %');
    await expect(owner(page, 'me@example.test')).toContainText('you');
    await expect(owner(page, 'me@example.test')).toContainText('60 %');
    expect(api.callsTo(`POST /api/apartments/${apt.id}/invites`)[0]!.body).toEqual({ email: 'Bob@Example.test', sharePct: 40 });
  });

  test('will not send a share larger than the viewer owns', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await openTopic(page, 'Owners');
    await page.getByRole('button', { name: 'Invite a co-owner' }).click();
    const sheet = page.getByRole('dialog', { name: 'Invite a co-owner' });
    await sheet.getByLabel('Their email').fill('dan@example.test');
    await sheet.getByLabel('Their share (%)').fill('61');
    await sheet.getByRole('button', { name: 'Share apartment' }).click();

    await expect(sheet.getByLabel('Their share (%)')).toHaveJSProperty('validity.rangeOverflow', true);
    expect(api.callsTo('POST')).toEqual([]);
    await sheet.getByRole('button', { name: 'About their share' }).click();
    await expect(page.getByRole('note')).toContainText('Their share is taken from yours (60 % now).');
  });

  test('offers nothing to give away when the viewer owns 0 %', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.owners[0]!.sharePct = 0;
    apt.owners[1]!.sharePct = 85;
    apt.mySharePct = 0;
    await page.goto('/');
    await openTopic(page, 'Owners');
    await page.getByRole('button', { name: 'Invite a co-owner' }).click();
    const sheet = page.getByRole('dialog', { name: 'Invite a co-owner' });
    await sheet.getByLabel('Their email').fill('dan@example.test');
    await sheet.getByLabel('Their share (%)').fill('10');
    await sheet.getByRole('button', { name: 'Share apartment' }).click();

    await expect(sheet.getByLabel('Their share (%)')).toHaveJSProperty('validity.rangeOverflow', true);
    expect(api.callsTo('POST')).toEqual([]);
  });

  test('says why an invite was refused, and keeps the sheet open', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('POST', /\/invites$/, { status: 409, body: { error: 'That email has already been invited.' } });
    await page.goto('/');
    await openTopic(page, 'Owners');
    await page.getByRole('button', { name: 'Invite a co-owner' }).click();
    const sheet = page.getByRole('dialog', { name: 'Invite a co-owner' });
    await sheet.getByLabel('Their email').fill('bob@example.test');
    await sheet.getByLabel('Their share (%)').fill('10');
    await sheet.getByRole('button', { name: 'Share apartment' }).click();

    await expect(sheet.locator('.alert[role=alert]')).toHaveText('That email has already been invited.');
  });

  test('withdraws an invite and gives the share back', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await openTopic(page, 'Owners');
    await owner(page, 'carol@example.test').getByRole('button', { name: 'Withdraw' }).click();

    await expect(owner(page, 'carol@example.test')).toHaveCount(0);
    await expect(owner(page, 'me@example.test')).toContainText('75 %');
  });

  test('rebalances shares, only once they add up to exactly 100 %', async ({ page, api }) => {
    const apt = coOwned(api);
    await page.goto('/');
    await openTopic(page, 'Owners');
    await page.getByRole('button', { name: 'Edit shares' }).click();

    await expect(page.getByText('Total 100 %', { exact: true })).toBeVisible();
    await page.getByLabel('Share for bob@example.test').fill('20');
    await expect(page.getByText('Total 95 % — must be exactly 100 %')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save shares' })).toBeDisabled();
    await page.getByLabel('Share for me@example.test').fill('64.99');
    await page.getByLabel('Share for bob@example.test').fill('20.01');
    await page.getByRole('button', { name: 'Save shares' }).click();

    await expect(page.getByRole('button', { name: 'Edit shares' })).toBeVisible();
    expect(api.callsTo(`PUT /api/apartments/${apt.id}/shares`)[0]!.body).toEqual({
      owners: [
        { userId: ME.userId, sharePct: 64.99 },
        { userId: 'usr_bob', sharePct: 20.01 },
      ],
      invites: [{ id: apt.invites[0]!.id, sharePct: 15 }],
    });
    await expect(owner(page, 'me@example.test')).toContainText('64,99 %');
  });

  test('cancels an edit without saving, and explains a refused save', async ({ page, api }) => {
    coOwned(api);
    api.failNext('PUT', /\/shares$/, { status: 409, body: { error: 'The owners changed while you were editing. Reload and try again.' } });
    await page.goto('/');
    await openTopic(page, 'Owners');

    await page.getByRole('button', { name: 'Edit shares' }).click();
    await page.getByLabel('Share for bob@example.test').fill('1');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(owner(page, 'bob@example.test')).toContainText('25 %');
    expect(api.callsTo('PUT')).toEqual([]);

    await page.getByRole('button', { name: 'Edit shares' }).click();
    await page.getByRole('button', { name: 'Save shares' }).click();
    await expect(alert(page)).toHaveText('The owners changed while you were editing. Reload and try again.');
  });

  test('removes another owner whose share is already 0 %', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.owners[1]!.sharePct = 0;
    apt.owners[0]!.sharePct = 85;
    await page.goto('/');
    await openTopic(page, 'Owners');
    await owner(page, 'bob@example.test').getByRole('button', { name: 'Remove' }).click();

    await expect(owner(page, 'bob@example.test')).toHaveCount(0);
  });

  test('lets the viewer leave only once their share is 0 %, and asks first', async ({ page, api }) => {
    const apt = coOwned(api);
    api.addApartment({ name: 'Other' });
    await page.goto('/');
    await openApartment(page, 'Kauppakatu 12');
    await openTopic(page, 'Owners');
    await expect(page.getByRole('button', { name: 'Leave this apartment' })).toBeDisabled();
    await page.getByRole('button', { name: 'About leaving' }).click();
    await expect(page.getByRole('note')).toContainText('set it to 0 %');
    await page.keyboard.press('Escape');

    apt.owners[0]!.sharePct = 0;
    apt.owners[1]!.sharePct = 85;
    apt.mySharePct = 0;
    await page.reload();
    await openTopic(page, 'Owners');
    await expect(page.getByRole('button', { name: 'About leaving' })).toHaveCount(0);

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Leave this apartment' }).click();
    await expect(page.getByRole('heading', { name: 'Owners', exact: true })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Leave this apartment' }).click();
    // Back at the portfolio, which no longer lists it.
    await expect(page.getByRole('button', { name: /^Other/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Kauppakatu/ })).toHaveCount(0);
  });

  test('leaves settings through the bottom navigation', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openSettings(page);
    await section(page, 'Home');
    await expect(page.getByTestId('net-income')).toBeVisible();
  });
});

test.describe('apartment details', () => {
  test('saves edited details, including building depreciation for a property, from the save bar', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Property details');
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

    await page.getByLabel('Address').fill('Rantatie 5');
    await page.getByLabel('Housing company', { exact: true }).fill('As Oy Ranta');
    await page.getByLabel('Purchase date').fill('2020-05-04');
    await page.getByLabel('Purchase price (€)').fill('120000');
    // Clearing a number field stores 0, not an empty string.
    await page.getByLabel('Usual monthly rent (€)').fill('900');
    await page.getByLabel('Usual monthly rent (€)').fill('');
    await page.getByRole('radio', { name: 'Property of my own' }).click();
    // Depreciation is a topic of its own; what was typed here is kept on the way there.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.getByRole('button', { name: /^Building depreciation/ }).click();
    await page.getByRole('switch', { name: 'Deduct building depreciation in the declaration' }).click();
    await page.getByLabel('Building share (%)').fill('80');
    await page.getByLabel('Rate (% / year)').fill('2.5');
    await page.getByLabel('Depreciated in earlier years (€)').fill('1000');
    // (120 000 × 80 % − 1 000) × 2.5 %
    await expect(page.locator('.kv').filter({ hasText: 'This year' })).toContainText('2 375,00 €');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    // The list summarises what was saved.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page.getByRole('button', { name: /^Building depreciation.*On · 2.5 % a year/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Property details.*Rantatie 5/ })).toBeVisible();
    expect(apt.settings).toMatchObject({
      address: 'Rantatie 5',
      housingCompany: 'As Oy Ranta',
      purchaseDate: '2020-05-04',
      purchasePrice: 120000,
      monthlyRent: 0,
      propertyType: 'property',
      useDepreciation: true,
      buildingSharePct: 80,
      depreciationPrior: 1000,
    });
  });

  test('says a flat is not depreciated, and records whether its financing charge is deductible', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Property details');

    await expect(page.getByRole('radio', { name: 'Housing-company flat' })).toHaveAttribute('aria-checked', 'true');
    // At phone height the button starts under the floating bottom nav. A person scrolls it clear before
    // tapping; Playwright would instead scroll mid-click, and that scroll rightly closes the popover.
    const about = page.getByRole('button', { name: 'About the financing charge' });
    await about.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await about.click();
    await expect(page.getByRole('note')).toContainText('The property manager (isännöitsijä) can tell you which.');
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: 'The housing company books the financing charge as income' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    expect(apt.settings).toMatchObject({ propertyType: 'share', financingChargeDeductible: true });

    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page.getByRole('button', { name: /^Building depreciation.*Not used for a housing-company flat/ })).toBeVisible();
    await page.getByRole('button', { name: /^Building depreciation/ }).click();
    await expect(page.getByText('The price of a housing-company flat is not depreciated')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);

    // A property has no housing company, so no financing charge to ask about.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.getByRole('button', { name: /^Property details/ }).click();
    await page.getByRole('radio', { name: 'Property of my own' }).click();
    await expect(page.getByRole('switch', { name: /financing charge/ })).toHaveCount(0);
  });

  test('summarises a property that is not depreciated as off, and a flat as not applicable', async ({ page, api }) => {
    api.addApartment({ name: 'Own house', propertyType: 'property', useDepreciation: false });
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openApartment(page, 'Own house');
    await openSettings(page);
    await expect(page.getByRole('button', { name: /^Building depreciation.*Off/ })).toBeVisible();

    await openApartment(page, 'Flat');
    await openSettings(page);
    await expect(page.getByRole('button', { name: /^Building depreciation.*Not used for a housing-company flat/ })).toBeVisible();
  });

  test('discards unsaved details from the list of topics too', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', address: 'Old street 1' });
    await page.goto('/');
    await openTopic(page, 'Property details');
    await page.getByLabel('Address').fill('New street 2');
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page.getByRole('button', { name: /^Property details.*Old street 1/ })).toBeVisible();

    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await page.getByRole('button', { name: /^Property details/ }).click();
    await expect(page.getByLabel('Address')).toHaveValue('Old street 1');
  });

  test('discards edits, and will not save a nameless apartment', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Property details');

    await page.getByLabel('Name').fill('');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('Flat');
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    expect(api.callsTo('PATCH')).toEqual([]);
  });

  test('explains a refused save', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('PATCH', /\/apartments\/[^/]+$/, { status: 400, body: { error: 'purchaseDate: Not a real date' } });
    await page.goto('/');
    await openTopic(page, 'Property details');
    await page.getByLabel('Address').fill('x');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(alert(page)).toHaveText('purchaseDate: Not a real date');
  });
});

test.describe('deleting', () => {
  test('deletes an apartment its only owner deletes, after asking', async ({ page, api }) => {
    api.addApartment({ name: 'Kept' });
    api.addApartment({ name: 'Doomed' });
    await page.goto('/');
    await openApartment(page, 'Doomed');
    await openSettings(page);

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Delete this apartment' }).click();
    expect(api.apartments.size).toBe(2);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete this apartment' }).click();
    await expect(page.getByRole('button', { name: /^Kept/ })).toBeVisible();
    expect(api.apartments.size).toBe(1);
  });

  test('explains a refused delete, and offers none for a co-owned apartment', async ({ page, api }) => {
    api.addApartment({ name: 'Solo' });
    coOwned(api);
    api.failNext('DELETE', /\/apartments\/[^/]+$/, { status: 409, body: { error: 'Other owners still own part of this apartment. Leave it instead.' } });
    await page.goto('/');
    await openSettings(page);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete this apartment' }).click();
    await expect(alert(page)).toHaveText('Other owners still own part of this apartment. Leave it instead.');

    await openApartment(page, 'Kauppakatu 12');
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Delete this apartment' })).toHaveCount(0);
  });
});

test.describe('changes that race other people', () => {
  test('reports a failed refresh after a change, and keeps the change', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Rent');

    api.failNext('GET', new RegExp(`/api/apartments/${apt.id}$`), { status: 500, body: { error: 'Database unavailable' } });
    await page.locator('.month').first().click();
    await page.getByRole('radio', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('Database unavailable');
    expect(apt.rents).toHaveLength(1);
  });

  test('lets go of an apartment its other owner deleted meanwhile', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Rent');

    api.failNext('GET', new RegExp(`/api/apartments/${apt.id}$`), { status: 404, body: { error: 'Not found' } });
    await page.locator('.month').first().click();
    await page.getByRole('radio', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Couldn’t load this apartment.')).toBeVisible();
  });

  test('sends the viewer to sign in when their session ends mid-way', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Rent');
    api.signedIn = false;
    await page.locator('.month').first().click();
    await page.getByRole('radio', { name: 'Vacant' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
