import { expect, test } from './fixtures';
import { ME } from './fakeApi';
import { alert, openApartment, section } from './nav';
import { coOwned } from './data';

type Page = import('@playwright/test').Page;

const list = (page: Page) => page.getByRole('list', { name: 'Checklist items' });
const progress = (page: Page) => page.getByText(/^\d+ of \d+ done$/);
const newItem = (page: Page) => page.getByRole('textbox', { name: 'New item' });
const add = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });
const editBox = (page: Page) => page.getByRole('textbox', { name: 'Checklist text' });

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

  test('shows every item as a checkbox and ticks and unticks one, leaving the others alone', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('checkbox')).toHaveCount(3);
    await expect(progress(page)).toHaveText('1 of 3 done');
    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).toBeChecked();

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).toBeChecked();
    await expect(progress(page)).toHaveText('2 of 3 done');
    expect(apt.checklist).toEqual([SEEDED[0], { ...PLUMBER, done: true }, SEEDED[2]]);

    await list(page).getByRole('checkbox', { name: 'Renew the insurance' }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).not.toBeChecked();
    await expect(progress(page)).toHaveText('1 of 3 done');
    expect(apt.checklist).toEqual([SEEDED[0], { ...PLUMBER, done: true }, { ...SEEDED[2]!, done: false }]);
  });

  test('is shared: what another owner wrote is there, and ticking it saves for them too', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.checklist = [{ text: 'Ask Bob about the roof', done: false }];
    await page.goto('/');
    await section(page, 'Checklist');

    await list(page).getByRole('checkbox', { name: 'Ask Bob about the roof' }).click();

    await expect(progress(page)).toHaveText('1 of 1 done');
    expect(apt.owners.map((o) => o.userId)).toEqual([ME.userId, 'usr_bob']);
    expect(apt.checklist).toEqual([{ text: 'Ask Bob about the roof', done: true }]);
  });

  test('edits the items as plain lines, one each, keeping the ticks of the ones left unchanged', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();

    await expect(editBox(page)).toHaveValue('Spare keys are in the drawer\nCall the plumber\nRenew the insurance');
    await expect(page.getByText('One item per line.')).toBeVisible();
    await expect(newItem(page)).toHaveCount(0); // one way of editing at a time
    await editBox(page).fill('Renew the insurance\n\nCall the plumber about the tap\nDoor code 1234');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(editBox(page)).toHaveCount(0);
    await expect(list(page).getByRole('checkbox')).toHaveCount(3);
    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).toBeChecked();
    expect(apt.checklist).toEqual([
      { text: 'Renew the insurance', done: true },
      { text: 'Call the plumber about the tap', done: false },
      { text: 'Door code 1234', done: false },
    ]);
  });

  test('throws the edit away on Cancel and keeps what was saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await editBox(page).fill('something else');

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).toBeVisible();
    expect(api.callsTo('PUT')).toEqual([]);
    expect(apt.checklist).toEqual([PLUMBER]);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(editBox(page)).toHaveValue('Call the plumber'); // not the thrown-away draft
  });

  test('can be emptied, which brings back the empty page', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await editBox(page).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    expect(apt.checklist).toEqual([]);
  });

  test('says when a tick could not be saved, and leaves the item as it was', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 503, body: { error: 'Try again shortly' } });

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).click();

    await expect(alert(page)).toHaveText('Try again shortly');
    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).not.toBeChecked();
    expect(apt.checklist).toEqual([PLUMBER]);
  });

  test('keeps the typed item when it could not be added, and the draft when an edit could not be saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: [PLUMBER] });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 400, body: { error: 'items: Too big' } });
    await newItem(page).fill('Buy a smoke alarm');
    await add(page).click();

    await expect(alert(page)).toHaveText('items: Too big');
    await expect(newItem(page)).toHaveValue('Buy a smoke alarm');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(alert(page)).toHaveCount(0); // a new try starts clean
    await editBox(page).fill('A new item');
    api.failNext('PUT', /\/checklist$/, { abort: true });
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(alert(page)).toContainText('Could not reach the server');
    await expect(editBox(page)).toHaveValue('A new item');
    expect(apt.checklist).toEqual([PLUMBER]);
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
