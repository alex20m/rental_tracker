import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
import * as checklist from '@/app/api/apartments/[id]/checklist/route';
import * as invites from '@/app/api/apartments/[id]/invites/route';
import type { ApartmentView } from '@/lib/domain/types';
import { testDb, type TestDb } from './support/testDb';

const alice: Session = { userId: 'usr_alice', name: 'Alice Aalto', email: 'alice@example.test', emailVerified: true };
const bob: Session = { userId: 'usr_bob', name: 'Bob Berg', email: 'bob@example.test', emailVerified: true };
const carol: Session = { userId: 'usr_carol', name: 'Carol Cook', email: 'carol@example.test', emailVerified: true };

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

/** Alice owns it with Bob, who accepted an invitation, the way owners really get to share an apartment. */
async function sharedApartment(): Promise<string> {
  const id = await createApartment(alice);
  await invites.POST(req('POST', { email: bob.email, sharePct: 50 }), ctx({ id }));
  signIn(bob);
  // Bob joins by opening the app: any pending invitation for his email becomes ownership.
  await apartments.GET(req('GET'));
  return id;
}

const view = async (id: string) => (await (await apartment.GET(req('GET'), ctx({ id }))).json()) as ApartmentView;
const save = (id: string, items: unknown) => checklist.PUT(req('PUT', { items }), ctx({ id }));

const PLUMBER = { text: 'Call the plumber', done: false };
const INSURANCE = { text: 'Renew the insurance', done: true };

describe('the checklist route', () => {
  it('answers 401 to anyone signed out and stores nothing', async () => {
    const id = await createApartment(alice);
    signIn(null);

    expect((await save(id, [PLUMBER])).status).toBe(401);

    expect(await db.query('select 1 from apartments where checklist <> $1', [''])).toEqual([]);
  });

  it('starts empty and keeps the items its owner saves, in order, with their ticks', async () => {
    const id = await createApartment(alice);
    expect((await view(id)).checklist).toEqual([]);

    const res = await save(id, [PLUMBER, INSURANCE]);

    expect(res.status).toBe(200);
    expect((await view(id)).checklist).toEqual([PLUMBER, INSURANCE]);
  });

  it('replaces the whole list each time, and clears it when saved empty', async () => {
    const id = await createApartment(alice);
    await save(id, [PLUMBER]);
    await save(id, [{ ...PLUMBER, done: true }]);
    expect((await view(id)).checklist).toEqual([{ text: 'Call the plumber', done: true }]);

    await save(id, []);

    expect((await view(id)).checklist).toEqual([]);
  });

  it('is shared: a co-owner sees the owner’s items and their ticks show for the owner', async () => {
    const id = await sharedApartment();
    signIn(alice);
    await save(id, [PLUMBER]);

    signIn(bob);
    expect((await view(id)).checklist).toEqual([PLUMBER]);
    expect((await save(id, [{ ...PLUMBER, done: true }])).status).toBe(200);

    signIn(alice);
    expect((await view(id)).checklist).toEqual([{ text: 'Call the plumber', done: true }]);
  });

  it('is per apartment: another apartment of the same owner has its own', async () => {
    const first = await createApartment(alice);
    const second = await createApartment(alice);

    await save(first, [PLUMBER]);

    expect((await view(second)).checklist).toEqual([]);
  });

  it('answers 404 to someone who does not own the apartment, and leaves the list alone', async () => {
    const id = await createApartment(alice);
    await save(id, [PLUMBER]);
    signIn(carol);

    expect((await save(id, [INSURANCE])).status).toBe(404);

    signIn(alice);
    expect((await view(id)).checklist).toEqual([PLUMBER]);
  });

  it('answers 404 for an id that is not a uuid', async () => {
    signIn(alice);

    expect((await save('not-a-uuid', [PLUMBER])).status).toBe(404);
  });

  it('trims an item’s text', async () => {
    const id = await createApartment(alice);

    await save(id, [{ text: '  Call the plumber  ', done: false }]);

    expect((await view(id)).checklist).toEqual([PLUMBER]);
  });

  it('refuses items that are not a list of a text and a tick, and lists that are too long', async () => {
    const id = await createApartment(alice);
    await save(id, [PLUMBER]);

    const refused = await Promise.all([
      save(id, 'Call the plumber'),
      save(id, [{ text: 'No tick' }]),
      save(id, [{ text: '   ', done: false }]),
      save(id, [{ text: 'Two\nlines', done: false }]),
      save(id, [{ text: 'x'.repeat(191), done: false }]),
      save(id, [{ ...PLUMBER, extra: 1 }]),
      save(id, Array.from({ length: 101 }, (_, i) => ({ text: `Item ${i}`, done: false }))),
      checklist.PUT(req('PUT', { items: [], extra: 1 }), ctx({ id })),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 400, 400]);
    expect((await view(id)).checklist).toEqual([PLUMBER]);
  });

  it('accepts the longest list allowed, every item at its longest', async () => {
    const id = await createApartment(alice);
    const longest = Array.from({ length: 100 }, (_, i) => ({ text: String(i).padEnd(190, 'x'), done: i % 2 === 0 }));

    expect((await save(id, longest)).status).toBe(200);

    expect((await view(id)).checklist).toEqual(longest);
  });
});
