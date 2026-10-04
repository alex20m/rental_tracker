import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned, ledger, YEAR } from './data';
import { ME } from './fakeApi';
import { alert, openApartment, openInfo, openSettings, openTopic, section } from './nav';

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
  test('saves edited details, and building depreciation for a property from Advanced, from the one save bar', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Property details');
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

    await page.getByLabel('Address').fill('Rantatie 5');
    await page.getByLabel('Housing company', { exact: true }).fill('As Oy Ranta');
    // Clearing a number field stores 0, not an empty string.
    await page.getByLabel('Usual monthly rent (€)').fill('900');
    await page.getByLabel('Usual monthly rent (€)').fill('');
    // The purchase, the kind of property and its depreciation are under Advanced; what was typed here is kept on the way there.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.getByRole('button', { name: /^Advanced/ }).click();
    await page.getByLabel('Purchase date').fill('2020-05-04');
    await page.getByLabel('Purchase price (€)').fill('120000');
    await page.getByRole('radio', { name: 'Property of my own' }).click();
    await page.getByRole('switch', { name: 'Deduct building depreciation in the declaration' }).click();
    await page.getByLabel('Building share (%)').fill('80');
    await page.getByLabel('Rate (% / year)').fill('2.5');
    // The count starts this year, with 1 000 € already deducted before it.
    await page.getByLabel('Calculate from tax year').fill(String(YEAR));
    await page.getByLabel('Depreciated before that year (€)').fill('1000');
    // (120 000 × 80 % − 1 000) × 2.5 %
    await expect(page.locator('.kv').filter({ hasText: 'This year' })).toContainText('2 375,00 €');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    // The list summarises what was saved.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page.getByRole('button', { name: /^Advanced.*Property of my own · Building depreciation 2.5 %/ })).toBeVisible();
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
      depreciationFromYear: YEAR,
    });
  });

  test('chooses the kind of building, which sets the highest rate, and adds the purchase costs to its cost', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Shop', propertyType: 'property', useDepreciation: true, purchasePrice: 200000 });
    await page.goto('/');
    await openTopic(page, 'Advanced');
    const thisYear = page.locator('.kv').filter({ hasText: 'This year' });
    await expect(thisYear).toContainText('8 000,00 €');

    await page.getByRole('radio', { name: 'Shop, warehouse, factory, workshop' }).click();
    await expect(page.getByLabel('Rate (% / year)')).toHaveValue('7');
    await expect(page.getByLabel('Rate (% / year)')).toHaveAttribute('max', '7');
    await expect(thisYear).toContainText('14 000,00 €');
    await openInfo(page, 'About the rate');
    await expect(page.getByRole('note')).toContainText('up to the highest rate for the kind of building (7 %)');
    await page.keyboard.press('Escape');

    // (200 000 + 6 000) × 7 %
    await page.getByLabel('Purchase costs (€)').fill('6000');
    await expect(thisYear).toContainText('14 420,00 €');
    // It may be claimed at less than the highest rate.
    await page.getByLabel('Rate (% / year)').fill('5');
    await expect(thisYear).toContainText('10 300,00 €');
    await openInfo(page, 'About the kind of building');
    await expect(page.getByRole('note')).toContainText('at most 4 % a year; shops, warehouses, factories and workshops by at most 7 %');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    expect(apt.settings).toMatchObject({ buildingKind: 'commercial', depreciationRate: 5, purchaseCosts: 6000 });

    await page.getByRole('radio', { name: 'Residential or office' }).click();
    await expect(page.getByLabel('Rate (% / year)')).toHaveValue('4');
  });

  test('shows the year depreciation is counted from, and carries what is left from year to year', async ({ page, api }) => {
    api.addApartment(
      { name: 'House', propertyType: 'property', useDepreciation: true, purchasePrice: 100000 },
      { rents: [{ month: `${YEAR - 1}-12`, status: 'paid', amount: 800, receivedDate: `${YEAR - 1}-12-03`, note: '' }] },
    );
    await page.goto('/');
    await openTopic(page, 'Advanced');

    await expect(page.getByLabel('Calculate from tax year')).toHaveAttribute('placeholder', String(YEAR - 1));
    // 4 000 € last year leaves 96 000 €, and 4 % of that is this year's.
    await expect(page.locator('.kv').filter({ hasText: 'This year' })).toContainText('3 840,00 €');
    await openInfo(page, 'About the first year');
    await expect(page.getByRole('note')).toContainText('assuming the highest was claimed every year');
  });

  test('records that only part of the home is let, and that the rent is below the usual', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Advanced');

    // Clearing the field leaves it empty rather than showing a 0 that nothing could be let at.
    await page.getByLabel('Share of the home that is let (%)').fill('');
    await expect(page.getByLabel('Share of the home that is let (%)')).toHaveValue('');
    await page.getByLabel('Share of the home that is let (%)').fill('60');
    await openInfo(page, 'About the let share');
    await expect(page.getByRole('note')).toContainText('count only by this share');
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: 'The rent is below the usual rent for the flat' }).click();
    await openInfo(page, 'About below-market rent');
    await expect(page.getByRole('note')).toContainText('interest on the loan for the flat is not deductible at all');
    await page.keyboard.press('Escape');
    await openInfo(page, 'About letting');
    await expect(page.getByRole('note')).toContainText('let only part of the home');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    expect(apt.settings).toMatchObject({ letSharePct: 60, belowMarketRent: true });
  });

  test('chooses the flat-rate furniture deduction and the size of the flat', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');
    await openTopic(page, 'Advanced');
    await expect(page.getByRole('radiogroup', { name: 'Size of the flat' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Actual costs' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: 'Flat rate' }).click();
    await expect(page.getByRole('radio', { name: 'Larger' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Studio or one room' }).click();
    await openInfo(page, 'About the furniture deduction');
    await expect(page.getByRole('note')).toContainText('€40 a month for a studio or one room, €60 for a larger flat');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    expect(apt.settings).toMatchObject({ furnishing: 'flat', roomClass: 'studio' });

    await page.getByRole('radio', { name: 'Actual costs' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Size of the flat' })).toHaveCount(0);
  });

  test('records whether the financing charge is deductible, and says a flat is not depreciated', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Property details');

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

    // A flat is the standard case, so Advanced says so, and a flat is not depreciated.
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page.getByRole('button', { name: /^Advanced.*Standard: a whole apartment in a housing company/ })).toBeVisible();
    await page.getByRole('button', { name: /^Advanced/ }).click();
    await expect(page.getByRole('radio', { name: 'Housing-company flat' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('The price of a housing-company flat is not depreciated')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Deduct building depreciation in the declaration' })).toHaveCount(0);

    // A property has no housing company, so no financing charge to ask about back on the details.
    await page.getByRole('radio', { name: 'Property of my own' }).click();
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.getByRole('button', { name: /^Property details/ }).click();
    await expect(page.getByRole('switch', { name: /financing charge/ })).toHaveCount(0);
  });

  test('lists the advanced choices in use, each one that departs from the standard case', async ({ page, api }) => {
    api.addApartment({ name: 'Own house', propertyType: 'property', useDepreciation: false });
    api.addApartment({ name: 'Part', letSharePct: 60, belowMarketRent: true, furnishing: 'flat' });
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openApartment(page, 'Own house');
    await openSettings(page);
    await expect(page.getByRole('button', { name: /^Advanced.*Property of my own$/ })).toBeVisible();

    await openApartment(page, 'Part');
    await openSettings(page);
    await expect(page.getByRole('button', { name: /^Advanced.*60 % of the home let · Rent below the usual · Furniture flat rate$/ })).toBeVisible();

    await openApartment(page, 'Flat');
    await openSettings(page);
    await expect(page.getByRole('button', { name: /^Advanced.*Standard: a whole apartment in a housing company/ })).toBeVisible();
  });

  test('explains Advanced: who it is for', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Advanced');
    await openInfo(page, 'About the advanced settings');
    await expect(page.getByRole('note')).toContainText('Most landlords never need this.');
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
