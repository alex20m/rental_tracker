import { expect, test } from './fixtures';
import { openAccount, openMenu } from './nav';

test.describe('interface language', () => {
  test.describe('with a Finnish browser', () => {
    test.use({ locale: 'fi-FI' });

    test('starts in Finnish', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Lisää ensimmäinen asuntosi' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    });
  });

  test('switches to Swedish from the menu, and remembers it', async ({ page, api }) => {
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    const account = await openAccount(page);
    await account.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Svenska' }).click();

    await expect(page.getByRole('heading', { name: 'Kontoinställningar', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'sv');

    await page.reload();
    await page.getByRole('button', { name: 'Meny', exact: true }).click();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Hem', exact: true })).toBeVisible();
  });

  test('switches language on the sign-in page', async ({ page, api }) => {
    api.signedIn = false;
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('radio', { name: 'Suomi' }).click();

    await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible();
  });

  test('a stored choice wins over the browser’s language', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rental-tracker:language', 'sv'));
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Lägg till din första lägenhet' })).toBeVisible();
  });

  test('uses navigator.language where the browser lists no preferred languages', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => [] });
      Object.defineProperty(navigator, 'language', { get: () => 'fi-FI' });
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Lisää ensimmäinen asuntosi' })).toBeVisible();
  });

  test('switches language even when the browser refuses to store the choice', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage disabled');
        },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    const menu = await openMenu(page);
    await menu.getByRole('radio', { name: 'Suomi' }).click();

    await expect(page.getByRole('heading', { name: 'Tilin asetukset', exact: true })).toBeVisible();
  });
});
