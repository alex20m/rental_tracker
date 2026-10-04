import { expect, test } from './fixtures';
import { codeBoxes, fillCode, openMenu } from './nav';

test.describe('signing in', () => {
  test.beforeEach(({ api }) => {
    api.signedIn = false;
  });

  test('sends a signed-out visitor to the sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('says what the app is on the sign-in and sign-up forms, but not on the code step', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: false, userId: 'usr_me' });
    const tagline = page.getByText('Track your Finnish rental apartments and prepare your tax declaration.');
    await page.goto('/sign-in');
    await expect(tagline).toBeVisible();

    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(tagline).toBeVisible();

    await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(tagline).toHaveCount(0);
  });

  test('signs in with a verified account and lands on the portfolio', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'correct horse', verified: true, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
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

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText('We sent a code to me@example.test.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    expect(api.sentCodes).toEqual(['me@example.test']);

    await fillCode(page, '000000');
    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid OTP');

    await fillCode(page, '123456');
    // Verified, but this fake keeps no session yet: back to sign in, told why.
    await expect(page.getByText('Email verified. Sign in to continue.')).toBeVisible();
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
  });

  test('creates an account, verifies it with the code and goes straight in when the code signs it in', async ({ page, api }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByLabel('Name').fill('Me Myself');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter it to finish creating your account.')).toBeVisible();
    api.signedIn = true; // the verification signs the new account in
    await fillCode(page, '123456');
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    expect(api.callsTo('POST /api/auth/sign-up/email')[0]!.body).toMatchObject({ name: 'Me Myself', email: 'me@example.test' });
  });

  test('asks for the sign-up code itself, once, because Neon does not send it when the email webhook is on', async ({ page, api }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Name').fill('Me Myself');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter it to finish creating your account.')).toBeVisible();
    // Neon never reveals that an address is taken (it answers a repeat sign-up as if it were new),
    // so the one thing the page can do for someone who already has an account is say what to try.
    await expect(page.getByText('No code? You may already have an account: go back and sign in.')).toBeVisible();
    const requests = api.callsTo('POST /api/auth/email-otp/send-verification-otp');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toMatchObject({ email: 'me@example.test', type: 'email-verification' });
    expect(api.sentCodes).toEqual(['me@example.test']);
  });

  test('lands on the code step with the reason when the sign-up code cannot be sent, so it can be sent again', async ({ page, api }) => {
    api.failNext('POST', /send-verification-otp$/, { status: 502, body: { message: 'Unable to send the code' } });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Name').fill('Me Myself');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Unable to send the code');
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect.poll(() => api.sentCodes.length).toBe(1);
  });

  test('goes straight in after sign-up when the project does not require verification', async ({ page, api }) => {
    api.failNext('POST', /sign-up\/email$/, { status: 200, body: { token: 'tok', user: { id: 'usr_me' } } });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Name').fill('  Me Myself ');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    api.signedIn = true;
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
    expect(api.callsTo('POST /api/auth/sign-up/email')[0]!.body).toMatchObject({ name: 'Me Myself' });
  });

  test('will not create an account without a name, because the declaration is printed in it', async ({ page, api }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');

    // Left empty: the browser itself refuses to submit.
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Name')).toHaveJSProperty('validity.valueMissing', true);
    expect(api.callsTo('POST /api/auth/sign-up/email')).toHaveLength(0);

    // Only spaces get past the browser, so the form refuses it too.
    await page.getByLabel('Name').fill('   ');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Enter your name');
    expect(api.callsTo('POST /api/auth/sign-up/email')).toHaveLength(0);
  });

  test('explains a failed sign-up and can switch back to signing in', async ({ page, api }) => {
    api.accounts.set('me@example.test', { password: 'x', verified: true, userId: 'usr_me' });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Name').fill('Me Myself');
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
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect.poll(() => api.sentCodes.length).toBe(2);

    api.failNext('POST', /send-verification-otp$/, { status: 429, body: { message: 'Too many codes, wait a minute' } });
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Too many codes, wait a minute');

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('the info box', () => {
  test.beforeEach(({ api }) => {
    api.signedIn = false;
    api.accounts.set('me@example.test', { password: 'correct horse', verified: false, userId: 'usr_me' });
  });

  test('disappears when the person navigates to another form', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.locator('.notice')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('.notice')).toHaveCount(0);
  });
});

test.describe('resetting a forgotten password', () => {
  test.beforeEach(({ api }) => {
    api.signedIn = false;
    api.accounts.set('me@example.test', { password: 'old password', verified: true, userId: 'usr_me' });
  });

  const openForgot = async (page: import('@playwright/test').Page) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  };
  const requestCode = async (page: import('@playwright/test').Page) => {
    await openForgot(page);
    await page.getByLabel('Email', { exact: true }).fill('  me@example.test ');
    await page.getByRole('button', { name: 'Send reset code' }).click();
    await expect(page.getByText('We sent a code to me@example.test.')).toBeVisible();
  };

  test('emails a code, takes the code and a new password, and signs in with the new password', async ({ page, api }) => {
    await requestCode(page);
    expect(api.resetCodes).toEqual(['me@example.test']);
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);

    await fillCode(page, '123456');
    await expect(page.getByLabel('New password')).toBeFocused();
    await page.getByLabel('New password').fill('brand new password');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Password changed. Sign in with your new password.')).toBeVisible();
    expect(api.callsTo('POST /api/auth/email-otp/reset-password')[0]!.body).toMatchObject({
      email: 'me@example.test',
      otp: '123456',
      password: 'brand new password',
    });

    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('old password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid email or password');
    await page.getByLabel('Password').fill('brand new password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
  });

  test('keeps the person on the code step with the reason when the code is wrong, and sends nothing for an incomplete one', async ({
    page,
    api,
  }) => {
    await requestCode(page);
    await expect(page.getByRole('button', { name: 'Reset password' })).toBeDisabled();

    await fillCode(page, '000000');
    await page.getByLabel('New password').fill('brand new password');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid OTP');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    expect(api.accounts.get('me@example.test')!.password).toBe('old password');
  });

  test('refuses a new password shorter than eight characters before asking the service', async ({ page, api }) => {
    await requestCode(page);
    await fillCode(page, '123456');
    await page.getByLabel('New password').fill('short');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByLabel('New password')).toHaveJSProperty('validity.tooShort', true);
    expect(api.callsTo('POST /api/auth/email-otp/reset-password')).toHaveLength(0);
  });

  test('explains a failed code request and stays on the email form', async ({ page, api }) => {
    api.failNext('POST', /request-password-reset$/, { status: 429, body: { message: 'Too many codes, wait a minute' } });
    await openForgot(page);
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByRole('button', { name: 'Send reset code' }).click();

    await expect(page.locator('.alert[role=alert]')).toHaveText('Too many codes, wait a minute');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  });

  test('sends a new code on request, and goes back a step at a time', async ({ page, api }) => {
    await requestCode(page);
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect.poll(() => api.resetCodes.length).toBe(2);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('me@example.test');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('the one-time code boxes', () => {
  test.beforeEach(({ api }) => {
    api.signedIn = false;
    api.accounts.set('me@example.test', { password: 'correct horse', verified: false, userId: 'usr_me' });
  });

  const reachVerify = async (page: import('@playwright/test').Page) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('me@example.test');
    await page.getByLabel('Password').fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  };
  const verifyCalls = (api: import('./fakeApi').FakeApi) => api.callsTo('POST /api/auth/email-otp/verify-email');
  const values = (boxes: ReturnType<typeof codeBoxes>) => boxes.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

  test('sends nothing until a sixth digit arrives, then submits on its own', async ({ page, api }) => {
    await reachVerify(page);

    await codeBoxes(page).first().focus();
    for (const digit of '12345') await page.keyboard.press(digit);
    expect(verifyCalls(api)).toEqual([]);

    await page.keyboard.press('6'); // focus already advanced to the sixth box
    await expect.poll(() => verifyCalls(api).length).toBe(1);
    expect(verifyCalls(api)[0]!.body).toMatchObject({ otp: '123456' });
  });

  test('clears itself and refocuses the first box after a wrong code, ready to retype', async ({ page }) => {
    await reachVerify(page);
    await fillCode(page, '000000');
    await expect(page.locator('.alert[role=alert]')).toHaveText('Invalid OTP');

    const boxes = codeBoxes(page);
    await expect.poll(() => values(boxes)).toEqual(['', '', '', '', '', '']);
    await expect(boxes.first()).toBeFocused();
  });

  test('backspacing an empty box clears and steps back to the previous one', async ({ page }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await codeBoxes(page).first().focus();
    await page.keyboard.press('1');
    await page.keyboard.press('2'); // focus now on the empty third box
    await expect.poll(() => values(boxes)).toEqual(['1', '2', '', '', '', '']);

    await page.keyboard.press('Backspace'); // empty: clears the second box, steps back
    await expect.poll(() => values(boxes)).toEqual(['1', '', '', '', '', '']);
    await expect(boxes.nth(1)).toBeFocused();

    await page.keyboard.press('Backspace'); // empty again: clears the first, steps back
    await expect.poll(() => values(boxes)).toEqual(['', '', '', '', '', '']);
    await expect(boxes.first()).toBeFocused();

    await page.keyboard.press('Backspace'); // nothing before the first box
    await expect.poll(() => values(boxes)).toEqual(['', '', '', '', '', '']);
    await expect(boxes.first()).toBeFocused();
  });

  test('deleting a filled box with backspace just clears that box', async ({ page }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await boxes.first().focus();
    await page.keyboard.press('5');
    await expect.poll(() => values(boxes)).toEqual(['5', '', '', '', '', '']);

    await boxes.first().focus();
    await page.keyboard.press('Backspace');
    await expect.poll(() => values(boxes)).toEqual(['', '', '', '', '', '']);
  });

  test('pasting the code into any box spreads it across the rest and submits', async ({ page, api }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await boxes.first().focus();
    await page.keyboard.press('1');
    await page.keyboard.press('2'); // boxes 0-1 filled, focus on box 2

    await boxes.nth(2).evaluate((el: HTMLInputElement) => {
      const data = new DataTransfer();
      data.setData('text/plain', '3456');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    // The sixth digit submits and the fake accepts it, which unmounts the boxes,
    // so polling their values races that: assert the code that was sent instead.
    await expect.poll(() => verifyCalls(api).length).toBe(1);
    expect(verifyCalls(api)[0]!.body).toMatchObject({ otp: '123456' });
  });

  test('ignores a paste with no digits in it', async ({ page }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await boxes.first().evaluate((el: HTMLInputElement) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'abc');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect.poll(() => values(boxes)).toEqual(['', '', '', '', '', '']);
  });

  test('pasting more digits than there are boxes left fills only what is left, from where typing stopped', async ({
    page,
    api,
  }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await boxes.first().focus();
    for (const digit of '1234') await page.keyboard.press(digit); // 2 boxes (4-5) remain

    await boxes.nth(4).evaluate((el: HTMLInputElement) => {
      const data = new DataTransfer();
      data.setData('text/plain', '56789');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    // Same race as above: the completed code submits and the boxes go away.
    await expect.poll(() => verifyCalls(api).length).toBe(1);
    expect(verifyCalls(api)[0]!.body).toMatchObject({ otp: '123456' });
  });

  test('pasting into a box past the first empty one lands at the first empty one instead, never leaving a gap', async ({
    page,
  }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    // Nothing has been typed yet, so every box is "past the first empty one"
    // except the first itself — simulating a paste dispatched straight at a
    // later box, bypassing the focus a real click would have redirected.
    await boxes.nth(3).evaluate((el: HTMLInputElement) => {
      const data = new DataTransfer();
      data.setData('text/plain', '12');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect.poll(() => values(boxes)).toEqual(['1', '2', '', '', '', '']);
  });

  test('an OS autofill dropping the whole code into the first box fills all six and submits', async ({ page, api }) => {
    await reachVerify(page);
    const boxes = codeBoxes(page);
    await boxes.first().evaluate((el: HTMLInputElement) => {
      // Bypass the setter React itself patches, exactly as a real browser
      // autofill does, so React's value tracker still sees this as a change
      // and fires onChange — setting el.value directly would not.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeSetter.call(el, '123456');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The boxes are not read back: once the code is accepted the page leaves
    // the verify step and unmounts them, so reading them races that. What was
    // sent shows all six digits were taken from the one autofilled box.
    await expect.poll(() => verifyCalls(api).length).toBe(1);
    expect(verifyCalls(api)[0]!.body).toMatchObject({ email: 'me@example.test', otp: '123456' });
  });
});

test.describe('verifying from inside the app', () => {
  test('verifies the signed-in account from the notice on Home', async ({ page, api }) => {
    api.emailVerified = false;
    api.addApartment({ name: 'Flat' });
    await page.goto('/');
    await expect(page.getByText('to receive apartments other owners share with you.')).toBeVisible();
    await page.getByRole('link', { name: 'Verify your email' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send a new code' }).click();
    // The boxes are disabled while the code is being sent; digits typed
    // before that finishes are lost, so wait for the "sent" notice first.
    await expect(page.getByText(/^We sent a code to /)).toBeVisible();
    await fillCode(page, '123456');

    await expect(page.locator('h1.aptname')).toHaveText('Flat');
    await expect(page.getByText('to receive apartments other owners share with you.')).toHaveCount(0);
  });

  test('goes back to the app without verifying', async ({ page, api }) => {
    api.emailVerified = false;
    await page.goto('/sign-in?verify=me%40example.test');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Add your first apartment' })).toBeVisible();
  });
});

test('signs out from the menu', async ({ page, api }) => {
  await page.goto('/');
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  expect(api.signedIn).toBe(false);
});

test('still leaves when signing out fails on the server', async ({ page, api }) => {
  api.failNext('POST', /sign-out$/, { abort: true });
  await page.goto('/');
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
});

test.describe('deleting your account', () => {
  test('keeps the account when the confirmation is dismissed', async ({ page, api }) => {
    await page.goto('/');
    const menu = await openMenu(page);
    page.once('dialog', (d) => {
      expect(d.message()).toBe('Permanently delete your account and all your data? This cannot be undone.');
      void d.dismiss();
    });
    await menu.getByRole('button', { name: 'Delete account' }).click();

    await expect(menu).toBeVisible();
    expect(api.callsTo('DELETE /api/me')).toHaveLength(0);
    expect(api.signedIn).toBe(true);
  });

  test('deletes the account and leaves for the sign-in page once confirmed', async ({ page, api }) => {
    await page.goto('/');
    const menu = await openMenu(page);
    page.once('dialog', (d) => void d.accept());
    await menu.getByRole('button', { name: 'Delete account' }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    expect(api.callsTo('DELETE /api/me')).toHaveLength(1);
    expect(api.signedIn).toBe(false);
  });

  test('shows a blocking progress screen while the account is being deleted', async ({ page, api }) => {
    const finish = api.holdNext('DELETE', /\/api\/me$/);
    await page.goto('/');
    const menu = await openMenu(page);
    page.once('dialog', (d) => void d.accept());
    await menu.getByRole('button', { name: 'Delete account' }).click();

    const progress = page.getByRole('alertdialog', { name: 'Deleting your account' });
    await expect(progress).toBeVisible();
    await expect(progress).toContainText('This can take a few seconds. Please keep this page open.');
    await expect(page).not.toHaveURL(/sign-in/);

    finish();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('removes the progress screen and shows the error when deleting fails', async ({ page, api }) => {
    const finish = api.holdNext('DELETE', /\/api\/me$/);
    api.failNext('DELETE', /\/api\/me$/, { status: 500, body: { error: 'Could not delete the account.' } });
    await page.goto('/');
    const menu = await openMenu(page);
    page.once('dialog', (d) => void d.accept());
    await menu.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    finish();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(menu.getByText('Could not delete the account.')).toBeVisible();
  });

  test('stays signed in and says so when the server cannot delete it', async ({ page, api }) => {
    api.failNext('DELETE', /\/api\/me$/, { status: 500, body: { error: 'Could not delete the account.' } });
    await page.goto('/');
    const menu = await openMenu(page);
    page.once('dialog', (d) => void d.accept());
    await menu.getByRole('button', { name: 'Delete account' }).click();

    await expect(menu.getByText('Could not delete the account.')).toBeVisible();
    expect(api.signedIn).toBe(true);
    await expect(page).not.toHaveURL(/sign-in/);
  });
});
