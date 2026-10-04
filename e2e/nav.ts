import type { Page } from '@playwright/test';

/** The app's own error message (Next's route announcer also has role="alert"). */
export const alert = (page: Page) => page.locator('.alert[role=alert]');

/** The drawer with every place in the app, opened with ☰ in the top bar (on a phone it is closed until then). */
export async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  return page.getByRole('navigation', { name: 'Sections' });
}

/** To the portfolio, the page that lists every apartment. */
export async function openPortfolio(page: Page) {
  const nav = await openDrawer(page);
  await nav.getByRole('button', { name: 'All apartments', exact: true }).click();
}

/** Opens one apartment from the portfolio (going there first), at its Home. */
export async function openApartment(page: Page, name: string) {
  await openPortfolio(page);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/**
 * One of the places of the apartment, from the drawer. Rent and Costs share the
 * "Rent & costs" place, and History is the "All years" side of Tax, so reaching
 * one of those is the place and then its switch.
 */
export async function section(page: Page, name: 'Home' | 'Rent' | 'Costs' | 'Tax' | 'History' | 'Settings') {
  const nav = await openDrawer(page);
  if (name === 'Rent' || name === 'Costs') {
    await nav.getByRole('button', { name: 'Rent & costs', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Rent or costs' }).getByRole('radio', { name, exact: true }).click();
  } else if (name === 'History') {
    await nav.getByRole('button', { name: 'Tax', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Tax view' }).getByRole('radio', { name: 'All years', exact: true }).click();
  } else {
    await nav.getByRole('button', { name: name === 'Settings' ? 'Apartment settings' : name, exact: true }).click();
  }
}

/** The account page, from the drawer; returns its content. */
export async function openMenu(page: Page) {
  const nav = await openDrawer(page);
  await nav.getByRole('button', { name: 'Account settings', exact: true }).click();
  return page.getByRole('region', { name: 'Account' });
}

/** Same as {@link openMenu}: the account is one tap from the drawer wherever you are. */
export const openAccount = openMenu;

/** Settings of the apartment being looked at: the list of topics. */
export async function openSettings(page: Page) {
  await section(page, 'Settings');
  await page.getByRole('heading', { name: 'Apartment settings', exact: true }).waitFor();
}

/** One topic of the apartment's settings, opened from the list. */
export async function openTopic(page: Page, topic: 'Owners' | 'Property details' | 'Building depreciation') {
  await openSettings(page);
  await page.getByRole('button', { name: new RegExp(`^${topic}`) }).click();
  await page.getByRole('heading', { name: topic, exact: true }).waitFor();
}

/** The six one-time-code boxes. */
export const codeBoxes = (page: Page) => page.getByRole('group', { name: 'Code from the email' }).locator('input');

/** Types a one-time code into the boxes from the first one, as a person typing it digit by digit would. */
export async function fillCode(page: Page, code: string) {
  await codeBoxes(page).first().focus();
  for (const digit of code) await page.keyboard.press(digit);
}
