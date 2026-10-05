import { expect, test } from './fixtures';
import { closeInstallPopup, openAccount } from './nav';

const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const LIGHT = 'rgb(255, 255, 255)';
const DARK = 'rgb(0, 0, 0)';

test.describe('theme', () => {
  test.describe('with a dark device', () => {
    test.use({ colorScheme: 'dark' });

    test('follows the device by default, and light overrides it', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');
      const account = await openAccount(page);
      const group = account.getByRole('radiogroup', { name: 'Theme' });
      await expect(group.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
      expect(await background(page)).toBe(DARK);

      await group.getByRole('radio', { name: 'Light' }).click();
      expect(await background(page)).toBe(LIGHT);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      await group.getByRole('radio', { name: 'System' }).click();
      await expect(page.locator('html')).not.toHaveAttribute('data-theme');
      expect(await background(page)).toBe(DARK);
    });
  });

  test.describe('with a light device', () => {
    test.use({ colorScheme: 'light' });

    test('dark overrides the device and is remembered after a reload', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');
      expect(await background(page)).toBe(LIGHT);
      const account = await openAccount(page);
      await account.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
      expect(await background(page)).toBe(DARK);

      await page.reload();
      expect(await background(page)).toBe(DARK);
      const again = await openAccount(page);
      await expect(again.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    });

    test('switches theme even when the browser refuses to store the choice', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('storage disabled');
          },
        });
      });
      await page.goto('/');
      await closeInstallPopup(page);
      const account = await openAccount(page);
      await account.getByRole('radio', { name: 'Dark' }).click();

      expect(await background(page)).toBe(DARK);
    });
  });
});
