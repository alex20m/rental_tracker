import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAuth, setAuthProvider, type Session } from '@/lib/auth';
import { setQueryableForTesting } from '@/lib/db';
import * as apartments from '@/app/api/apartments/route';
import * as apartment from '@/app/api/apartments/[id]/route';
import * as rents from '@/app/api/apartments/[id]/rents/[month]/route';
import * as costs from '@/app/api/apartments/[id]/costs/route';
import * as cost from '@/app/api/apartments/[id]/costs/[costId]/route';
import * as acquisitions from '@/app/api/apartments/[id]/acquisition/route';
import * as acquisition from '@/app/api/apartments/[id]/acquisition/[acquisitionId]/route';
import * as receipt from '@/app/api/apartments/[id]/costs/[costId]/receipt/route';
import * as invites from '@/app/api/apartments/[id]/invites/route';
import * as invite from '@/app/api/apartments/[id]/invites/[inviteId]/route';
import * as shares from '@/app/api/apartments/[id]/shares/route';
import * as owners from '@/app/api/apartments/[id]/owners/[userId]/route';
import * as me from '@/app/api/me/route';
import { setMailerForTesting } from '@/lib/mail';
import { testDb, type TestDb } from './support/testDb';

const alice: Session = { userId: 'usr_alice', name: 'Alice Aalto', email: 'alice@example.test', emailVerified: true };
const bob: Session = { userId: 'usr_bob', name: 'Bob Berg', email: 'bob@example.test', emailVerified: true };
const bobUnverified: Session = { ...bob, emailVerified: false };

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

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function createApartment(as: Session, name = 'Flat'): Promise<string> {
  signIn(as);
  const res = await apartments.POST(req('POST', { name }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function portfolioOf(as: Session) {
  signIn(as);
  return (await (await apartments.GET(req('GET'))).json()) as {
    apartments: { id: string; name: string; mySharePct: number }[];
    emailVerified: boolean;
  };
}

describe('every route, signed out', () => {
  it('answers 401 and changes nothing', async () => {
    const id = await createApartment(alice);
    signIn(null);
    const p = ctx({ id, month: '2025-01', costId: id, acquisitionId: id, inviteId: id, userId: alice.userId });
    const acquired = { date: '2025-01-01', kind: 'other', description: '', amount: 1 };

    const responses = await Promise.all([
      apartments.GET(req('GET')),
      apartments.POST(req('POST', { name: 'x' })),
      apartment.GET(req('GET'), p),
      apartment.PATCH(req('PATCH', { name: 'Taken' }), p),
      apartment.DELETE(req('DELETE'), p),
      rents.PUT(req('PUT', { status: 'vacant', amount: 0, receivedDate: '', note: '' }), p),
      rents.DELETE(req('DELETE'), p),
      costs.POST(req('POST', { date: '2025-01-01', category: 'other', description: '', amount: 1 }), p),
      cost.PUT(req('PUT', { date: '2025-01-01', category: 'other', description: '', amount: 1 }), p),
      cost.DELETE(req('DELETE'), p),
      acquisitions.POST(req('POST', acquired), p),
      acquisition.PUT(req('PUT', acquired), p),
      acquisition.DELETE(req('DELETE'), p),
      receipt.GET(req('GET'), p),
      receipt.PUT(req('PUT', { dataUrl: 'data:image/png;base64,AAAA' }), p),
      receipt.DELETE(req('DELETE'), p),
      invites.POST(req('POST', { email: 'eve@example.test', sharePct: 50 }), p),
      invite.DELETE(req('DELETE'), p),
      shares.PUT(req('PUT', { owners: [], invites: [] }), p),
      owners.DELETE(req('DELETE'), p),
      me.DELETE(req('DELETE')),
    ]);

    expect(responses.map((r) => r.status)).toEqual(responses.map(() => 401));
    const [row] = await db.query<{ name: string; n: number }>(
      'select name, (select count(*)::int from apartments) as n from apartments',
    );
    expect(row).toEqual({ name: 'Flat', n: 1 });
  });
});

describe('an apartment someone else owns', () => {
  it('looks exactly like one that does not exist', async () => {
    const id = await createApartment(alice);
    signIn(bob);

    const theirs = await apartment.GET(req('GET'), ctx({ id }));
    const missing = await apartment.GET(req('GET'), ctx({ id: '00000000-0000-4000-8000-000000000000' }));

    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toEqual(await missing.json());
  });
});

describe('the invite email', () => {
  it('is sent to the invitee with the apartment name, and the response says so', async () => {
    const sentMail: unknown[] = [];
    setMailerForTesting(async (mail) => { sentMail.push(mail); return 'sent'; });
    try {
      const id = await createApartment(alice, 'Harbour Flat');
      const res = await invites.POST(req('POST', { email: 'BOB@example.test', sharePct: 25 }), ctx({ id }));
      expect(res.status).toBe(201);
      expect(((await res.json()) as { emailSent: boolean }).emailSent).toBe(true);
      expect(sentMail).toEqual([
        { to: 'bob@example.test', inviterEmail: 'alice@example.test', apartmentName: 'Harbour Flat', sharePct: 25 },
      ]);
    } finally {
      setMailerForTesting(undefined);
    }
  });

  it('still creates the invite when sending fails, and says it was not emailed', async () => {
    setMailerForTesting(async () => 'failed');
    try {
      const id = await createApartment(alice);
      const res = await invites.POST(req('POST', { email: 'bob@example.test', sharePct: 25 }), ctx({ id }));
      expect(res.status).toBe(201);
      expect(((await res.json()) as { emailSent: boolean }).emailSent).toBe(false);
      expect(await portfolioOf(bob)).toMatchObject({ apartments: [{ mySharePct: 25 }] });
    } finally {
      setMailerForTesting(undefined);
    }
  });

  it('is not sent when the invite is refused', async () => {
    const sentMail: unknown[] = [];
    setMailerForTesting(async (mail) => { sentMail.push(mail); return 'sent'; });
    try {
      const id = await createApartment(alice);
      const res = await invites.POST(req('POST', { email: 'alice@example.test', sharePct: 25 }), ctx({ id }));
      expect(res.status).toBe(409);
      expect(sentMail).toEqual([]);
    } finally {
      setMailerForTesting(undefined);
    }
  });
});

describe('sharing through the API', () => {
  it('gives the shared apartment to the invitee once their email is verified, and nothing else', async () => {
    const shared = await createApartment(alice, 'Shared');
    await createApartment(alice, 'Private');
    signIn(alice);
    const sent = await invites.POST(req('POST', { email: 'BOB@example.test ', sharePct: 25 }), ctx({ id: shared }));
    expect(sent.status).toBe(201);

    // Signed up with Alice's chosen address but not yet proved it: nothing.
    const before = await portfolioOf(bobUnverified);
    expect(before).toEqual({ apartments: [], emailVerified: false });

    const after = await portfolioOf(bob);
    expect(after.apartments.map((a) => [a.name, a.mySharePct])).toEqual([['Shared', 25]]);
  });

  it('refuses an invite that is not an email or not a share', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const statuses = await Promise.all(
      [
        { email: 'not-an-email', sharePct: 10 },
        { email: 'bob@example.test', sharePct: 0 },
        { email: 'bob@example.test', sharePct: 100.5 },
        { email: 'bob@example.test', sharePct: 10.001 },
        { email: 'bob@example.test' },
      ].map(async (body) => (await invites.POST(req('POST', body), ctx({ id }))).status),
    );

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    expect(await db.query('select * from apartment_invites')).toEqual([]);
  });

  it('says why an invite for more than your share is refused', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    await invites.POST(req('POST', { email: 'bob@example.test', sharePct: 80 }), ctx({ id }));

    const res = await invites.POST(req('POST', { email: 'carol@example.test', sharePct: 30 }), ctx({ id }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You can't give away more than your own share." });
  });

  it('refuses shares that do not add up to 100 %', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const res = await shares.PUT(req('PUT', { owners: [{ userId: alice.userId, sharePct: 99 }], invites: [] }), ctx({ id }));

    expect(res.status).toBe(400);
  });

  it('will not delete an apartment out from under its co-owners', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    await invites.POST(req('POST', { email: 'bob@example.test', sharePct: 50 }), ctx({ id }));
    await portfolioOf(bob);

    signIn(alice);
    const res = await apartment.DELETE(req('DELETE'), ctx({ id }));

    expect(res.status).toBe(409);
    expect((await portfolioOf(bob)).apartments).toHaveLength(1);
  });
});

describe('the ledger through the API', () => {
  it('refuses a malformed month, a paid month without its date, and a body that is not JSON', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const badMonth = await rents.PUT(
      req('PUT', { status: 'vacant', amount: 0, receivedDate: '', note: '' }),
      ctx({ id, month: '2025-13' }),
    );
    const noDate = await rents.PUT(
      req('PUT', { status: 'paid', amount: 700, receivedDate: '', note: '' }),
      ctx({ id, month: '2025-01' }),
    );
    const notJson = await rents.PUT(req('PUT', '{oops'), ctx({ id, month: '2025-01' }));

    expect([badMonth.status, noDate.status, notJson.status]).toEqual([400, 400, 400]);
    expect(await db.query('select * from rents')).toEqual([]);
  });

  it('refuses a cost on a day that does not exist', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const res = await costs.POST(
      req('POST', { date: '2025-02-30', category: 'repairs', description: '', amount: 10 }),
      ctx({ id }),
    );

    expect(res.status).toBe(400);
  });

  it('refuses rent and costs for a month that has not started yet, but accepts the current month', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const now = new Date();
    const key = (offset: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      return d.toISOString().slice(0, 7);
    };
    const vacant = { status: 'vacant', amount: 0, receivedDate: '', note: '' };
    const costOn = (date: string) => ({ date, category: 'repairs', description: '', amount: 10 });

    const futureRent = await rents.PUT(req('PUT', vacant), ctx({ id, month: key(2) }));
    const futureCost = await costs.POST(req('POST', costOn(`${key(2)}-01`)), ctx({ id }));
    const currentRent = await rents.PUT(req('PUT', vacant), ctx({ id, month: key(0) }));
    const currentCost = await costs.POST(req('POST', costOn(`${key(0)}-01`)), ctx({ id }));
    const existing = await costs.POST(req('POST', costOn('2025-02-10')), ctx({ id }));
    const { id: costId } = (await existing.json()) as { id: string };
    const moveToFuture = await cost.PUT(req('PUT', costOn(`${key(2)}-01`)), ctx({ id, costId }));

    expect([futureRent.status, futureCost.status, moveToFuture.status]).toEqual([400, 400, 400]);
    expect([currentRent.status, currentCost.status]).toEqual([200, 201]);
    expect(await db.query('select month from rents')).toHaveLength(1);
    expect(await db.query('select date from costs')).toHaveLength(2);
  });

  it('refuses to spread a cost over more than the ten years the law allows', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const tooLong = await costs.POST(
      req('POST', { date: '2025-02-01', category: 'improvement', description: '', amount: 10, spreadYears: 11 }),
      ctx({ id }),
    );
    const fraction = await costs.POST(
      req('POST', { date: '2025-02-01', category: 'improvement', description: '', amount: 10, spreadYears: 2.5 }),
      ctx({ id }),
    );
    const ok = await costs.POST(
      req('POST', { date: '2025-02-01', category: 'improvement', description: '', amount: 10, spreadYears: 10 }),
      ctx({ id }),
    );

    expect([tooLong.status, fraction.status, ok.status]).toEqual([400, 400, 201]);
  });

  it('refuses settings the rules do not allow, and accepts the ones they do', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const patch = (body: unknown) => apartment.PATCH(req('PATCH', body), ctx({ id }));

    const refused = await Promise.all([
      patch({ letSharePct: 0 }),
      patch({ letSharePct: 100.5 }),
      patch({ furnishing: 'rented' }),
      patch({ roomClass: 'huge' }),
      patch({ buildingKind: 'castle' }),
      patch({ depreciationFromYear: 1999 }),
      patch({ depreciationFromYear: 2025.5 }),
      patch({ purchaseCosts: -1 }),
      patch({ belowMarketRent: 'yes' }),
    ]);
    const accepted = await patch({
      letSharePct: 62.5,
      furnishing: 'flat',
      roomClass: 'studio',
      buildingKind: 'commercial',
      depreciationFromYear: 2025,
      purchaseCosts: 6000.5,
      belowMarketRent: true,
    });

    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 400, 400, 400]);
    expect(accepted.status).toBe(200);
  });

  it('refuses a property type it does not know', async () => {
    const id = await createApartment(alice);
    signIn(alice);

    const res = await apartment.PATCH(req('PATCH', { propertyType: 'castle' }), ctx({ id }));

    expect(res.status).toBe(400);
  });

  it('serves a receipt back as an image only to owners', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const created = await costs.POST(
      req('POST', { date: '2025-02-10', category: 'repairs', description: 'Tap', amount: 10 }),
      ctx({ id }),
    );
    const { id: costId } = (await created.json()) as { id: string };
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const put = await receipt.PUT(req('PUT', { dataUrl: `data:image/png;base64,${png.toString('base64')}` }), ctx({ id, costId }));
    expect(put.status).toBe(200);

    const got = await receipt.GET(req('GET'), ctx({ id, costId }));
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await got.arrayBuffer())).toEqual(png);

    signIn(bob);
    expect((await receipt.GET(req('GET'), ctx({ id, costId }))).status).toBe(404);
  });

  it('refuses a receipt that is not a raster image', async () => {
    const id = await createApartment(alice);
    signIn(alice);
    const created = await costs.POST(
      req('POST', { date: '2025-02-10', category: 'repairs', description: '', amount: 10 }),
      ctx({ id }),
    );
    const { id: costId } = (await created.json()) as { id: string };
    const svg = Buffer.from('<svg onload="alert(1)"/>').toString('base64');

    const res = await receipt.PUT(req('PUT', { dataUrl: `data:image/svg+xml;base64,${svg}` }), ctx({ id, costId }));

    expect(res.status).toBe(400);
    expect(await db.query('select * from receipts')).toEqual([]);
  });
});

describe('deleting your account through the API', () => {
  it('removes the caller’s data and leaves everyone else’s', async () => {
    const mine = await createApartment(alice, 'Mine');
    const theirs = await createApartment(bob, 'Theirs');

    signIn(alice);
    const res = await me.DELETE(req('DELETE'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await portfolioOf(alice)).apartments).toEqual([]);
    expect((await portfolioOf(bob)).apartments.map((a) => a.id)).toEqual([theirs]);
    signIn(alice);
    expect((await apartment.GET(req('GET'), ctx({ id: mine }))).status).toBe(404);
  });
});
