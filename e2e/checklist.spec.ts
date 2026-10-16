import { expect, test } from './fixtures';
import { ME } from './fakeApi';
import { alert, openApartment, section } from './nav';
import { coOwned } from './data';

type Page = import('@playwright/test').Page;

const list = (page: Page) => page.getByRole('list', { name: 'Checklist items' });
const progress = (page: Page) => page.getByText(/^\d+ of \d+ done$/);
const newItem = (page: Page) => page.getByRole('textbox', { name: 'New item' });
const add = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });

const PLUMBER = { text: 'Call the plumber', done: false };
const SEEDED = [
  { text: 'Spare keys are in the drawer', done: false },
  PLUMBER,
  { text: 'Renew the insurance', done: true },
];

test.describe('the apartment’s checklist', () => {
  test('is a place of its own under the apartment, empty to begin with and saying what it is for', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Checklist');

    await expect(page.getByRole('heading', { name: 'Checklist', exact: true })).toBeVisible();
    await expect(page.getByText('Shared with every owner of this apartment.')).toBeVisible();
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await expect(progress(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Tax year' })).toHaveCount(0); // there are no figures to pick a year for
  });

  test('adds whatever is typed as an unticked checkbox, with nothing special to write', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Checklist');

    await expect(add(page)).toBeDisabled(); // nothing typed
    await newItem(page).fill('   ');
    await expect(add(page)).toBeDisabled(); // only spaces
    await newItem(page).fill('Call the plumber');
    await add(page).click();

    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).not.toBeChecked();
    await expect(newItem(page)).toHaveValue('');
    await expect(progress(page)).toHaveText('0 of 1 done');
    expect(api.callsTo(`PUT /api/apartments/${apt.id}/checklist`).map((c) => c.body)).toEqual([{ items: [PLUMBER] }]);

    await newItem(page).fill('  - Buy a smoke alarm ');
    await newItem(page).press('Enter');

    await expect(list(page).getByRole('checkbox')).toHaveCount(2);
    await expect(list(page).getByRole('checkbox', { name: '- Buy a smoke alarm' })).not.toBeChecked(); // a dash is just text
    await expect(progress(page)).toHaveText('0 of 2 done');
    expect(apt.checklist).toEqual([PLUMBER, { text: '- Buy a smoke alarm', done: false }]);
  });

  test('shows every item as a row of its own, a checkbox and its text, and ticks and unticks one at once', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('listitem')).toHaveText(SEEDED.map((i) => i.text));
    await expect(list(page).getByRole('checkbox')).toHaveCount(3);
    await expect(progress(page)).toHaveText('1 of 3 done');
    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).toBeChecked();

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).check();

    await expect(progress(page)).toHaveText('2 of 3 done');
    await expect.poll(() => apt.checklist).toEqual([SEEDED[0], { ...PLUMBER, done: true }, SEEDED[2]]);

    await list(page).getByRole('checkbox', { name: 'Renew the insurance' }).uncheck();

    await expect(progress(page)).toHaveText('1 of 3 done');
    await expect.poll(() => apt.checklist).toEqual([SEEDED[0], { ...PLUMBER, done: true }, { ...SEEDED[2]!, done: false }]);
  });

  test('ticks the box the moment it is tapped, before the save has come back', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    const release = api.holdNext('PUT', /\/checklist$/);

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).check();

    await expect(progress(page)).toHaveText('1 of 1 done');
    release();
  });

  test('is shared: what another owner wrote is there, and ticking it saves for them too', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.checklist = [{ text: 'Ask Bob about the roof', done: false }];
    await page.goto('/');
    await section(page, 'Checklist');

    await list(page).getByRole('checkbox', { name: 'Ask Bob about the roof' }).check();

    await expect(progress(page)).toHaveText('1 of 1 done');
    expect(apt.owners.map((o) => o.userId)).toEqual([ME.userId, 'usr_bob']);
    await expect.poll(() => apt.checklist).toEqual([{ text: 'Ask Bob about the roof', done: true }]);
  });

  test('keeps the box focused and free after adding, so the next item can be typed before the first has saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Checklist');
    const release = api.holdNext('PUT', /\/checklist$/);

    await newItem(page).fill('Call the plumber');
    await newItem(page).press('Enter');
    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).toBeVisible();
    await expect(newItem(page)).toBeFocused();
    await expect(newItem(page)).toHaveValue('');
    await page.keyboard.type('Buy a smoke alarm');
    await page.keyboard.press('Enter');
    await expect(list(page).getByRole('listitem')).toHaveText(['Call the plumber', 'Buy a smoke alarm']);
    release();

    await expect.poll(() => apt.checklist).toEqual([PLUMBER, { text: 'Buy a smoke alarm', done: false }]);
    expect(api.callsTo('PUT').map((c) => c.body)).toEqual([
      { items: [PLUMBER] },
      { items: [PLUMBER, { text: 'Buy a smoke alarm', done: false }] },
    ]);
  });

  test('removes one item with its ×, leaving the rest in order', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');

    await list(page).getByRole('button', { name: 'Remove Call the plumber' }).click();

    await expect(list(page).getByRole('listitem')).toHaveText(['Spare keys are in the drawer', 'Renew the insurance']);
    await expect(progress(page)).toHaveText('1 of 2 done');
    expect(apt.checklist).toEqual([SEEDED[0], SEEDED[2]]);
  });

  test('brings back the empty page when the last item is removed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');

    await list(page).getByRole('button', { name: 'Remove Call the plumber' }).click();

    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await expect(progress(page)).toHaveCount(0);
    expect(apt.checklist).toEqual([]);
  });

  test('has no editing mode: items are only added, ticked and removed one by one', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');

    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.locator('textarea')).toHaveCount(0);
  });

  test('says when a tick could not be saved, and puts the box back as it was', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 503, body: { error: 'Try again shortly' } });

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).click();

    await expect(alert(page)).toHaveText('Try again shortly');
    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).not.toBeChecked();
    await expect(progress(page)).toHaveText('0 of 1 done');
    expect(apt.checklist).toEqual([PLUMBER]);
  });

  test('keeps the typed item when it could not be added, and the item when it could not be removed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 400, body: { error: 'items: Too big' } });
    await newItem(page).fill('Buy a smoke alarm');
    await add(page).click();

    await expect(alert(page)).toHaveText('items: Too big');
    await expect(newItem(page)).toHaveValue('Buy a smoke alarm');
    await expect(list(page).getByRole('listitem')).toHaveText(['Call the plumber']);

    api.failNext('PUT', /\/checklist$/, { abort: true });
    await list(page).getByRole('button', { name: 'Remove Call the plumber' }).click();

    await expect(alert(page)).toContainText('Could not reach the server');
    await expect(list(page).getByRole('listitem')).toHaveText(['Call the plumber']);
    expect(apt.checklist).toEqual([PLUMBER]);
  });

  test('drops the changes queued behind a save that failed, and puts the list back as it was saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');
    const release = api.holdNext('PUT', /\/checklist$/);
    api.failNext('PUT', /\/checklist$/, { status: 503, body: { error: 'Try again shortly' } });

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).check();
    await list(page).getByRole('checkbox', { name: 'Spare keys are in the drawer' }).check();
    await expect(progress(page)).toHaveText('3 of 3 done');
    release();

    await expect(alert(page)).toHaveText('Try again shortly');
    await expect(progress(page)).toHaveText('1 of 3 done');
    expect(api.callsTo('PUT')).toHaveLength(1); // the second change was never sent
    expect(apt.checklist).toEqual(SEEDED);
  });

  test('does not overwrite what was typed next when the item before it could not be added', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Checklist');
    const release = api.holdNext('PUT', /\/checklist$/);
    api.failNext('PUT', /\/checklist$/, { status: 400, body: { error: 'items: Too big' } });
    await newItem(page).fill('Call the plumber');
    await newItem(page).press('Enter');
    await newItem(page).fill('Buy a smoke alarm');

    release();

    await expect(alert(page)).toHaveText('items: Too big');
    await expect(newItem(page)).toHaveValue('Buy a smoke alarm');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
  });

  test('is each apartment’s own', async ({ page, api }) => {
    api.addApartment({ name: 'Harbour' }, { checklist: [{ text: 'Harbour task', done: false }] });
    api.addApartment({ name: 'Forest' }, { checklist: [{ text: 'Forest task', done: false }] });
    await page.goto('/');
    await openApartment(page, 'Forest');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('listitem')).toHaveText(['Forest task']);

    await openApartment(page, 'Harbour');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('listitem')).toHaveText(['Harbour task']);
  });
});
