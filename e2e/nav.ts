import type { Page } from '@playwright/test';

/** The app's own error message (Next's route announcer also has role="alert"). */
export const alert = (page: Page) => page.locator('.alert[role=alert]');

/** From inside an apartment back to the portfolio, the page that lists them all. */
export async function openPortfolio(page: Page) {
  await page.getByRole('button', { name: 'All apartments', exact: true }).click();
}

/** Opens one apartment from the portfolio (going there first), at its Home. */
export async function openApartment(page: Page, name: string) {
  await openPortfolio(page);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/**
 * One of the places in the bottom navigation. Rent and Costs share the
 * "Rent & costs" tab, so reaching one is the tab and then its switch.
 */
export async function section(page: Page, name: 'Home' | 'Rent' | 'Costs' | 'Tax' | 'History' | 'Settings') {
  const nav = page.getByRole('navigation', { name: 'Sections' });
  if (name === 'Rent' || name === 'Costs') {
    await nav.getByRole('button', { name: 'Rent & costs', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Rent or costs' }).getByRole('radio', { name, exact: true }).click();
  } else {
    await nav.getByRole('button', { name, exact: true }).click();
  }
}

/** The account menu: the round button on the portfolio page (or on the welcome screen before any apartment). */
export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

/** The menu, reached from inside an apartment by way of the portfolio. */
export async function openAccount(page: Page) {
  await openPortfolio(page);
  return openMenu(page);
}

/** Settings of the apartment being looked at. */
export async function openSettings(page: Page) {
  await section(page, 'Settings');
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
}

/** The six one-time-code boxes. */
export const codeBoxes = (page: Page) => page.getByRole('group', { name: 'Code from the email' }).locator('input');

/** Types a one-time code into the boxes from the first one, as a person typing it digit by digit would. */
export async function fillCode(page: Page, code: string) {
  await codeBoxes(page).first().focus();
  for (const digit of code) await page.keyboard.press(digit);
}
