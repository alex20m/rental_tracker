import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
import * as sale from '@/app/api/apartments/[id]/sale/route';
import * as shares from '@/app/api/apartments/[id]/shares/route';
import * as owners from '@/app/api/apartments/[id]/owners/[userId]/route';
import * as invites from '@/app/api/apartments/[id]/invites/route';
import * as me from '@/app/api/me/route';
import * as acquisitions from '@/app/api/apartments/[id]/acquisition/route';
import * as acquisition from '@/app/api/apartments/[id]/acquisition/[acquisitionId]/route';
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
    body: body === undefined ? undefined : JSON.stringify(body),
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

const fuktmatning = { date: '2025-02-10', kind: 'inspection', description: 'Fuktmätning', amount: 300 };

describe('the acquisition costs of an owner', () => {
  it('are listed with the apartment, oldest first, with their kind and amount', async () => {
    const id = await createApartment(alice);
    expect((await view(alice, id)).acquisitionCosts).toEqual([]);

    signIn(alice);
    const tax = await acquisitions.POST(
      req('POST', { date: '2018-03-02', kind: 'transfer_tax', description: '', amount: 911.25 }),
      ctx({ id }),
    );
    const survey = await acquisitions.POST(req('POST', fuktmatning), ctx({ id }));

    expect(tax.status).toBe(201);
    expect(survey.status).toBe(201);
    expect((await view(alice, id)).acquisitionCosts).toEqual([
      { id: ((await tax.json()) as { id: string }).id, date: '2018-03-02', kind: 'transfer_tax', description: '', amount: 911.25 },
      { id: ((await survey.json()) as { id: string }).id, ...fuktmatning },
    ]);
  });

  it('can be changed and deleted by an owner', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const created = (await (await acquisitions.POST(req('POST', fuktmatning), ctx({ id }))).json()) as { id: string };

    const changed = await acquisition.PUT(
      req('PUT', { ...fuktmatning, kind: 'other', amount: 350.5 }),
      ctx({ id, acquisitionId: created.id }),
    );
    expect(changed.status).toBe(200);
    expect((await view(alice, id)).acquisitionCosts).toEqual([{ id: created.id, ...fuktmatning, kind: 'other', amount: 350.5 }]);

    signIn(alice);
    const removed = await acquisition.DELETE(req('DELETE'), ctx({ id, acquisitionId: created.id }));
    expect(removed.status).toBe(200);
    expect((await view(alice, id)).acquisitionCosts).toEqual([]);
  });

  it('refuses a kind it does not know, an amount of zero or with fractions of a cent, and a date that does not exist', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const post = (body: unknown) => acquisitions.POST(req('POST', body), ctx({ id }));

    const refused = await Promise.all([
      post({ ...fuktmatning, kind: 'gift' }),
      post({ ...fuktmatning, amount: 0 }),
      post({ ...fuktmatning, amount: 10.005 }),
      post({ ...fuktmatning, date: '2025-02-30' }),
      post({ ...fuktmatning, extra: 1 }),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await view(alice, id)).acquisitionCosts).toEqual([]);
  });

  it('are invisible and untouchable to someone who does not own the apartment', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const created = (await (await acquisitions.POST(req('POST', fuktmatning), ctx({ id }))).json()) as { id: string };

    signIn(bob);
    const attempts = await Promise.all([
      acquisitions.POST(req('POST', fuktmatning), ctx({ id })),
      acquisition.PUT(req('PUT', { ...fuktmatning, amount: 1 }), ctx({ id, acquisitionId: created.id })),
      acquisition.DELETE(req('DELETE'), ctx({ id, acquisitionId: created.id })),
    ]);

    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404]);
    expect((await view(alice, id)).acquisitionCosts).toHaveLength(1);
    expect((await view(alice, id)).acquisitionCosts[0]!.amount).toBe(300);
  });

  it('cannot be reached through the id of another apartment', async () => {
    const mine = await createApartment(alice);
    signIn(alice);
    const other = (await (await apartments.POST(req('POST', { name: 'Other' }))).json()) as { id: string };
    const created = (await (await acquisitions.POST(req('POST', fuktmatning), ctx({ id: other.id }))).json()) as { id: string };

    signIn(alice);
    const viaWrongApartment = await acquisition.DELETE(req('DELETE'), ctx({ id: mine, acquisitionId: created.id }));
    const notAnId = await acquisition.DELETE(req('DELETE'), ctx({ id: mine, acquisitionId: 'nope' }));

    expect(viaWrongApartment.status).toBe(404);
    expect(notAnId.status).toBe(404);
    expect((await view(alice, other.id)).acquisitionCosts).toHaveLength(1);
  });

  it('are deleted with the apartment', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    await acquisitions.POST(req('POST', fuktmatning), ctx({ id }));

    await apartment.DELETE(req('DELETE'), ctx({ id }));

    expect(await db.query('select 1 from acquisition_costs')).toEqual([]);
  });
});

const mySale = { purchaseDate: '2018-03-01', purchasePrice: 62000, saleDate: '2025-06-15', salePrice: 111000, saleCosts: 2400.5 };

/** Alice invites Bob for 40 %, who then joins by signing in with his verified email. */
async function sharedWithBob(): Promise<string> {
  const id = await createApartment(alice);
  signIn(alice);
  await invites.POST(req('POST', { email: bob.email, sharePct: 40 }), ctx({ id }));
  signIn(bob);
  await apartments.GET(req('GET')); // loading the portfolio claims the invite
  return id;
}

describe('the sale of an owner’s own part', () => {
  it('starts as none, is saved with the purchase it follows from, and is read back exactly', async () => {
    const id = await createApartment(alice);
    expect((await view(alice, id)).mySale).toBeNull();

    signIn(alice);
    const res = await sale.PUT(req('PUT', mySale), ctx({ id }));

    expect(res.status).toBe(200);
    expect((await view(alice, id)).mySale).toEqual(mySale);
  });

  it('can be saved before it is complete, with only the purchase, and then replaced', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const onlyPurchase = { purchaseDate: '2018-03-01', purchasePrice: 62000, saleDate: '', salePrice: 0, saleCosts: 0 };
    await sale.PUT(req('PUT', onlyPurchase), ctx({ id }));
    expect((await view(alice, id)).mySale).toEqual(onlyPurchase);

    signIn(alice);
    await sale.PUT(req('PUT', mySale), ctx({ id }));
    expect((await view(alice, id)).mySale).toEqual(mySale);
    expect(await db.query('select 1 from sales')).toHaveLength(1);
  });

  it('can be taken back', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    await sale.PUT(req('PUT', mySale), ctx({ id }));
    signIn(alice);

    const res = await sale.DELETE(req('DELETE'), ctx({ id }));

    expect(res.status).toBe(200);
    expect((await view(alice, id)).mySale).toBeNull();
  });

  it('is private: a co-owner neither sees it nor, by saving their own, changes it', async () => {
    const id = await sharedWithBob();
    signIn(alice);
    await sale.PUT(req('PUT', mySale), ctx({ id }));
    signIn(alice);
    await acquisitions.POST(req('POST', fuktmatning), ctx({ id }));

    const bobSees = await view(bob, id);
    expect(bobSees.mySale).toBeNull();
    expect(bobSees.acquisitionCosts).toEqual([]);

    signIn(bob);
    await sale.PUT(req('PUT', { ...mySale, salePrice: 5 }), ctx({ id }));
    expect((await view(alice, id)).mySale).toEqual(mySale);
    expect((await view(bob, id)).mySale).toMatchObject({ salePrice: 5 });
  });

  it('keeps a co-owner from changing or deleting an acquisition cost that is not theirs', async () => {
    const id = await sharedWithBob();
    signIn(alice);
    const created = (await (await acquisitions.POST(req('POST', fuktmatning), ctx({ id }))).json()) as { id: string };

    signIn(bob);
    const attempts = await Promise.all([
      acquisition.PUT(req('PUT', { ...fuktmatning, amount: 1 }), ctx({ id, acquisitionId: created.id })),
      acquisition.DELETE(req('DELETE'), ctx({ id, acquisitionId: created.id })),
    ]);

    expect(attempts.map((r) => r.status)).toEqual([404, 404]);
    expect((await view(alice, id)).acquisitionCosts).toMatchObject([{ id: created.id, amount: 300 }]);
  });

  it('refuses a day that does not exist, amounts below zero or with fractions of a cent, and unknown fields', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const put = (body: unknown) => sale.PUT(req('PUT', body), ctx({ id }));

    const refused = await Promise.all([
      put({ ...mySale, saleDate: '2025-02-30' }),
      put({ ...mySale, purchaseDate: '2018-13-01' }),
      put({ ...mySale, salePrice: -1 }),
      put({ ...mySale, saleCosts: 1.234 }),
      put({ ...mySale, purchasePrice: -5 }),
      put({ ...mySale, extra: 1 }),
      put({ saleDate: '2025-06-15' }),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 400]);
    expect((await view(alice, id)).mySale).toBeNull();
  });

  it('is not reachable by someone who does not own the apartment', async () => {
    const id = await createApartment(alice);
    signIn(bob);

    const attempts = await Promise.all([sale.PUT(req('PUT', mySale), ctx({ id })), sale.DELETE(req('DELETE'), ctx({ id }))]);

    expect(attempts.map((r) => r.status)).toEqual([404, 404]);
    expect(await db.query('select 1 from sales')).toEqual([]);
  });

  it('is deleted with the apartment, and with the account or ownership of the person who made it', async () => {
    const id = await sharedWithBob();
    signIn(bob);
    await sale.PUT(req('PUT', mySale), ctx({ id }));
    signIn(bob);
    await acquisitions.POST(req('POST', fuktmatning), ctx({ id }));
    signIn(alice);
    await sale.PUT(req('PUT', mySale), ctx({ id }));

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

    expect(await db.query('select user_id from sales')).toEqual([{ user_id: alice.userId }]);
    expect(await db.query('select 1 from acquisition_costs')).toEqual([]);

    signIn(alice);
    await acquisitions.POST(req('POST', fuktmatning), ctx({ id }));
    signIn(alice);
    await me.DELETE(req('DELETE'));
    expect(await db.query('select 1 from sales')).toEqual([]);
    expect(await db.query('select 1 from acquisition_costs')).toEqual([]);
  });

  it('is deleted with the account of a co-owner who leaves the others’ apartment behind', async () => {
    const id = await sharedWithBob();
    signIn(bob);
    await sale.PUT(req('PUT', mySale), ctx({ id }));
    signIn(alice);
    await sale.PUT(req('PUT', mySale), ctx({ id }));

    signIn(bob);
    await me.DELETE(req('DELETE'));

    expect(await db.query('select user_id from sales')).toEqual([{ user_id: alice.userId }]);
  });
});
