import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned, ledger, m, YEAR } from './data';
import { alert, openAccount, openMenu, openPortfolio, section } from './nav';

const netIncome = (page: Page) => page.getByTestId('net-income');

test.describe('the first visit', () => {
  test('asks for a first apartment by name, and opens it', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add apartment' })).toBeDisabled();

    await page.getByLabel('Apartment name').fill('  Rantatie 5  ');
    await page.getByRole('button', { name: 'Add apartment' }).click();

    await expect(page.locator('h1.aptname')).toHaveText('Rantatie 5');
    expect(api.callsTo('POST /api/apartments')[0]!.body).toEqual({ name: 'Rantatie 5' });
    // A new apartment has nothing logged yet, and Home says how to start.
    await expect(page.getByText('Nothing logged yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Log the first rent' }).click();
    await expect(page.getByRole('heading', { name: 'Months' })).toBeVisible();
  });

  test('says when the apartment list could not be refreshed after adding one', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    api.failNext('GET', /^\/api\/apartments$/, { status: 503, body: { error: 'Try again shortly' } });
    await page.getByLabel('Apartment name').fill('Rantatie 5');
    await page.getByRole('button', { name: 'Add apartment' }).click();

    await expect(alert(page).first()).toHaveText('Try again shortly');
    expect(api.apartments.size).toBe(1);
  });

  test('says why the apartment could not be added', async ({ page, api }) => {
    api.failNext('POST', /^\/api\/apartments$/, { status: 400, body: { error: 'name: Give the apartment a name' } });
    await page.goto('/');
    await page.getByLabel('Apartment name').fill('x');
    await page.getByRole('button', { name: 'Add apartment' }).click();

    await expect(alert(page)).toHaveText('name: Give the apartment a name');
  });
});

test.describe('loading', () => {
  test('shows why the portfolio could not be loaded', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/apartments$/, { status: 500, body: { error: 'Database unavailable' } });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Database unavailable');
    await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  });

  test('explains a server that answers without saying why', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/me$/, { status: 502, text: 'Bad gateway' });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Request failed (502)');
  });

  test('says when the server cannot be reached at all', async ({ page, api }) => {
    api.failNext('GET', /^\/api\/me$/, { abort: true });
    await page.goto('/');

    await expect(alert(page)).toHaveText('Could not reach the server. Check your connection and try again.');
  });

  test('offers to retry an apartment whose details failed to load', async ({ page, api }) => {
    const flaky = api.addApartment({ name: 'Flaky' }, ledger());
    api.failNext('GET', new RegExp(`/api/apartments/${flaky.id}$`), { status: 500 });
    await page.goto('/');

    await expect(page.getByText('Couldn’t load this apartment.')).toBeVisible();
    await expect(page.locator('h1.aptname')).toHaveText('Flaky');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(netIncome(page)).toBeVisible();
  });

  test('still works when the browser refuses to store anything', async ({ page, api }) => {
    api.addApartment({ name: 'Private mode' });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage disabled');
        },
      });
    });
    await page.goto('/');

    await expect(page.locator('h1.aptname')).toHaveText('Private mode');
  });
});

test.describe('home', () => {
  test("shows the viewer's share of a co-owned apartment, or the whole of it", async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');

    // 60 % of (2 400 rent − 216 costs − 2 500 depreciation) = −189,60.
    await expect(page.getByText(`Rental loss · ${YEAR}`)).toBeVisible();
    await expect(netIncome(page)).toHaveText('−189,60 €');
    await page.getByRole('radio', { name: 'Whole apartment' }).click();
    await expect(netIncome(page)).toHaveText('−316,00 €');
    await page.getByRole('radio', { name: 'Your share · 60 %' }).click();
    await expect(netIncome(page)).toHaveText('−189,60 €');
  });

  test('shows a sole-owned profit with no share toggle', async ({ page, api }) => {
    api.addApartment({ name: 'Solo', purchasePrice: 100000 }, { rents: ledger().rents });
    await page.goto('/');

    await expect(page.getByText(`Net rental income · ${YEAR}`)).toBeVisible();
    await expect(netIncome(page)).toHaveText('2 400,00 €');
    await expect(page.getByRole('radiogroup', { name: 'Figures for' })).toHaveCount(0);
    // 3 paid of 4 logged; 2 400 / 100 000.
    await expect(page.getByText('75 %', { exact: true })).toBeVisible();
    await expect(page.getByText('2.4 %', { exact: true })).toBeVisible();
  });

  test('shows dashes for occupancy and yield while only a cost is logged and no price is known', async ({ page, api }) => {
    api.addApartment({ name: 'Flat', purchasePrice: 0 }, { costs: [ledger().costs[0]!] });
    await page.goto('/');

    await expect(page.locator('.insights .v')).toHaveText(['—', '—']);
  });

  test('lists what is left to do, each item leading to where it is fixed', async ({ page, api }) => {
    coOwned(api);
    api.emailVerified = true;
    await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
    await page.goto('/');

    const todo = page.locator('.todo');
    for (const [item, arrival] of [
      ['8 months not logged yet', page.getByRole('heading', { name: 'Months' })],
      ['3 costs have no receipt photo', page.getByRole('button', { name: 'Add cost' })],
      ['1 invited owner hasn’t joined yet — check the shares are final', page.getByRole('heading', { name: 'Apartment settings', exact: true })],
    ] as const) {
      await todo.getByRole('button', { name: item }).click();
      await expect(arrival).toBeVisible();
      await section(page, 'Home');
    }
  });

  test('lists three to-do items and counts the rest, leading to the Tax checklist', async ({ page, api }) => {
    coOwned(api); // months, receipts and an invitation to check: three. A depreciated property with no price makes four.
    api.apartments.forEach((a) => Object.assign(a.settings, { propertyType: 'property', useDepreciation: true, purchasePrice: 0 }));
    await page.goto('/');

    await expect(page.locator('.todo .dot')).toHaveCount(3);
    await page.getByRole('button', { name: '1 more to check' }).click();
    await expect(page.getByRole('heading', { name: 'Before you file' })).toBeVisible();
  });

  test('says when an apartment is ready to declare', async ({ page, api }) => {
    const rents = Array.from({ length: 12 }, (_, i) => ({
      month: m(i + 1),
      status: 'paid' as const,
      amount: 800,
      receivedDate: `${m(i + 1)}-03`,
      note: '',
    }));
    api.addApartment({ name: 'Done', purchasePrice: 1000 }, { rents });
    await page.clock.setFixedTime(new Date(`${YEAR}-12-15T12:00:00`));
    await page.goto('/');

    await expect(page.getByText(`Ready for the ${YEAR} declaration`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'To do' })).toHaveCount(0);
    await page.getByRole('button', { name: `Prepare the ${YEAR} declaration` }).click();
    await expect(page.getByRole('heading', { name: 'Before you file' })).toBeVisible();
  });

  test('lists the most recent activity first, each row leading to its log', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');

    const rows = page.locator('section').filter({ hasText: 'Recent' }).locator('li');
    await expect(rows).toHaveCount(3);
    // April's vacancy is newest; a month with no rent shows a dash, not "+0,00 €".
    await expect(rows.nth(0)).toContainText(`Vacant April ${YEAR}`);
    await expect(rows.nth(0)).toContainText('—');
    await expect(rows.nth(1)).toContainText('Rahoitusvastike');
    await expect(rows.nth(1)).toContainText('−80,00 €');
    await expect(rows.nth(2)).toContainText('+800,00 €');

    await rows.nth(1).click();
    await expect(page.getByRole('button', { name: 'Add cost' })).toBeVisible();
    await section(page, 'Home');
    await rows.nth(2).click();
    await expect(page.getByRole('heading', { name: 'Months' })).toBeVisible();
  });

  test('describes the year in the chart, and holds back the declaration while there is still something to fix', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');

    await expect(page.getByRole('img', { name: `Rent received 2 400,00 € and costs 216,00 € in ${YEAR}, by month` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Prepare the ${YEAR} declaration` })).toHaveCount(0);
  });

  test('changes the year from a quiet list of the years that have data, and nothing else', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');

    const year = page.getByLabel('Tax year');
    await expect(year).toHaveValue(String(YEAR));
    await expect(year.locator('option')).toHaveText([String(YEAR), String(YEAR - 1)]);
    await year.selectOption(String(YEAR - 1));
    await expect(year).toHaveValue(String(YEAR - 1));
    await expect(netIncome(page)).toHaveText('0,00 €');
    await year.selectOption(String(YEAR));
    await expect(netIncome(page)).toHaveText('2 184,00 €');
  });

  test('explains a figure in a popover that closes on Escape, outside, on scroll and on a second tap', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' }, ledger());
    await page.goto('/');

    const info = page.getByRole('button', { name: 'About net income' });
    const note = page.getByRole('note');

    await info.click();
    await expect(note).toContainText('the amount you are taxed on');
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(note).toHaveCount(0);
    await expect(info).toBeFocused();

    await info.click();
    await note.click(); // a click inside keeps it open
    await expect(note).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(note).toHaveCount(0);

    await info.click();
    await page.mouse.wheel(0, 200);
    await expect(note).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, 0));
    await info.click();
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(note).toHaveCount(0);

    await info.click();
    await info.click();
    await expect(note).toHaveCount(0);
  });

  test('closes a popover with Escape without leaving the page it is on', async ({ page }) => {
    await page.goto('/');
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'About your account' }).click();
    await expect(page.getByRole('note')).toContainText('permanently deletes your account');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('note')).toHaveCount(0);
    await expect(menu).toBeVisible();
  });
});

test.describe('the portfolio', () => {
  test('lists every apartment and opens one at its Home, remembering it across a reload', async ({ page, api }) => {
    coOwned(api, 'First');
    api.addApartment({ name: 'Second', address: 'Toinen katu 2' }, ledger());
    await page.goto('/');
    await section(page, 'Rent');

    await openPortfolio(page);
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /^First/ })).toContainText('You own 60 % · 2 owners · Kauppakatu 12 B 7, Vaasa');
    await expect(page.getByRole('button', { name: /^Second/ })).toContainText('Toinen katu 2');
    await page.getByRole('button', { name: /^Second/ }).click();

    await expect(page.locator('h1.aptname')).toHaveText('Second');
    await expect(netIncome(page)).toBeVisible();

    await page.reload();
    await expect(page.locator('h1.aptname')).toHaveText('Second');
  });

  test('shows the whole portfolio, the viewer’s share added together', async ({ page, api }) => {
    coOwned(api);
    api.addApartment({ name: 'Rantatie 5' }, ledger());
    await page.goto('/');
    await openPortfolio(page);

    // −189,60 (60 % of Kauppakatu) + 2 184,00 (Rantatie) = 1 994,40; tax at 30 % on the total.
    await expect(netIncome(page)).toHaveText('1 994,40 €');
    await expect(page.locator('.hero')).toContainText('598 €');
    const rows = page.locator('section').filter({ hasText: 'Apartments' }).locator('li');
    await expect(rows.nth(0)).toContainText('You own 60 % · 2 owners');
    await expect(rows.nth(0)).toContainText('−189,60 €');
    await expect(rows.nth(1)).toContainText('Yours');
    await expect(rows.nth(1)).toContainText('2 184,00 €');

    await rows.nth(1).click();
    await expect(page.locator('h1.aptname')).toHaveText('Rantatie 5');
    await expect(netIncome(page)).toHaveText('2 184,00 €');
  });

  test('shows a loss across the whole portfolio as a loss', async ({ page, api }) => {
    coOwned(api);
    api.addApartment({ name: 'Empty' });
    await page.goto('/');
    await openPortfolio(page);

    await expect(netIncome(page)).toHaveText('−189,60 €');
    await expect(netIncome(page)).toHaveClass(/neg/);
  });

  test('leaves out of the totals an apartment whose details failed to load', async ({ page, api }) => {
    api.addApartment({ name: 'Good' }, ledger());
    const flaky = api.addApartment({ name: 'Flaky' }, ledger());
    api.failNext('GET', new RegExp(`/api/apartments/${flaky.id}$`), { status: 500 });
    await page.goto('/');
    await openPortfolio(page);

    await expect(netIncome(page)).toHaveText('2 184,00 €');
    await expect(page.locator('li').filter({ hasText: 'Flaky' }).locator('.num')).toHaveCount(0);
  });

  test('adds an apartment from the portfolio, and only from there', async ({ page, api }) => {
    api.addApartment({ name: 'First' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New apartment' })).toHaveCount(0);

    await openPortfolio(page);
    await page.getByRole('button', { name: 'New apartment' }).click();
    await page.getByLabel('Apartment name').fill('Second');
    await page.getByRole('button', { name: 'Add apartment' }).click();

    await expect(page.locator('h1.aptname')).toHaveText('Second');
    expect(api.apartments.size).toBe(2);
  });

});

test.describe('the navigation drawer', () => {
  const toggle = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true });
  const drawer = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

  test('stays out of the way until ☰ is tapped, and then covers nothing but a dimmed page', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');

    await expect(drawer(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer(page).getByRole('button', { name: 'Home', exact: true })).toBeFocused();
    await expect(drawer(page).getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('closes with Escape, or by tapping the dimmed page, and hands focus back to ☰', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');

    await toggle(page).click();
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();

    await toggle(page).click();
    await page.locator('.scrim').click({ position: { x: 395, y: 400 } });
    await expect(drawer(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('closes once a place is picked, and keeps Tab inside while open', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');

    await toggle(page).click();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer(page).getByRole('button', { name: 'Account settings', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer(page).getByRole('button', { name: 'Home', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer(page).getByRole('button', { name: 'Rent & costs', exact: true })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Months' })).toBeVisible();
  });

  test('lists the apartment’s places under its name, and the portfolio and account apart from them', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await toggle(page).click();

    await expect(drawer(page).locator('.nav-group')).toHaveText('Flat');
    await expect(drawer(page).getByRole('button')).toHaveText([
      'Home',
      'Rent & costs',
      'Tax',
      'Settings',
      'All apartments',
      'Account settings',
    ]);
    await expect(drawer(page).getByRole('separator')).toHaveCount(1);
  });

  test.describe('in Swedish on a laptop', () => {
    test.use({ locale: 'sv-SE', viewport: { width: 1280, height: 800 } });

    test('keeps every label inside the bubble of its sidebar button', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');

      const buttons = page.locator('nav.nav').getByRole('button');
      await expect(buttons.nth(3)).toHaveText('Inställningar');
      for (const button of await buttons.all()) {
        const overflow = await button.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow, await button.innerText()).toBeLessThanOrEqual(0);
      }
    });
  });

  test('offers only the account before the first apartment exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    await toggle(page).click();

    await expect(drawer(page).getByRole('button')).toHaveText(['Account settings']);
    await drawer(page).getByRole('button', { name: 'Account settings' }).click();
    await expect(page.getByRole('heading', { name: 'Account settings', exact: true })).toBeVisible();
    await expect(page.getByLabel('Tax year')).toHaveCount(0);
  });
});

test.describe('account settings and apartment settings', () => {
  test('are two pages: you on one, the apartment on the other', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');

    await openAccount(page);
    await expect(page.getByRole('heading', { name: 'Account settings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Owners/ })).toHaveCount(0);

    await section(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Apartment settings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Owners/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  });
});

test.describe('the account settings', () => {
  test('shows the name given at sign-up, which is the name on the declaration, and offers no way to retype it', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    const menu = await openAccount(page);

    await expect(menu.locator('.t').first()).toHaveText('Aino Aalto');
    await expect(menu.getByLabel('Your name on declarations')).toHaveCount(0);
    await expect(menu.getByRole('button', { name: 'Save name' })).toHaveCount(0);
  });
});
