import type { Page } from '@playwright/test';

/** The app's own error message (Next's route announcer also has role="alert"). */
export const alert = (page: Page) => page.locator('.alert[role=alert]');

/** The apartment switcher: the pill at the top, then a row in its sheet. */
export async function openApartment(page: Page, name: string) {
  await page.locator('button.pill').click();
  await page.getByRole('dialog', { name: 'Apartments' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/** One of the bottom sections: Home, Rent, Costs, Tax. */
export async function section(page: Page, name: 'Home' | 'Rent' | 'Costs' | 'Tax') {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name, exact: true }).click();
}

export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

export async function openSettings(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: /Apartment settings/ }).click();
  await page.getByRole('heading', { name: 'Apartment settings' }).waitFor();
}
