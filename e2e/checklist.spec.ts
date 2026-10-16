import { expect, test } from './fixtures';
import { ME } from './fakeApi';
import { alert, openApartment, section } from './nav';
import { coOwned } from './data';

type Page = import('@playwright/test').Page;

const list = (page: Page) => page.getByRole('list', { name: 'Checklist items' });
const progress = (page: Page) => page.getByText(/^\d+ of \d+ done$/);
const newItem = (page: Page) => page.getByRole('textbox', { name: 'New item' });
const add = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });

const PLUMBER = '- [ ] Call the plumber';
const SEEDED = ['Spare keys are in the drawer', '', PLUMBER, '- [x] Renew the insurance', '* [ ] Bleed the radiators', '- Water meter is in the hall'].join('\n');

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

  test('adds a task from the box under the list, one after another, each as an unticked checkbox', async ({ page, api }) => {
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
    expect(api.callsTo(`PUT /api/apartments/${apt.id}/checklist`).map((c) => c.body)).toEqual([{ text: PLUMBER }]);

    await newItem(page).fill('Buy a smoke alarm');
    await newItem(page).press('Enter');

    await expect(list(page).getByRole('checkbox')).toHaveCount(2);
    await expect(progress(page)).toHaveText('0 of 2 done');
    expect(apt.checklist).toBe(`${PLUMBER}\n- [ ] Buy a smoke alarm`);
  });

  test('ticks and unticks a task, saving the whole text with only that line changed', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');
    await expect(progress(page)).toHaveText('1 of 3 done');
    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).toBeChecked();

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).toBeChecked();
    await expect(progress(page)).toHaveText('2 of 3 done');
    expect(apt.checklist).toBe(SEEDED.replace(PLUMBER, '- [x] Call the plumber'));

    await list(page).getByRole('checkbox', { name: 'Renew the insurance' }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Renew the insurance' })).not.toBeChecked();
    await expect(progress(page)).toHaveText('1 of 3 done');
    expect(apt.checklist).toBe(SEEDED.replace(PLUMBER, '- [x] Call the plumber').replace('- [x] Renew', '- [ ] Renew'));
  });

  test('shows other lines as the bullets and plain text they were written as', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { checklist: SEEDED });
    await page.goto('/');
    await section(page, 'Checklist');

    await expect(list(page).getByRole('listitem')).toHaveText([
      'Spare keys are in the drawer',
      'Call the plumber',
      'Renew the insurance',
      'Bleed the radiators',
      'Water meter is in the hall',
    ]);
    await expect(list(page).getByRole('checkbox')).toHaveCount(3);
  });

  test('is shared: what another owner wrote is there, and ticking it saves for them too', async ({ page, api }) => {
    const apt = coOwned(api);
    apt.checklist = '- [ ] Ask Bob about the roof';
    await page.goto('/');
    await section(page, 'Checklist');

    await expect(list(page).getByRole('checkbox', { name: 'Ask Bob about the roof' })).not.toBeChecked();
    await list(page).getByRole('checkbox', { name: 'Ask Bob about the roof' }).click();

    await expect(progress(page)).toHaveText('1 of 1 done');
    expect(apt.owners.map((o) => o.userId)).toEqual([ME.userId, 'usr_bob']);
    expect(apt.checklist).toBe('- [x] Ask Bob about the roof');
  });

  test('edits the text as free text, and shows it as written once saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: PLUMBER });
    await page.goto('/');
    await section(page, 'Checklist');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();

    const text = page.getByRole('textbox', { name: 'Checklist text' });
    await expect(text).toHaveValue(PLUMBER);
    await expect(page.getByText('Start a line with “- [ ]” for a checkbox')).toBeVisible();
    await expect(newItem(page)).toHaveCount(0); // one way of editing at a time
    await text.fill('Door code 1234\n- [ ] Call the plumber\n- Meter in the hall');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(text).toHaveCount(0);
    await expect(list(page).getByRole('listitem')).toHaveText(['Door code 1234', 'Call the plumber', 'Meter in the hall']);
    expect(apt.checklist).toBe('Door code 1234\n- [ ] Call the plumber\n- Meter in the hall');
  });

  test('throws the edit away on Cancel and keeps what was saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: PLUMBER });
    await page.goto('/');
    await section(page, 'Checklist');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Checklist text' }).fill('something else');

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).toBeVisible();
    expect(api.callsTo('PUT')).toEqual([]);
    expect(apt.checklist).toBe(PLUMBER);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Checklist text' })).toHaveValue(PLUMBER); // not the thrown-away draft
  });

  test('can be emptied, which brings back the empty page', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: PLUMBER });
    await page.goto('/');
    await section(page, 'Checklist');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Checklist text' }).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    expect(apt.checklist).toBe('');
  });

  test('says when a tick could not be saved, and leaves the task as it was', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: PLUMBER });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 503, body: { error: 'Try again shortly' } });

    await list(page).getByRole('checkbox', { name: 'Call the plumber' }).click();

    await expect(alert(page)).toHaveText('Try again shortly');
    await expect(list(page).getByRole('checkbox', { name: 'Call the plumber' })).not.toBeChecked();
    expect(apt.checklist).toBe(PLUMBER);
  });

  test('keeps the typed task when it could not be added, and the draft when an edit could not be saved', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' }, { checklist: PLUMBER });
    await page.goto('/');
    await section(page, 'Checklist');
    api.failNext('PUT', /\/checklist$/, { status: 400, body: { error: 'text: Too big' } });
    await newItem(page).fill('Buy a smoke alarm');
    await add(page).click();

    await expect(alert(page)).toHaveText('text: Too big');
    await expect(newItem(page)).toHaveValue('Buy a smoke alarm');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(alert(page)).toHaveCount(0); // a new try starts clean
    await page.getByRole('textbox', { name: 'Checklist text' }).fill('A new text');
    api.failNext('PUT', /\/checklist$/, { abort: true });
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(alert(page)).toContainText('Could not reach the server');
    await expect(page.getByRole('textbox', { name: 'Checklist text' })).toHaveValue('A new text');
    expect(apt.checklist).toBe(PLUMBER);
  });

  test('is each apartment’s own', async ({ page, api }) => {
    api.addApartment({ name: 'Harbour' }, { checklist: '- [ ] Harbour task' });
    api.addApartment({ name: 'Forest' }, { checklist: '- [ ] Forest task' });
    await page.goto('/');
    await openApartment(page, 'Forest');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('listitem')).toHaveText(['Forest task']);

    await openApartment(page, 'Harbour');
    await section(page, 'Checklist');
    await expect(list(page).getByRole('listitem')).toHaveText(['Harbour task']);
  });
});
