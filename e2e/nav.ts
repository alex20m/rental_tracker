import type { Page } from '@playwright/test';

/** The app's own error message (Next's route announcer also has role="alert"). */
export const alert = (page: Page) => page.locator('.alert[role=alert]');

/** The apartment switcher: the pill at the top, then a row in its sheet. */
export async function openApartment(page: Page, name: string) {
  await page.locator('button.pill').click();
  await page.getByRole('dialog', { name: 'Apartments' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
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

/** The account menu shown before there is a first apartment (afterwards the account lives in Settings). */
export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

/** Settings, Apartment side. */
export async function openSettings(page: Page) {
  await section(page, 'Settings');
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
}

/** Settings, Account side: who you are, language, signing out. */
export async function openAccount(page: Page) {
  await section(page, 'Settings');
  await page.getByRole('radiogroup', { name: 'Settings for' }).getByRole('radio', { name: 'Account' }).click();
  return page.getByRole('region', { name: 'Account' });
}

/** The six one-time-code boxes. */
export const codeBoxes = (page: Page) => page.getByRole('group', { name: 'Code from the email' }).locator('input');

/** Types a one-time code into the boxes from the first one, as a person typing it digit by digit would. */
export async function fillCode(page: Page, code: string) {
  await codeBoxes(page).first().focus();
  for (const digit of code) await page.keyboard.press(digit);
}
