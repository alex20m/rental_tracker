import { expect, test } from './fixtures';
import { alert, openTopic, section } from './nav';

const now = new Date();
const thisMonth = now.toISOString().slice(0, 7);
const monthName = (iso: string) =>
  new Date(`${iso}-15T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const following = (iso: string) => {
  const d = new Date(`${iso}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
};
const nextAfterNow = monthName(following(thisMonth));

test.describe('recurring expenses in the apartment settings', () => {
  test('says nothing repeats yet, in the list of topics and on its own page', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Settings');
    await expect(page.getByRole('button', { name: /^Recurring expenses/ })).toContainText('Nothing repeats yet');

    await openTopic(page, 'Recurring expenses');
    await expect(page.getByText('Nothing repeats yet. Add a cost or the rent')).toBeVisible();
  });

  test('adds the rent, which books this month at once and shows what it books next', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: 'Add recurring item' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add recurring item' });
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled(); // an amount is needed
    await expect(sheet.getByRole('radio', { name: 'Rent' })).toBeChecked();
    await expect(sheet.getByRole('radiogroup', { name: 'Category' })).toHaveCount(0); // rent has none
    await sheet.getByLabel('Amount every month (€)').fill('800');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(sheet).toHaveCount(0);
    const row = page.getByRole('button', { name: /Monthly rent/ });
    await expect(row).toContainText(`books next in ${nextAfterNow}`);
    await expect(row).toContainText('800,00 € a month');
    expect(api.callsTo(`POST /api/apartments/${apt.id}/recurring`)[0]!.body).toEqual({
      kind: 'rent',
      description: '',
      amount: 800,
      dayOfMonth: 1,
      firstMonth: thisMonth,
    });
    expect(apt.rents).toEqual([{ month: thisMonth, status: 'paid', amount: 800, receivedDate: `${thisMonth}-01`, note: '' }]);
  });

  test('adds a cost in a category, starting in a past month, which books every month since', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: 'Add recurring item' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add recurring item' });
    await sheet.getByRole('radio', { name: 'Expense' }).click();
    await expect(sheet.getByRole('radio', { name: 'Maintenance charge' })).toBeChecked();
    await expect(sheet.getByRole('radio', { name: 'Basic improvement' })).toHaveCount(0); // not paid monthly
    await expect(sheet.getByRole('radio', { name: 'Furniture & appliances' })).toHaveCount(0);
    await sheet.getByRole('radio', { name: 'Insurance' }).click();
    await sheet.getByLabel('Amount every month (€)').fill('25.5');
    await sheet.getByLabel('Description').fill('Home insurance');
    await sheet.getByLabel('First month', { exact: true }).fill(`${now.getUTCFullYear() - 1}-11`);
    await sheet.getByLabel('Day of the month', { exact: true }).fill('15');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Home insurance/ })).toContainText('Insurance');
    expect(api.callsTo(`POST /api/apartments/${apt.id}/recurring`)[0]!.body).toEqual({
      kind: 'cost',
      category: 'insurance',
      description: 'Home insurance',
      amount: 25.5,
      dayOfMonth: 15,
      firstMonth: `${now.getUTCFullYear() - 1}-11`,
    });
    expect(apt.costs.length).toBeGreaterThanOrEqual(2);
    expect(apt.costs.every((c) => c.category === 'insurance' && c.amount === 25.5 && c.date.endsWith('-15'))).toBe(true);
  });

  test('offers only expenses once the rent repeats, and a cost with no description is named by its category', async ({ page, api }) => {
    api.addApartment(
      { name: 'Flat' },
      {
        recurring: [
          { id: 'r-rent', kind: 'rent', description: '', amount: 800, dayOfMonth: 1, nextMonth: thisMonth },
          { id: 'r-charge', kind: 'cost', category: 'maintenance_charge', description: '', amount: 150, dayOfMonth: 1, nextMonth: thisMonth },
        ],
      },
    );
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await expect(page.getByRole('button', { name: /Maintenance charge/ })).toContainText('150,00 € a month');

    await page.getByRole('button', { name: 'Add recurring item' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add recurring item' });
    await expect(sheet.getByRole('radiogroup', { name: 'What repeats' })).toHaveCount(0);
    await expect(sheet.getByRole('radiogroup', { name: 'Category' })).toBeVisible();
  });

  test('changes an entry for the months to come, and says what stays', async ({ page, api }) => {
    const apt = api.addApartment(
      { name: 'Flat' },
      { recurring: [{ id: 'r-charge', kind: 'cost', category: 'maintenance_charge', description: 'Hoitovastike', amount: 150, dayOfMonth: 1, nextMonth: `${thisMonth}` }] },
    );
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: /Hoitovastike/ }).click();

    const sheet = page.getByRole('dialog', { name: 'Edit recurring item' });
    await expect(sheet.getByText('A change applies to the months not booked yet.')).toBeVisible();
    await expect(sheet.getByLabel('First month', { exact: true })).toHaveCount(0);
    await expect(sheet.getByLabel('Amount every month (€)')).toHaveValue('150');
    await expect(sheet.getByLabel('Day of the month', { exact: true })).toHaveValue('1');
    await sheet.getByLabel('Day of the month', { exact: true }).fill('20');
    await sheet.getByLabel('Amount every month (€)').fill('160');
    await sheet.getByRole('radio', { name: 'Utilities paid by owner' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(sheet).toHaveCount(0);
    expect(api.callsTo('PUT /api/apartments')[0]!.body).toEqual({ category: 'utilities', description: 'Hoitovastike', amount: 160, dayOfMonth: 20 });
    expect(apt.recurring[0]).toMatchObject({ category: 'utilities', amount: 160, dayOfMonth: 20 });
  });

  test('changes the rent without sending a category', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { recurring: [{ id: 'r-rent', kind: 'rent', description: '', amount: 800, dayOfMonth: 1, nextMonth: thisMonth }] });
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: /Monthly rent/ }).click();

    const sheet = page.getByRole('dialog', { name: 'Edit recurring item' });
    await expect(sheet.getByRole('radiogroup', { name: 'Category' })).toHaveCount(0);
    await sheet.getByLabel('Amount every month (€)').fill('850');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('button', { name: /Monthly rent/ })).toContainText('850,00 € a month');
    expect(api.callsTo('PUT /api/apartments')[0]!.body).toEqual({ description: '', amount: 850, dayOfMonth: 1 });
  });

  test('stops an entry with Delete and lists it as one fewer', async ({ page, api }) => {
    const apt = api.addApartment(
      { name: 'Flat' },
      {
        recurring: [
          { id: 'r-rent', kind: 'rent', description: '', amount: 800, dayOfMonth: 1, nextMonth: thisMonth },
          { id: 'r-charge', kind: 'cost', category: 'insurance', description: '', amount: 30, dayOfMonth: 1, nextMonth: thisMonth },
        ],
      },
    );
    await page.goto('/');
    await section(page, 'Settings');
    await expect(page.getByRole('button', { name: /^Recurring expenses/ })).toContainText('2 items booked every month');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: /Insurance/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('button', { name: /Insurance/ })).toHaveCount(0);
    await expect(page.getByText('1 item booked every month')).toBeVisible();
    expect(apt.recurring.map((r) => r.id)).toEqual(['r-rent']);
  });

  test('only accepts a day from 1 to 28', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: 'Add recurring item' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add recurring item' });
    await sheet.getByLabel('Amount every month (€)').fill('800');
    const save = sheet.getByRole('button', { name: 'Save' });

    await expect(save).toBeEnabled();
    for (const day of ['0', '29', '1.5', '']) {
      await sheet.getByLabel('Day of the month', { exact: true }).fill(day);
      await expect(save, `day "${day}"`).toBeDisabled();
    }
    await sheet.getByLabel('Day of the month', { exact: true }).fill('28');
    await expect(save).toBeEnabled();
  });

  test('says why a change was refused, and keeps the form open', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    api.failNext('POST', /\/recurring$/, { status: 409, body: { error: 'The rent already repeats every month. Change that one instead.' } });
    await page.goto('/');
    await openTopic(page, 'Recurring expenses');
    await page.getByRole('button', { name: 'Add recurring item' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add recurring item' });
    await sheet.getByLabel('Amount every month (€)').fill('800');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(alert(page)).toHaveText('The rent already repeats every month. Change that one instead.');
    await expect(sheet).toBeVisible();
  });
});

test.describe('repeating from the ordinary forms', () => {
  test('a new cost can repeat from the month after, and then shows under recurring expenses', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('30');
    await sheet.getByRole('radio', { name: 'Insurance' }).click();
    await expect(sheet.getByText('Books the same again')).toHaveCount(0);
    await sheet.getByRole('switch', { name: 'Repeat every month' }).click();
    await expect(sheet.getByText(`on day ${Math.min(now.getDate(), 28)}, from ${nextAfterNow}`)).toBeVisible();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toHaveCount(0);

    expect(api.callsTo(`POST /api/apartments/${apt.id}/costs`)[0]!.body).toMatchObject({ category: 'insurance', amount: 30, repeatMonthly: true });
    await openTopic(page, 'Recurring expenses');
    await expect(page.getByRole('button', { name: /Insurance/ })).toContainText('30,00 € a month');
  });

  test('a cost saved without the switch does not repeat, and the switch is not offered for an improvement', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: 'Add cost' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add cost' });
    await sheet.getByLabel('Amount (€)').fill('30');
    await sheet.getByRole('radio', { name: 'Insurance' }).click();
    await sheet.getByRole('switch', { name: 'Repeat every month' }).click();
    await sheet.getByRole('radio', { name: 'Basic improvement' }).click();
    await expect(sheet.getByRole('switch', { name: 'Repeat every month' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Save' }).click();

    expect(api.callsTo('POST')[0]!.body).not.toHaveProperty('repeatMonthly'); // ticked, then moved to a category that cannot repeat
    expect(apt.recurring).toEqual([]);
  });

  test('an existing cost cannot be made to repeat from its edit form', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, { costs: [{ id: 'c1', date: `${thisMonth}-01`, category: 'insurance', description: '', amount: 30, hasReceipt: false }] });
    await page.goto('/');
    await section(page, 'Costs');
    await page.getByRole('button', { name: /Insurance/ }).click();

    await expect(page.getByRole('dialog', { name: 'Edit cost' }).getByRole('switch')).toHaveCount(0);
  });

  test('a paid rent month can repeat, but a vacant one cannot, and none is offered once the rent repeats', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat', monthlyRent: 800 });
    await page.goto('/');
    await section(page, 'Rent');
    await page.locator('.month.todo-m').first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('radio', { name: 'Vacant' }).click();
    await expect(sheet.getByRole('switch', { name: 'Repeat every month' })).toHaveCount(0);
    await sheet.getByRole('radio', { name: 'Paid', exact: true }).click();
    await sheet.getByRole('switch', { name: 'Repeat every month' }).click();
    await expect(sheet.getByText(/Books the same again every month on day \d+, from/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toHaveCount(0);

    expect(apt.recurring).toEqual([expect.objectContaining({ kind: 'rent', amount: 800 })]);
    await page.locator('.month.paid').first().click();
    await expect(sheet.getByRole('radio', { name: 'Paid', exact: true })).toBeChecked();
    await expect(sheet.getByRole('switch', { name: 'Repeat every month' })).toHaveCount(0);
  });

  test('rent saved without the switch does not repeat', async ({ page, api }) => {
    const apt = api.addApartment({ name: 'Flat', monthlyRent: 800 });
    await page.goto('/');
    await section(page, 'Rent');
    await page.locator('.month.todo-m').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.month.paid')).toHaveCount(1);
    expect(apt.recurring).toEqual([]);
    expect(api.callsTo('PUT')[0]!.body).not.toHaveProperty('repeatMonthly');
  });
});
