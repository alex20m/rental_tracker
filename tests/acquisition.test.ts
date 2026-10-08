import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
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

describe('the acquisition costs of an apartment', () => {
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

describe('the sale of an apartment', () => {
  it('is stored with the settings: a day, a price and the costs of selling', async () => {
    const id = await createApartment(alice);
    expect((await view(alice, id)).settings).toMatchObject({ saleDate: '', salePrice: 0, saleCosts: 0 });

    signIn(alice);
    const res = await apartment.PATCH(req('PATCH', { saleDate: '2025-06-15', salePrice: 185000, saleCosts: 4650.5 }), ctx({ id }));

    expect(res.status).toBe(200);
    expect((await view(alice, id)).settings).toMatchObject({ saleDate: '2025-06-15', salePrice: 185000, saleCosts: 4650.5 });
  });

  it('can be taken back by clearing the date', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    await apartment.PATCH(req('PATCH', { saleDate: '2025-06-15', salePrice: 185000 }), ctx({ id }));
    await apartment.PATCH(req('PATCH', { saleDate: '', salePrice: 0 }), ctx({ id }));

    expect((await view(alice, id)).settings).toMatchObject({ saleDate: '', salePrice: 0 });
  });

  it('refuses a day that does not exist and amounts below zero', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const patch = (body: unknown) => apartment.PATCH(req('PATCH', body), ctx({ id }));

    const refused = await Promise.all([patch({ saleDate: '2025-02-30' }), patch({ salePrice: -1 }), patch({ saleCosts: -1 })]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400]);
  });
});
