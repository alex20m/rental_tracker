import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned } from './data';
import { openAccount, section } from './nav';

/** The switch between the viewer's share of a co-owned apartment and the whole of it. */
const scope = (page: Page) => page.getByRole('radiogroup', { name: 'Figures for' });

/**
 * How far apart the first lines of the page's two columns sit, in pixels. A
 * column's first line is the element holding the first text a person can see
 * in its first section, so an empty band above it (a hidden control, a padding,
 * a border with space under it) counts against it.
 */
async function columnStartGap(page: Page): Promise<number> {
  return page.locator('main.page').evaluate((pageEl) => {
    const firstLine = (el: Element): number | null => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const parent = n.parentElement!;
        if (parent.getClientRects().length === 0) continue;
        return parent.getBoundingClientRect().top;
      }
      return null;
    };
    const middle = pageEl.getBoundingClientRect().left + pageEl.getBoundingClientRect().width / 2;
    const children = [...pageEl.children].filter((c) => c.getClientRects().length > 0);
    const left = children.find((c) => c.getBoundingClientRect().right <= middle)!;
    const right = children.find((c) => c.getBoundingClientRect().left >= middle)!;
    return Math.abs(firstLine(left)! - firstLine(right)!);
  });
}

test.describe('the share switch on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('sits in the top bar beside the year on Home, and both columns start on the same line', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');

    await expect(page.getByRole('banner').getByRole('radiogroup', { name: 'Figures for' })).toBeVisible();
    await expect(scope(page)).toHaveCount(1);
    await expect(page.getByRole('banner').getByLabel('Tax year')).toBeVisible();
    await expect(page.getByText('Occupancy', { exact: true })).toBeVisible();
    expect(await columnStartGap(page)).toBeLessThanOrEqual(1);
  });

  test('sits in the top bar on Tax too, and both columns start on the same line', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await section(page, 'Tax');

    await expect(page.getByRole('banner').getByRole('radiogroup', { name: 'Figures for' })).toBeVisible();
    await expect(scope(page)).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    expect(await columnStartGap(page)).toBeLessThanOrEqual(1);
  });

  test('switches the figures from the top bar, and the choice carries over from Home to Tax', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');

    await page.getByRole('banner').getByRole('radio', { name: 'Whole apartment' }).click();
    await expect(page.getByTestId('net-income')).toHaveText('−316,00 €');
    await section(page, 'Tax');
    await expect(page.getByRole('banner').getByRole('radio', { name: 'Whole apartment' })).toHaveAttribute('aria-checked', 'true');
  });

  test('is not in the top bar where it changes nothing', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');
    await expect(scope(page)).toBeVisible();

    await section(page, 'Rent');
    await expect(page.getByRole('radiogroup', { name: 'Rent or costs' })).toBeVisible();
    await expect(scope(page)).toHaveCount(0);

    await openAccount(page);
    await expect(page.getByRole('heading', { name: 'Account settings', exact: true })).toBeVisible();
    await expect(scope(page)).toHaveCount(0);
  });

  test('is not shown at all for an apartment the viewer owns alone', async ({ page, api }) => {
    api.addApartment({ name: 'Solo' });
    await page.goto('/');

    await expect(page.getByRole('banner').getByLabel('Tax year')).toBeVisible();
    await expect(scope(page)).toHaveCount(0);
  });
});

test.describe('the share switch on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 } });

  test('stays above the figures, where the narrow top bar has no room for it', async ({ page, api }) => {
    coOwned(api);
    await page.goto('/');

    await expect(page.getByRole('main').getByRole('radiogroup', { name: 'Figures for' })).toBeVisible();
    await expect(scope(page)).toHaveCount(1);
    await expect(page.getByRole('banner').getByRole('radiogroup')).toHaveCount(0);
  });
});
