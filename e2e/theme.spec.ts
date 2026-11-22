import { expect, test } from './fixtures';
import { closeInstallPopup, openAccount } from './nav';

/** The page's background as the screen shows it, in sRGB: the browser may report an oklch token in another space. */
const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  });

/** Kuusi's paper and night ground: the same colours the layout gives the browser's own chrome. */
const LIGHT = 'rgb(249, 251, 250)';
const DARK = 'rgb(9, 16, 13)';

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
