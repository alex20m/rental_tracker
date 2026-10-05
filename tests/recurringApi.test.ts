import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
import * as rents from '@/app/api/apartments/[id]/rents/[month]/route';
import * as costs from '@/app/api/apartments/[id]/costs/route';
import * as recurring from '@/app/api/apartments/[id]/recurring/route';
import * as recurringOne from '@/app/api/apartments/[id]/recurring/[recurringId]/route';
import type { ApartmentView } from '@/lib/domain/types';
import { testDb, type TestDb } from './support/testDb';

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

afterEach(() => {
  setAuthProvider(defaultAuth);
});

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function createApartment(as: Session): Promise<string> {
  signIn(as);
  return ((await (await apartments.POST(req('POST', { name: 'Flat' }))).json()) as { id: string }).id;
}

const view = async (id: string) => (await (await apartment.GET(req('GET'), ctx({ id }))).json()) as ApartmentView;

const thisMonth = new Date().toISOString().slice(0, 7);
const lastMonth = (() => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
})();

const charge = { kind: 'cost', category: 'maintenance_charge', description: 'Hoitovastike', amount: 150, firstMonth: lastMonth };

describe('the recurring routes', () => {
  it('answer 401 to anyone signed out', async () => {
    const id = await createApartment(alice);
    signIn(null);
    const p = ctx({ id, recurringId: id });

    const responses = await Promise.all([
      recurring.POST(req('POST', charge), p),
      recurringOne.PUT(req('PUT', { description: '', amount: 1, dayOfMonth: 1 }), p),
      recurringOne.DELETE(req('DELETE'), p),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(await db.query('select 1 from recurring_entries')).toEqual([]);
  });

  it('create an entry that books the months since its first, and show up on the apartment', async () => {
    const id = await createApartment(alice);
    const res = await recurring.POST(req('POST', charge), ctx({ id }));

    expect(res.status).toBe(201);
    const apt = await view(id);
    expect(apt.costs.map((c) => c.date)).toEqual([`${lastMonth}-01`, `${thisMonth}-01`]);
    expect(apt.recurring).toHaveLength(1);
  });

  it('change and delete an entry', async () => {
    const id = await createApartment(alice);
    const { id: entryId } = (await (await recurring.POST(req('POST', charge), ctx({ id }))).json()) as { id: string };
    const p = ctx({ id, recurringId: entryId });

    expect((await recurringOne.PUT(req('PUT', { category: 'insurance', description: 'Home', amount: 20, dayOfMonth: 12 }), p)).status).toBe(200);
    expect((await view(id)).recurring[0]).toMatchObject({ category: 'insurance', description: 'Home', amount: 20, dayOfMonth: 12 });
    expect((await recurringOne.DELETE(req('DELETE'), ctx({ id, recurringId: entryId }))).status).toBe(200);
    expect((await view(id)).recurring).toEqual([]);
  });

  it('answer 404 to someone who does not own the apartment', async () => {
    const id = await createApartment(alice);
    const { id: entryId } = (await (await recurring.POST(req('POST', charge), ctx({ id }))).json()) as { id: string };
    signIn(bob);

    expect((await recurring.POST(req('POST', charge), ctx({ id }))).status).toBe(404);
    expect((await recurringOne.PUT(req('PUT', { description: '', amount: 1, dayOfMonth: 1 }), ctx({ id, recurringId: entryId }))).status).toBe(404);
    expect((await recurringOne.DELETE(req('DELETE'), ctx({ id, recurringId: entryId }))).status).toBe(404);
    expect(await db.query('select 1 from recurring_entries')).toHaveLength(1);
  });

  it('refuse a second recurring rent for the same apartment', async () => {
    const id = await createApartment(alice);
    const rent = { kind: 'rent', description: '', amount: 800, firstMonth: thisMonth };
    expect((await recurring.POST(req('POST', rent), ctx({ id }))).status).toBe(201);

    const again = await recurring.POST(req('POST', rent), ctx({ id }));

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'The rent already repeats every month. Change that one instead.' });
  });

  it('books on the 1st unless another day is given, and keeps the day that is', async () => {
    const id = await createApartment(alice);
    await recurring.POST(req('POST', charge), ctx({ id }));
    await recurring.POST(req('POST', { ...charge, category: 'insurance', dayOfMonth: 28 }), ctx({ id }));

    expect((await view(id)).recurring.map((r) => [r.category, r.dayOfMonth])).toEqual([
      ['maintenance_charge', 1],
      ['insurance', 28],
    ]);
  });

  it.each([
    ['day 0', { ...charge, dayOfMonth: 0 }],
    ['day 29, which February does not have', { ...charge, dayOfMonth: 29 }],
    ['a day that is not a whole number', { ...charge, dayOfMonth: 1.5 }],
    ['an improvement, which is not paid monthly', { ...charge, category: 'improvement' }],
    ['furniture, which is not paid monthly', { ...charge, category: 'furniture' }],
    ['a zero amount', { ...charge, amount: 0 }],
    ['a month that is not YYYY-MM', { ...charge, firstMonth: '2026-13' }],
    ['a rent with a category', { kind: 'rent', category: 'insurance', description: '', amount: 5, firstMonth: thisMonth }],
    ['a cost without a category', { kind: 'cost', description: '', amount: 5, firstMonth: thisMonth }],
    ['an unknown kind', { ...charge, kind: 'tax' }],
  ])('refuse %s', async (_, body) => {
    const id = await createApartment(alice);

    expect((await recurring.POST(req('POST', body), ctx({ id }))).status).toBe(400);
    expect(await db.query('select 1 from recurring_entries')).toEqual([]);
  });
});

it('refuses a change without a day', async () => {
  const id = await createApartment(alice);
  const { id: entryId } = (await (await recurring.POST(req('POST', charge), ctx({ id }))).json()) as { id: string };

  const res = await recurringOne.PUT(req('PUT', { description: '', amount: 1 }), ctx({ id, recurringId: entryId }));

  expect(res.status).toBe(400);
});

describe('registering a cost or rent that repeats', () => {
  it('adds a recurring cost from the month after the cost', async () => {
    const id = await createApartment(alice);
    const cost = { date: `${lastMonth}-01`, category: 'insurance', description: 'Home', amount: 30, repeatMonthly: true };

    expect((await costs.POST(req('POST', cost), ctx({ id }))).status).toBe(201);

    const apt = await view(id);
    expect(apt.recurring).toEqual([expect.objectContaining({ kind: 'cost', category: 'insurance', amount: 30 })]);
    expect(apt.costs.map((c) => c.date)).toEqual([`${lastMonth}-01`, `${thisMonth}-01`]);
  });

  it('adds nothing when the box is not ticked', async () => {
    const id = await createApartment(alice);
    await costs.POST(req('POST', { date: `${thisMonth}-01`, category: 'insurance', description: '', amount: 30 }), ctx({ id }));

    expect((await view(id)).recurring).toEqual([]);
  });

  it('refuses to repeat an improvement', async () => {
    const id = await createApartment(alice);
    const res = await costs.POST(
      req('POST', { date: `${thisMonth}-01`, category: 'improvement', description: '', amount: 900, repeatMonthly: true }),
      ctx({ id }),
    );

    expect(res.status).toBe(400);
    expect((await view(id)).costs).toEqual([]);
  });

  it('adds recurring rent from a paid month', async () => {
    const id = await createApartment(alice);
    const paid = { status: 'paid', amount: 800, receivedDate: `${lastMonth}-03`, note: '', repeatMonthly: true };

    expect((await rents.PUT(req('PUT', paid), ctx({ id, month: lastMonth }))).status).toBe(200);

    const apt = await view(id);
    expect(apt.recurring).toEqual([expect.objectContaining({ kind: 'rent', amount: 800 })]);
    expect(apt.rents.map((r) => [r.month, r.amount])).toEqual([[lastMonth, 800], [thisMonth, 800]]);
  });
});
