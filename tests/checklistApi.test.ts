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
const save = (id: string, text: unknown) => checklist.PUT(req('PUT', { text }), ctx({ id }));

describe('the checklist route', () => {
  it('answers 401 to anyone signed out and stores nothing', async () => {
    const id = await createApartment(alice);
    signIn(null);

    expect((await save(id, '- [ ] Sneaky')).status).toBe(401);

    expect(await db.query('select 1 from apartments where checklist <> $1', [''])).toEqual([]);
  });

  it('starts empty and keeps what its owner writes, with the apartment', async () => {
    const id = await createApartment(alice);
    expect((await view(id)).checklist).toBe('');

    const res = await save(id, 'Keys in the drawer\n- [ ] Call the plumber\n- [x] Renew the insurance');

    expect(res.status).toBe(200);
    expect((await view(id)).checklist).toBe('Keys in the drawer\n- [ ] Call the plumber\n- [x] Renew the insurance');
  });

  it('replaces the whole text each time, and clears it when saved empty', async () => {
    const id = await createApartment(alice);
    await save(id, '- [ ] One');
    await save(id, '- [x] One');
    expect((await view(id)).checklist).toBe('- [x] One');

    await save(id, '');

    expect((await view(id)).checklist).toBe('');
  });

  it('is shared: a co-owner sees the owner’s checklist and their ticks show for the owner', async () => {
    const id = await sharedApartment();
    signIn(alice);
    await save(id, '- [ ] Call the plumber');

    signIn(bob);
    expect((await view(id)).checklist).toBe('- [ ] Call the plumber');
    expect((await save(id, '- [x] Call the plumber')).status).toBe(200);

    signIn(alice);
    expect((await view(id)).checklist).toBe('- [x] Call the plumber');
  });

  it('is per apartment: another apartment of the same owner has its own', async () => {
    const first = await createApartment(alice);
    const second = await createApartment(alice);

    await save(first, '- [ ] Only here');

    expect((await view(second)).checklist).toBe('');
  });

  it('answers 404 to someone who does not own the apartment, and leaves the text alone', async () => {
    const id = await createApartment(alice);
    await save(id, '- [ ] Mine');
    signIn(carol);

    expect((await save(id, 'overwritten')).status).toBe(404);

    signIn(alice);
    expect((await view(id)).checklist).toBe('- [ ] Mine');
  });

  it('answers 404 for an id that is not a uuid', async () => {
    signIn(alice);

    expect((await save('not-a-uuid', 'x')).status).toBe(404);
  });

  it('refuses a body that is not exactly a string called text, or that is too long', async () => {
    const id = await createApartment(alice);
    await save(id, '- [ ] Kept');

    const refused = await Promise.all([
      save(id, 42),
      save(id, null),
      save(id, 'x'.repeat(20_001)),
      checklist.PUT(req('PUT', {}), ctx({ id })),
      checklist.PUT(req('PUT', { text: 'ok', extra: 1 }), ctx({ id })),
    ]);

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await view(id)).checklist).toBe('- [ ] Kept');
  });

  it('accepts exactly the longest text allowed', async () => {
    const id = await createApartment(alice);

    expect((await save(id, 'x'.repeat(20_000))).status).toBe(200);
  });

  it('keeps a line’s leading spaces and a trailing newline exactly as typed', async () => {
    const id = await createApartment(alice);

    await save(id, '  - [ ] Indented\n');

    expect((await view(id)).checklist).toBe('  - [ ] Indented\n');
  });
});
