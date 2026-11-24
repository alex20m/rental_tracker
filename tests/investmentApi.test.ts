import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
import * as shares from '@/app/api/apartments/[id]/shares/route';
import * as owners from '@/app/api/apartments/[id]/owners/[userId]/route';
import * as invites from '@/app/api/apartments/[id]/invites/route';
import * as me from '@/app/api/me/route';
import * as investment from '@/app/api/apartments/[id]/investment/route';
import * as loanYear from '@/app/api/apartments/[id]/investment/loan/[year]/route';
import { testDb, type TestDb } from './support/testDb';
import type { ApartmentView } from '@/lib/domain/types';

const alice: Session = { userId: 'usr_alice', name: 'Alice Aalto', email: 'alice@example.test', emailVerified: true };
const bob: Session = { userId: 'usr_bob', name: 'Bob Berg', email: 'bob@example.test', emailVerified: true };

let db: TestDb;

beforeAll(async () => {
  db = await testDb();
  setQueryableForTesting(db);
});
beforeEach(async () => {
  await db.reset();
  signIn(null);
});
afterEach(() => setAuthProvider(defaultAuth));
afterAll(async () => {
  setQueryableForTesting(undefined);
  await db.close();
});

function signIn(session: Session | null) {
  setAuthProvider({ getSession: async () => session });
}

const req = (method: string, body?: unknown) =>
  new Request('https://app.test/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function createApartment(as: Session): Promise<string> {
  signIn(as);
  const res = await apartments.POST(req('POST', { name: 'Flat' }));
  return ((await res.json()) as { id: string }).id;
}

async function view(as: Session, id: string): Promise<ApartmentView> {
  signIn(as);
  return (await (await apartment.GET(req('GET'), ctx({ id }))).json()) as ApartmentView;
}

/** Alice invites Bob for 40 %, who then joins by signing in with his verified email. */
async function sharedWithBob(): Promise<string> {
  const id = await createApartment(alice);
  signIn(alice);
  await invites.POST(req('POST', { email: bob.email, sharePct: 40 }), ctx({ id }));
  signIn(bob);
  await apartments.GET(req('GET')); // loading the portfolio claims the invite
  return id;
}

const details = { loanAmount: 80000, marketValue: 112500.5 };

async function saveDetails(as: Session, id: string, body: unknown = details) {
  signIn(as);
  return investment.PUT(req('PUT', body), ctx({ id }));
}

async function saveYear(as: Session, id: string, year: string, body: unknown) {
  signIn(as);
  return loanYear.PUT(req('PUT', body), ctx({ id, year }));
}

describe('the loan and value of an owner’s own investment', () => {
  it('starts as none, and is read back exactly once saved', async () => {
    const id = await createApartment(alice);
    expect((await view(alice, id)).myInvestment).toBeNull();

    expect((await saveDetails(alice, id)).status).toBe(200);

    expect((await view(alice, id)).myInvestment).toEqual(details);
  });

  it('is changed by saving again, and keeps nothing once both are emptied', async () => {
    const id = await createApartment(alice);
    await saveDetails(alice, id);

    await saveDetails(alice, id, { loanAmount: 0, marketValue: 99000 });
    expect((await view(alice, id)).myInvestment).toEqual({ loanAmount: 0, marketValue: 99000 });

    await saveDetails(alice, id, { loanAmount: 0, marketValue: 0 });
    expect((await view(alice, id)).myInvestment).toBeNull();
    expect(await db.query('select 1 from investments')).toEqual([]);
  });

  it('refuses amounts below zero or with fractions of a cent, a missing amount and unknown fields', async () => {
    const id = await createApartment(alice);

    const refused = await Promise.all([
      saveDetails(alice, id, { ...details, loanAmount: -1 }),
      saveDetails(alice, id, { ...details, marketValue: 1.234 }),
      saveDetails(alice, id, { loanAmount: 1 }),
      saveDetails(alice, id, { ...details, extra: 1 }),
      saveDetails(alice, id, '{oops'),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect(await db.query('select 1 from investments')).toEqual([]);
  });
});

describe('a year of the owner’s own loan', () => {
  it('is listed oldest first, and replaced by saving the same year again', async () => {
    const id = await createApartment(alice);
    await saveYear(alice, id, '2025', { amortization: 4000, balance: 74000 });
    await saveYear(alice, id, '2024', { amortization: 2000, balance: 78000 });
    await saveYear(alice, id, '2025', { amortization: 4100.25, balance: 73899.75 });

    expect((await view(alice, id)).myLoanYears).toEqual([
      { year: 2024, amortization: 2000, balance: 78000 },
      { year: 2025, amortization: 4100.25, balance: 73899.75 },
    ]);
  });

  it('is removed by saving it empty', async () => {
    const id = await createApartment(alice);
    await saveYear(alice, id, '2025', { amortization: 4000, balance: 74000 });

    expect((await saveYear(alice, id, '2025', { amortization: 0, balance: 0 })).status).toBe(200);

    expect((await view(alice, id)).myLoanYears).toEqual([]);
    expect(await db.query('select 1 from loan_years')).toEqual([]);
  });

  it('refuses a year that is not a year, amounts below zero or with fractions of a cent, and unknown fields', async () => {
    const id = await createApartment(alice);
    const ok = { amortization: 1, balance: 1 };

    const refused = await Promise.all([
      saveYear(alice, id, '25', ok),
      saveYear(alice, id, '2025.5', ok),
      saveYear(alice, id, '1899', ok),
      saveYear(alice, id, 'next', ok),
      saveYear(alice, id, '2025', { ...ok, amortization: -1 }),
      saveYear(alice, id, '2025', { ...ok, balance: 0.001 }),
      saveYear(alice, id, '2025', { amortization: 1 }),
      saveYear(alice, id, '2025', { ...ok, interest: 5 }),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 400, 400]);
    expect(await db.query('select 1 from loan_years')).toEqual([]);
  });
});

describe('the investment’s privacy and lifetime', () => {
  it('is private: a co-owner neither sees it nor, by saving their own, changes it', async () => {
    const id = await sharedWithBob();
    await saveDetails(alice, id);
    await saveYear(alice, id, '2025', { amortization: 4000, balance: 74000 });

    const bobSees = await view(bob, id);
    expect(bobSees.myInvestment).toBeNull();
    expect(bobSees.myLoanYears).toEqual([]);

    await saveDetails(bob, id, { loanAmount: 1, marketValue: 2 });
    await saveYear(bob, id, '2025', { amortization: 3, balance: 4 });
    const aliceSees = await view(alice, id);
    expect(aliceSees.myInvestment).toEqual(details);
    expect(aliceSees.myLoanYears).toEqual([{ year: 2025, amortization: 4000, balance: 74000 }]);
  });

  it('is not reachable by someone who does not own the apartment, nor by someone signed out', async () => {
    const id = await createApartment(alice);

    const attempts = [
      await saveDetails(bob, id),
      await saveYear(bob, id, '2025', { amortization: 1, balance: 1 }),
      await saveDetails(null as unknown as Session, id),
      await saveYear(null as unknown as Session, id, '2025', { amortization: 1, balance: 1 }),
    ];

    expect(attempts.map((r) => r.status)).toEqual([404, 404, 401, 401]);
    expect(await db.query('select 1 from investments')).toEqual([]);
    expect(await db.query('select 1 from loan_years')).toEqual([]);
  });

  it('goes with the ownership of the person who kept it, with their account, and with the apartment', async () => {
    const id = await sharedWithBob();
    await saveDetails(bob, id);
    await saveYear(bob, id, '2025', { amortization: 1, balance: 1 });
    await saveDetails(alice, id);
    await saveYear(alice, id, '2025', { amortization: 1, balance: 1 });

    // Bob gives his share away and leaves: what he kept for himself goes with him.
    signIn(alice);
    await shares.PUT(
      req('PUT', {
        owners: [
          { userId: alice.userId, sharePct: 100 },
          { userId: bob.userId, sharePct: 0 },
        ],
        invites: [],
      }),
      ctx({ id }),
    );
    signIn(alice);
    await owners.DELETE(req('DELETE'), ctx({ id, userId: bob.userId }));
    expect(await db.query('select user_id from investments')).toEqual([{ user_id: alice.userId }]);
    expect(await db.query('select user_id from loan_years')).toEqual([{ user_id: alice.userId }]);

    signIn(alice);
    await apartment.DELETE(req('DELETE'), ctx({ id }));
    expect(await db.query('select 1 from investments')).toEqual([]);
    expect(await db.query('select 1 from loan_years')).toEqual([]);
  });

  it('is erased with the account of a co-owner who leaves the others’ apartment behind', async () => {
    const id = await sharedWithBob();
    await saveDetails(bob, id);
    await saveYear(bob, id, '2025', { amortization: 1, balance: 1 });
    await saveDetails(alice, id);

    signIn(bob);
    await me.DELETE(req('DELETE'));

    expect(await db.query('select user_id from investments')).toEqual([{ user_id: alice.userId }]);
    expect(await db.query('select 1 from loan_years')).toEqual([]);
  });
});
