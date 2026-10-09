/**
 * An in-memory stand-in for the app's API and for Neon Auth's endpoints,
 * installed at the network boundary of a Playwright page.
 *
 * It keeps state like the real server does for one signed-in person, so a
 * test can add an apartment and then see it listed. Its responses copy the
 * real routes' shapes and status codes (app/api/**); the real routes are
 * tested against Postgres in tests/api.test.ts, so a drift between the two
 * shows up as a failing test on one side.
 *
 * Any request it does not know is answered 501 and recorded in `unhandled`,
 * and the fixture fails the test if that list is not empty — a fake that
 * silently answered everything would hide a UI calling a route that does not
 * exist.
 */

import type { Page, Route } from '@playwright/test';
import type { AcquisitionCost, ApartmentSettings, ApartmentView, CostEntry, Owner, PendingInvite, RecurringEntry } from '../lib/domain/types';
import { nextMonth, repeatDay } from '../lib/domain/recurring';
import { defaultSettings } from '../lib/domain/types';

export const ME = { userId: 'usr_me', email: 'me@example.test' };
/** The name given at sign-up, which is what the declaration is printed in. */
export const ME_NAME = 'Aino Aalto';

type Failure = { method: string; path: RegExp; status?: number; body?: unknown; text?: string; abort?: boolean };
type Account = { password: string; verified: boolean; userId: string };

let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

export class FakeApi {
  signedIn = true;
  emailVerified = true;
  apartments = new Map<string, ApartmentView>();
  receipts = new Map<string, { contentType: string; data: Buffer }>();
  /** Neon Auth accounts, by email. */
  accounts = new Map<string, Account>();
  sentCodes: string[] = [];
  /** Emails a password-reset code was requested for. */
  resetCodes: string[] = [];
  /** Every request the UI made that changes something: `METHOD /path`, with its body. */
  calls: { call: string; body: unknown }[] = [];
  unhandled: string[] = [];
  private failures: Failure[] = [];
  private holds: { method: string; path: RegExp; gate: Promise<void> }[] = [];

  /** The next matching request fails: with `status` (and `body`), or as a network error. */
  failNext(method: string, path: RegExp, how: { status?: number; body?: unknown; text?: string; abort?: boolean }) {
    this.failures.push({ method, path, ...how });
  }

  /** The next matching request is not answered until the returned function is called. */
  holdNext(method: string, path: RegExp): () => void {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    this.holds.push({ method, path, gate });
    return release;
  }

  /** An apartment as the viewer sees it, owned by them alone unless `owners` says otherwise. */
  addApartment(
    settings: Partial<ApartmentSettings> = {},
    more: Partial<Pick<ApartmentView, 'owners' | 'invites' | 'rents' | 'costs' | 'recurring' | 'acquisitionCosts' | 'mySale' | 'mySharePct'>> = {},
  ): ApartmentView {
    const id = uuid();
    const apt: ApartmentView = {
      id,
      settings: { ...defaultSettings, ...settings },
      owners: [{ ...ME, sharePct: 100 }],
      invites: [],
      recurring: [],
      acquisitionCosts: [],
      mySale: null,
      rents: [],
      costs: [],
      mySharePct: 100,
      ...more,
    };
    this.apartments.set(id, apt);
    return apt;
  }

  /** Books what recurring entries have come due, up to this month, as the real server does when an apartment is opened. */
  private bookDue(apt: ApartmentView) {
    const today = new Date();
    const current = today.toISOString().slice(0, 7);
    const day = (r: RecurringEntry) => String(r.dayOfMonth).padStart(2, '0');
    const due = (r: RecurringEntry) => r.nextMonth < current || (r.nextMonth === current && r.dayOfMonth <= today.getUTCDate());
    for (const r of apt.recurring) {
      for (; due(r); r.nextMonth = nextMonth(r.nextMonth)) {
        if (r.kind === 'cost') {
          apt.costs.push({ id: uuid(), date: `${r.nextMonth}-${day(r)}`, category: r.category!, description: r.description, amount: r.amount, hasReceipt: false });
        } else if (!apt.rents.some((x) => x.month === r.nextMonth)) {
          apt.rents.push({ month: r.nextMonth, status: 'paid', amount: r.amount, receivedDate: `${r.nextMonth}-${day(r)}`, note: '' });
        }
      }
    }
  }

  callsTo(prefix: string) {
    return this.calls.filter((c) => c.call.startsWith(prefix));
  }

  async install(page: Page) {
    await page.route('**/api/**', (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    const raw = req.postData();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    if (method !== 'GET') this.calls.push({ call: `${method} ${path}`, body });

    const hold = this.holds.find((h) => h.method === method && h.path.test(path));
    if (hold) {
      this.holds.splice(this.holds.indexOf(hold), 1);
      await hold.gate;
    }

    const failure = this.failures.find((f) => f.method === method && f.path.test(path));
    if (failure) {
      this.failures.splice(this.failures.indexOf(failure), 1);
      if (failure.abort) return route.abort('failed');
      if (failure.text !== undefined) return route.fulfill({ status: failure.status ?? 500, contentType: 'text/plain', body: failure.text });
      return json(route, failure.body ?? { error: 'Something broke' }, failure.status ?? 500);
    }

    if (path.startsWith('/api/auth/')) return this.auth(route, method, path.slice('/api/auth/'.length), body);
    if (!this.signedIn) return json(route, { error: 'Not signed in' }, 401);

    const answer = this.app(method, path.split('/').slice(2), body as Record<string, unknown>, url);
    if (answer === undefined) {
      this.unhandled.push(`${method} ${path}`);
      return json(route, { error: 'Not implemented in FakeApi' }, 501);
    }
    if (answer instanceof Binary) {
      return route.fulfill({ status: 200, contentType: answer.contentType, body: answer.data });
    }
    return json(route, answer.body, answer.status);
  }

  private app(method: string, seg: string[], body: Record<string, unknown>, _url: URL): Answer | Binary | undefined {
    const [root, id, sub, subId, leaf] = seg;
    const ok = { status: 200, body: { ok: true } };
    const notFound = { status: 404, body: { error: 'Not found' } };

    if (root === 'me' && method === 'GET') {
      return { status: 200, body: { ...ME, name: ME_NAME, emailVerified: this.emailVerified } };
    }
    if (root === 'me' && method === 'DELETE') {
      this.signedIn = false;
      return ok;
    }
    if (root === 'import' && method === 'POST') {
      const apt = this.addApartment(body.settings as ApartmentSettings, {
        rents: body.rents as ApartmentView['rents'],
        costs: (body.costs as CostEntry[]).map((c) => ({ ...c, hasReceipt: false })),
      });
      return { status: 201, body: { id: apt.id } };
    }
    if (root !== 'apartments') return undefined;

    if (!id) {
      if (method === 'GET') {
        return {
          status: 200,
          body: {
            apartments: [...this.apartments.values()].map((a) => ({
              id: a.id,
              name: a.settings.name,
              address: a.settings.address,
              mySharePct: a.mySharePct,
              ownerCount: a.owners.length,
            })),
            emailVerified: this.emailVerified,
          },
        };
      }
      if (method === 'POST') return { status: 201, body: { id: this.addApartment(body as Partial<ApartmentSettings>).id } };
      return undefined;
    }

    const apt = this.apartments.get(id);
    if (!apt) return notFound;
    const me = () => apt.owners.find((o) => o.userId === ME.userId)!;
    const syncMine = () => {
      apt.mySharePct = me()?.sharePct ?? 0;
    };

    if (!sub) {
      if (method === 'GET') {
        this.bookDue(apt);
        return { status: 200, body: apt };
      }
      if (method === 'PATCH') {
        apt.settings = { ...apt.settings, ...(body as Partial<ApartmentSettings>) };
        return ok;
      }
      if (method === 'DELETE') {
        if (apt.owners.length > 1) {
          return { status: 409, body: { error: 'Other owners still own part of this apartment. Leave it instead.' } };
        }
        this.apartments.delete(id);
        return ok;
      }
    }
    if (sub === 'rents' && subId) {
      apt.rents = apt.rents.filter((r) => r.month !== subId);
      if (method === 'PUT') {
        const { repeatMonthly, ...rent } = body as Omit<ApartmentView['rents'][number], 'month'> & { repeatMonthly?: boolean };
        apt.rents.push({ month: subId, ...rent });
        if (repeatMonthly && rent.status === 'paid' && !apt.recurring.some((r) => r.kind === 'rent')) {
          apt.recurring.push({ id: uuid(), kind: 'rent', description: '', amount: rent.amount, dayOfMonth: repeatDay(rent.receivedDate), nextMonth: nextMonth(subId) });
        }
      }
      return ok;
    }
    if (sub === 'recurring') {
      if (!subId && method === 'POST') {
        const input = body as unknown as Omit<RecurringEntry, 'id' | 'nextMonth'> & { firstMonth: string };
        if (input.kind === 'rent' && apt.recurring.some((r) => r.kind === 'rent')) {
          return { status: 409, body: { error: 'The rent already repeats every month. Change that one instead.' } };
        }
        const { firstMonth, ...rest } = input;
        const entry: RecurringEntry = { id: uuid(), ...rest, nextMonth: firstMonth };
        apt.recurring.push(entry);
        return { status: 201, body: { id: entry.id } };
      }
      const entry = apt.recurring.find((r) => r.id === subId);
      if (!entry) return notFound;
      if (method === 'PUT') {
        Object.assign(entry, body);
        return ok;
      }
      if (method === 'DELETE') {
        apt.recurring = apt.recurring.filter((r) => r !== entry);
        return ok;
      }
    }
    if (sub === 'costs') {
      if (!subId && method === 'POST') {
        const { repeatMonthly, ...entry } = body as Omit<CostEntry, 'id' | 'hasReceipt'> & { repeatMonthly?: boolean };
        const cost: CostEntry = { id: uuid(), ...entry, hasReceipt: false };
        apt.costs.push(cost);
        if (repeatMonthly) {
          apt.recurring.push({
            id: uuid(),
            kind: 'cost',
            category: cost.category,
            description: cost.description,
            amount: cost.amount,
            dayOfMonth: repeatDay(cost.date),
            nextMonth: nextMonth(cost.date.slice(0, 7)),
          });
        }
        return { status: 201, body: { id: cost.id } };
      }
      const cost = apt.costs.find((c) => c.id === subId);
      if (!cost) return notFound;
      if (leaf === 'receipt') {
        if (method === 'GET') {
          const r = this.receipts.get(cost.id);
          return r ? new Binary(r.contentType, r.data) : notFound;
        }
        if (method === 'PUT') {
          const [, contentType, base64] = /^data:([^;]+);base64,(.*)$/.exec(String(body.dataUrl))!;
          this.receipts.set(cost.id, { contentType: contentType!, data: Buffer.from(base64!, 'base64') });
          cost.hasReceipt = true;
          return ok;
        }
        if (method === 'DELETE') {
          this.receipts.delete(cost.id);
          cost.hasReceipt = false;
          return ok;
        }
      }
      if (method === 'PUT') {
        Object.assign(cost, body);
        return ok;
      }
      if (method === 'DELETE') {
        apt.costs = apt.costs.filter((c) => c !== cost);
        return ok;
      }
    }
    if (sub === 'sale') {
      if (method === 'PUT') apt.mySale = body as unknown as ApartmentView['mySale'];
      if (method === 'DELETE') apt.mySale = null;
      return ok;
    }
    if (sub === 'acquisition') {
      if (!subId && method === 'POST') {
        const cost: AcquisitionCost = { id: uuid(), ...(body as Omit<AcquisitionCost, 'id'>) };
        apt.acquisitionCosts.push(cost);
        return { status: 201, body: { id: cost.id } };
      }
      const cost = apt.acquisitionCosts.find((c) => c.id === subId);
      if (!cost) return notFound;
      if (method === 'PUT') {
        Object.assign(cost, body);
        return ok;
      }
      if (method === 'DELETE') {
        apt.acquisitionCosts = apt.acquisitionCosts.filter((c) => c !== cost);
        return ok;
      }
    }
    if (sub === 'invites') {
      if (!subId && method === 'POST') {
        const share = Number(body.sharePct);
        if (share > me().sharePct) return { status: 409, body: { error: "You can't give away more than your own share." } };
        me().sharePct -= share;
        syncMine();
        const invite: PendingInvite = { id: uuid(), email: String(body.email).toLowerCase(), sharePct: share };
        apt.invites.push(invite);
        // No mail goes out from the fake; the real route reports whether Resend sent it.
        return { status: 201, body: { id: invite.id, emailSent: false } };
      }
      if (subId && method === 'DELETE') {
        const invite = apt.invites.find((i) => i.id === subId);
        if (!invite) return notFound;
        apt.invites = apt.invites.filter((i) => i !== invite);
        me().sharePct += invite.sharePct;
        syncMine();
        return ok;
      }
    }
    if (sub === 'shares' && method === 'PUT') {
      const shares = body as { owners: Owner[]; invites: PendingInvite[] };
      for (const o of shares.owners) apt.owners.find((x) => x.userId === o.userId)!.sharePct = o.sharePct;
      for (const i of shares.invites) apt.invites.find((x) => x.id === i.id)!.sharePct = i.sharePct;
      syncMine();
      return ok;
    }
    if (sub === 'owners' && subId && method === 'DELETE') {
      apt.owners = apt.owners.filter((o) => o.userId !== decodeURIComponent(subId));
      if (decodeURIComponent(subId) === ME.userId) this.apartments.delete(id);
      return ok;
    }
    return undefined;
  }

  /** Neon Auth (Better Auth) endpoints, as far as the sign-in page uses them. */
  private auth(route: Route, method: string, endpoint: string, body: unknown) {
    const b = (body ?? {}) as Record<string, string>;
    const email = (b.email ?? '').toLowerCase();
    const session = () => ({ user: { id: ME.userId, name: ME_NAME, email: ME.email, emailVerified: this.emailVerified }, session: { id: 's' } });

    if (endpoint === 'get-session' && method === 'GET') return json(route, this.signedIn ? session() : null);
    if (endpoint === 'sign-out' && method === 'POST') {
      this.signedIn = false;
      return json(route, { success: true });
    }
    if (endpoint === 'sign-in/email' && method === 'POST') {
      const account = this.accounts.get(email);
      if (!account || account.password !== b.password) {
        return json(route, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
      }
      if (!account.verified) return json(route, { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 403);
      this.signedIn = true;
      return json(route, { redirect: false, token: 'tok', user: session().user });
    }
    if (endpoint === 'sign-up/email' && method === 'POST') {
      if (this.accounts.has(email)) return json(route, { code: 'USER_ALREADY_EXISTS', message: 'User already exists' }, 422);
      // Sends no code: the project has send-on-sign-up off (SETUP.md), the app asks for it.
      this.accounts.set(email, { password: b.password!, verified: false, userId: ME.userId });
      return json(route, { token: null, user: { id: ME.userId, email } });
    }
    if (endpoint === 'email-otp/send-verification-otp' && method === 'POST') {
      this.sentCodes.push(email);
      return json(route, { success: true });
    }
    if (endpoint === 'email-otp/verify-email' && method === 'POST') {
      if (b.otp !== '123456') return json(route, { code: 'INVALID_OTP', message: 'Invalid OTP' }, 400);
      const account = this.accounts.get(email);
      if (account) account.verified = true;
      this.emailVerified = true;
      return json(route, { status: true, token: null, user: { id: ME.userId, email, emailVerified: true } });
    }
    if (endpoint === 'email-otp/request-password-reset' && method === 'POST') {
      this.resetCodes.push(email);
      return json(route, { success: true });
    }
    if (endpoint === 'email-otp/reset-password' && method === 'POST') {
      if (b.otp !== '123456') return json(route, { code: 'INVALID_OTP', message: 'Invalid OTP' }, 400);
      const account = this.accounts.get(email);
      if (account) account.password = b.password!;
      return json(route, { success: true });
    }
    this.unhandled.push(`${method} /api/auth/${endpoint}`);
    return json(route, { error: 'Not implemented in FakeApi' }, 501);
  }
}

type Answer = { status: number; body: unknown };

class Binary {
  constructor(
    readonly contentType: string,
    readonly data: Buffer,
  ) {}
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
