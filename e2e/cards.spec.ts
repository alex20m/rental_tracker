import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned } from './data';
import { openAccount, section } from './nav';

/**
 * Every section of a page is a card: its heading and everything under it on
 * one sheet lifted off the paper. Only the page's opening summary (the big
 * figure) sits bare on the paper.
 */

type Surface = { heading: string; background: string; paper: string; shadow: string; radius: string };

/** How each section on the page is drawn, with colours in sRGB so the card and the paper compare in any colour space. */
const surfaces = (page: Page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const srgb = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };
    const paper = srgb(getComputedStyle(document.body).backgroundColor);
    return [...document.querySelectorAll('.page section')].map((s) => {
      const style = getComputedStyle(s);
      return {
        heading: s.querySelector('h2')?.textContent ?? (s.classList.contains('hero') ? '(summary)' : '(untitled)'),
        background: srgb(style.backgroundColor),
        paper,
        shadow: style.boxShadow,
        radius: style.borderRadius,
      };
    });
  });

const isCard = (s: Surface) => s.background !== s.paper && !s.background.endsWith(', 0)') && s.shadow !== 'none' && s.radius === '20px';

/** Asserts the page has exactly these titled cards (plus any untitled ones), and that its summary, if any, is not a card. */
async function expectCards(page: Page, headings: string[]) {
  await expect(page.getByRole('heading', { name: headings[0] })).toBeVisible();
  const all = await surfaces(page);
  const summary = all.filter((s) => s.heading === '(summary)');
  const rest = all.filter((s) => s.heading !== '(summary)');
  for (const s of summary) expect(isCard(s), 'the opening summary sits bare on the paper').toBe(false);
  for (const h of headings) expect(rest.map((s) => s.heading), `a section titled ${h}`).toContainEqual(expect.stringContaining(h));
  for (const s of rest) expect(isCard(s), `the section "${s.heading}" is a card`).toBe(true);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test('puts each section of the apartment pages on a card and leaves the summary on the paper', async ({ page, api }) => {
      const apt = coOwned(api);
      apt.mySale = { purchaseDate: '2018-03-01', purchasePrice: 100000, saleDate: '2025-06-15', salePrice: 160000, saleCosts: 4000 };
      await page.goto('/');

      await expectCards(page, ['To do', 'Rent and costs by month', 'Recent']);
      await section(page, 'Rent');
      await expectCards(page, ['Months']);
      await section(page, 'Tax');
      await expectCards(page, ['Before you file', 'Income', 'Expenses', 'Declaration']);
      await section(page, 'Sale');
      await expectCards(page, ['Your purchase', 'Your sale', 'Acquisition costs', 'Two ways to count the gain', 'Your tax']);
      await section(page, 'Checklist');
      await expectCards(page, ['Checklist']);
    });

    test('puts each section of the account page on a card', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');
      await openAccount(page);

      await expectCards(page, ['Language', 'Theme']);
    });
  });
}
