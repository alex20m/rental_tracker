import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { coOwned } from './data';
import { openAccount, openTopic, section } from './nav';

/**
 * Every section of a page is a card: its heading and everything under it on
 * one sheet lifted off the paper. Only the page's opening summary (the big
 * figure) sits bare on the paper.
 */

type Surface = { heading: string; background: string; paper: string; shadow: string; radius: string; inset: number };

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
    /** How close the card's text and icons come to its left or right edge, in pixels. */
    const inset = (card: Element) => {
      const box = card.getBoundingClientRect();
      const rects: DOMRect[] = [...card.querySelectorAll('svg')].map((i) => i.getBoundingClientRect());
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        rects.push(range.getBoundingClientRect());
      }
      const seen = rects.filter((r) => r.width > 0 && r.height > 0);
      return Math.min(...seen.map((r) => Math.min(r.left - box.left, box.right - r.right)));
    };
    return [...document.querySelectorAll('.page section, .page .panel')].map((s) => {
      const style = getComputedStyle(s);
      return {
        heading: s.querySelector('h2')?.textContent ?? (s.classList.contains('hero') ? '(summary)' : '(untitled)'),
        background: srgb(style.backgroundColor),
        paper,
        shadow: style.boxShadow,
        radius: style.borderRadius,
        inset: s.classList.contains('hero') ? Infinity : inset(s),
      };
    });
  });

const isCard = (s: Surface) => s.background !== s.paper && !s.background.endsWith(', 0)') && s.shadow !== 'none' && s.radius === '20px';

/** Asserts the page has exactly these titled cards (plus any untitled ones), and that its summary, if any, is not a card. */
async function expectCards(page: Page, headings: string[]) {
  if (headings[0]) await expect(page.getByRole('heading', { name: headings[0] })).toBeVisible();
  const all = await surfaces(page);
  const summary = all.filter((s) => s.heading === '(summary)');
  const rest = all.filter((s) => s.heading !== '(summary)');
  expect(rest.length, 'cards on the page').toBeGreaterThan(0);
  for (const s of summary) expect(isCard(s), 'the opening summary sits bare on the paper').toBe(false);
  for (const h of headings) expect(rest.map((s) => s.heading), `a section titled ${h}`).toContainEqual(expect.stringContaining(h));
  for (const s of rest) expect(isCard(s), `the section "${s.heading}" is a card`).toBe(true);
  // A card's padding (16px on a phone) keeps its text and icons off its edge.
  for (const s of rest) expect(s.inset, `the content of "${s.heading}" stands clear of the card's edge`).toBeGreaterThanOrEqual(15.5);
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
      // The checklist's title and progress are its summary; its rows and the box to add one are a single card.
      await section(page, 'Checklist');
      await expect(page.getByRole('heading', { name: 'Checklist', level: 1 })).toBeVisible();
      await expectCards(page, []);
      await expect(page.locator('.panel').filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })).toHaveCount(1);
    });

    test('keeps the recurring list off the edge of its card', async ({ page, api }) => {
      const apt = coOwned(api);
      apt.recurring = [
        { id: 'r-rent', kind: 'rent', description: '', amount: 800, dayOfMonth: 1, nextMonth: `${new Date().getFullYear()}-12` },
        { id: 'r-charge', kind: 'cost', category: 'maintenance_charge', description: '', amount: 150, dayOfMonth: 1, nextMonth: `${new Date().getFullYear()}-12` },
      ];
      await page.goto('/');
      await openTopic(page, 'Recurring expenses');

      await expect(page.getByText('Monthly rent')).toBeVisible();
      const cards = (await surfaces(page)).filter((s) => s.heading !== '(summary)');
      expect(cards).toHaveLength(1);
      expect(isCard(cards[0]!), 'the list is a card').toBe(true);
      expect(cards[0]!.inset, "the rows stand clear of the card's edge").toBeGreaterThanOrEqual(15.5);
      // Each row says when it books next in full, on a second line if it has to, rather than cutting it off.
      const cut = await page.locator('.list .s').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
      expect(cut).toEqual([]);
    });

    test('puts each section of the account page on a card', async ({ page, api }) => {
      api.addApartment({ name: 'Flat' });
      await page.goto('/');
      await openAccount(page);

      await expectCards(page, ['Language', 'Theme']);
    });
  });
}
