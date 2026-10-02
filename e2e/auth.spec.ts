import { expect, test } from './fixtures';

test.describe('signing in', () => {
  test.beforeEach(({ api }) => {
    api.signedIn = false;
  });

  test('sends a signed-out visitor to the sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signs in with a verified account and lands on the portfolio', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: true, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
  });

  test('says so when the password is wrong, and stays on the page', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: true, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('wrong password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('asks an unverified account for the emailed code, then lets it in', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: false, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await expect(page.getByText('We sent a code to me@example.test.')).toBeVisible();
    expect(api.sentCodes).toEqual(['me@example.test']);

    await page.getByLabel('Code from the email').fill('000000');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid OTP');

    await page.getByLabel('Code from the email').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    // Verified, but this fake keeps no session yet: back to sign in, told why.
    await expect(page.getByText('Email verified. Sign in to continue.')).toBeVisible();
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
  });

  test('creates an account, verifies it with the code and goes straight in when the code signs it in', async ({ page, api }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await page.getByLabel('Name').fill('Me Myself');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter it to finish creating your account.')).toBeVisible();
    api.signedIn = true; // the verification signs the new account in
    await page.getByLabel('Code from the email').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    expect(api.callsTo('POST /api/auth/sign-up/email')[0]!.body).toMatchObject({ name: 'Me Myself', email: 'me@example.test' });
  });

  test('goes straight in after sign-up when the project does not require verification', async ({ page, api }) => {
    api.failNext('POST', /sign-up\/email$/, { status: 200, body: { token: 'tok', user: { id: 'usr_me' } } });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    api.signedIn = true;
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    // No name given: the email stands in for it.
    expect(api.callsTo('POST /api/auth/sign-up/email')[0]!.body).toMatchObject({ name: 'me@example.test' });
  });

  test('explains a failed sign-up and can switch back to signing in', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'x', verified: true, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('User already exists');

    await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test("shows the auth service's own explanation when it refuses", async ({ page, api }) => {
    api.failNext('POST', /sign-in\/email$/, { status: 500, body: { message: 'Auth is having a moment' } });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.alert[role=alert]')).toHaveText('Auth is having a moment');
  });

  test('reports a request that never reached the service', async ({ page, api }) => {
    api.failNext('POST', /sign-in\/email$/, { abort: true });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.alert[role=alert]')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('resends a code, explains a failed resend, and goes back to signing in', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: false, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();

    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect.poll(() => api.sentCodes.length).toBe(2);

    api.failNext('POST', /send-verification-otp$/, { status: 429, body: { message: 'Too many codes, wait a minute' } });
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Too many codes, wait a minute');

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('verifying from inside the app', () => {
  test('verifies the signed-in account from the portfolio notice', async ({ page, api }) => {
    api.emailVerified = false;
    await page.goto('/');
    await expect(page.getByText("Your email address isn't verified yet")).toBeVisible();
    await page.getByRole('link', { name: 'Verify it now →' }).click();

    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('me@example.test');
    await expect(page.getByLabel('Email', { exact: true })).not.toBeEditable();
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await page.getByLabel('Code from the email').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    await expect(page.getByText("isn't verified yet")).toHaveCount(0);
  });

  test('goes back to the app without verifying', async ({ page, api }) => {
    api.emailVerified = false;
    await page.goto('/sign-in?verify=me%40example.test');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
  });
});

test('signs out from the portfolio', async ({ page, api }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  expect(api.signedIn).toBe(false);
});

test('still leaves when signing out fails on the server', async ({ page, api }) => {
  api.failNext('POST', /sign-out$/, { abort: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
});
