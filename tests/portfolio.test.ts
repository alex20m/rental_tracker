import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { portfolio, type Actor, type Portfolio } from '@/lib/portfolio';
import { defaultSettings } from '@/lib/domain/types';
import { testDb, type TestDb } from './support/testDb';

const alice: Actor = { userId: 'usr_alice', email: 'alice@example.test' };
const bob: Actor = { userId: 'usr_bob', email: 'bob@example.test' };
const carol: Actor = { userId: 'usr_carol', email: 'carol@example.test' };

let db: TestDb;
let p: Portfolio;

beforeAll(async () => {
  db = await testDb();
  p = portfolio(db);
});

beforeEach(async () => {
  await db.reset();
});

afterAll(async () => {
  await db.close();
});

const flat = (name: string) => ({ ...defaultSettings, name });

async function sharesOf(viewer: Actor, apartmentId: string) {
  const a = await p.get(viewer.userId, apartmentId);
  return {
    owners: Object.fromEntries(a!.owners.map((o) => [o.email, o.sharePct])),
    invites: Object.fromEntries(a!.invites.map((i) => [i.email, i.sharePct])),
  };
}

describe('a portfolio', () => {
  it('starts empty', async () => {
    expect(await p.list(alice.userId)).toEqual([]);
  });

  it('makes the creator the sole owner of a new apartment, at 100%', async () => {
    const id = await p.create(alice, flat('Kauppakatu 1'));

    expect(await p.list(alice.userId)).toEqual([
      { id, name: 'Kauppakatu 1', address: '', mySharePct: 100, ownerCount: 1 },
    ]);
    expect(await sharesOf(alice, id)).toEqual({ owners: { 'alice@example.test': 100 }, invites: {} });
  });

  it('holds several apartments per owner, each listed once', async () => {
    const one = await p.create(alice, flat('One'));
    const two = await p.create(alice, flat('Two'));

    expect((await p.list(alice.userId)).map((a) => a.id)).toEqual([one, two]);
  });

  it("never lists another user's apartments", async () => {
    await p.create(alice, flat('Alice only'));
    const bobs = await p.create(bob, flat('Bob only'));

    expect((await p.list(bob.userId)).map((a) => a.id)).toEqual([bobs]);
  });

  it('round-trips the apartment settings', async () => {
    const settings = {
      ...defaultSettings,
      name: 'Rantatie 5',
      address: 'Rantatie 5 A 3, 65100 Vaasa',
      housingCompany: 'As Oy Ranta',
      propertyType: 'property' as const,
      financingChargeDeductible: true,
      purchaseDate: '2020-05-04',
      purchasePrice: 95000.5,
      buildingSharePct: 80,
      depreciationRate: 2.5,
      depreciationPrior: 1234.56,
      useDepreciation: true,
      monthlyRent: 780,
    };
    const id = await p.create(alice, settings);

    expect((await p.get(alice.userId, id))!.settings).toEqual(settings);
  });

  it('keeps over how many years an improvement is spread, and accepts every new category', async () => {
    const id = await p.create(alice, flat('Spread'));
    const costId = await p.createCost(alice.userId, id, {
      date: '2025-05-01',
      category: 'improvement',
      description: 'Balcony glazing',
      amount: 3000,
      spreadYears: 6,
    });
    for (const category of ['water_charge', 'furniture', 'travel', 'property_tax'] as const) {
      await p.createCost(alice.userId, id, { date: '2025-06-01', category, description: category, amount: 1 });
    }
    expect((await p.get(alice.userId, id))!.costs[0]).toMatchObject({ id: costId, spreadYears: 6 });

    await p.updateCost(alice.userId, id, costId!, {
      date: '2025-05-01',
      category: 'improvement',
      description: 'Balcony glazing',
      amount: 3000,
      spreadYears: 10,
    });
    const costs = (await p.get(alice.userId, id))!.costs;
    expect(costs[0]!.spreadYears).toBe(10);
    // Left out, it is the legal maximum.
    expect(costs.slice(1).map((c) => [c.category, c.spreadYears])).toEqual([
      ['water_charge', 10],
      ['furniture', 10],
      ['travel', 10],
      ['property_tax', 10],
    ]);
  });
});

describe('who can reach an apartment', () => {
  let id: string;
  beforeEach(async () => {
    id = await p.create(alice, flat('Private'));
  });

  it('hides it from someone who does not own it', async () => {
    expect(await p.get(bob.userId, id)).toBeNull();
  });

  it('refuses every change from someone who does not own it', async () => {
    const costId = await p.createCost(alice.userId, id, {
      date: '2025-01-01',
      category: 'repairs',
      description: 'tap',
      amount: 10,
    });

    expect(await p.updateSettings(bob.userId, id, { name: 'Mine now' })).toBe(false);
    expect(await p.putRent(bob.userId, id, '2025-01', { status: 'vacant', amount: 0, receivedDate: '', note: '' })).toBe(false);
    expect(await p.createCost(bob.userId, id, { date: '2025-01-01', category: 'other', description: '', amount: 1 })).toBeNull();
    expect(await p.updateCost(bob.userId, id, costId!, { date: '2025-01-01', category: 'other', description: 'x', amount: 1 })).toBe(false);
    expect(await p.deleteCost(bob.userId, id, costId!)).toBe(false);
    expect(await p.putReceipt(bob.userId, id, costId!, { contentType: 'image/jpeg', base64: 'AAAA' })).toBe(false);
    expect(await p.invite(bob, id, { email: 'eve@example.test', sharePct: 10 })).toEqual({ ok: false, reason: 'not_found' });
    expect(await p.remove(bob.userId, id)).toBe('not_found');

    const a = await p.get(alice.userId, id);
    expect(a!.settings.name).toBe('Private');
    expect(a!.rents).toEqual([]);
    expect(a!.costs.map((c) => c.description)).toEqual(['tap']);
    expect(a!.costs[0]!.hasReceipt).toBe(false);
    expect(a!.invites).toEqual([]);
  });

  it("will not read another apartment's receipt through an apartment you own", async () => {
    // Bob owns an apartment of his own, and knows the id of one of Alice's costs.
    const bobs = await p.create(bob, flat('Bob'));
    const costId = await p.createCost(alice.userId, id, { date: '2025-01-01', category: 'repairs', description: '', amount: 5 });
    await p.putReceipt(alice.userId, id, costId!, { contentType: 'image/jpeg', base64: 'AQID' });

    expect(await p.getReceipt(bob.userId, bobs, costId!)).toBeNull();
    expect(await p.updateCost(bob.userId, bobs, costId!, { date: '2025-01-01', category: 'other', description: 'x', amount: 1 })).toBe(false);
    expect(await p.deleteCost(bob.userId, bobs, costId!)).toBe(false);
    expect((await p.get(alice.userId, id))!.costs).toHaveLength(1);
  });

  it('treats an id that is not a uuid as not found rather than failing', async () => {
    expect(await p.get(alice.userId, 'not-a-uuid')).toBeNull();
    expect(await p.deleteCost(alice.userId, id, '1; drop table costs')).toBe(false);
  });
});

describe('sharing an apartment by email', () => {
  let shared: string;
  let other: string;
  beforeEach(async () => {
    shared = await p.create(alice, flat('Shared'));
    other = await p.create(alice, flat('Not shared'));
  });

  it("moves the invited share out of the inviter's own share", async () => {
    const result = await p.invite(alice, shared, { email: 'Bob@Example.test', sharePct: 30 });

    expect(result.ok).toBe(true);
    expect(await sharesOf(alice, shared)).toEqual({
      owners: { 'alice@example.test': 70 },
      invites: { 'bob@example.test': 30 },
    });
  });

  it('gives the invitee nothing until they sign in with that email', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 30 });

    expect(await p.list(bob.userId)).toEqual([]);
    expect(await p.get(bob.userId, shared)).toBeNull();
  });

  it('gives the invitee that one apartment, and none of the others', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 30 });

    expect(await p.claimInvites(bob)).toBe(1);

    expect(await p.list(bob.userId)).toEqual([
      { id: shared, name: 'Shared', address: '', mySharePct: 30, ownerCount: 2 },
    ]);
    expect(await p.get(bob.userId, other)).toBeNull();
    expect(await sharesOf(bob, shared)).toEqual({
      owners: { 'alice@example.test': 70, 'bob@example.test': 30 },
      invites: {},
    });
  });

  it('matches the email regardless of case', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 10 });

    expect(await p.claimInvites({ userId: bob.userId, email: 'BOB@example.TEST' })).toBe(1);
    expect((await p.list(bob.userId)).map((a) => a.id)).toEqual([shared]);
  });

  it('gives nothing to someone signing in with a different email', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 10 });

    expect(await p.claimInvites(carol)).toBe(0);
    expect(await p.list(carol.userId)).toEqual([]);
  });

  it('claims an invite only once', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 10 });
    await p.claimInvites(bob);

    expect(await p.claimInvites(bob)).toBe(0);
    expect((await p.list(bob.userId))[0]!.mySharePct).toBe(10);
  });

  it('refuses to give away more than the inviter owns, and changes nothing', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 60 });

    expect(await p.invite(alice, shared, { email: 'carol@example.test', sharePct: 41 })).toEqual({
      ok: false,
      reason: 'insufficient_share',
    });
    expect(await sharesOf(alice, shared)).toEqual({
      owners: { 'alice@example.test': 40 },
      invites: { 'bob@example.test': 60 },
    });
  });

  it('lets an owner give away their whole share', async () => {
    const result = await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 100 });

    expect(result.ok).toBe(true);
    expect((await sharesOf(alice, shared)).owners).toEqual({ 'alice@example.test': 0 });
  });

  it('refuses to invite yourself, an existing owner, or the same email twice', async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 10 });

    expect(await p.invite(alice, shared, { email: 'ALICE@example.test', sharePct: 10 })).toEqual({ ok: false, reason: 'self' });
    expect(await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 10 })).toEqual({
      ok: false,
      reason: 'already_invited',
    });
    await p.claimInvites(bob);
    expect(await p.invite(bob, shared, { email: 'alice@example.test', sharePct: 1 })).toEqual({
      ok: false,
      reason: 'already_owner',
    });
    expect((await sharesOf(alice, shared)).owners).toEqual({ 'alice@example.test': 90, 'bob@example.test': 10 });
  });

  it("returns a withdrawn invite's share to whoever sent it", async () => {
    await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 50 });
    await p.claimInvites(bob);
    const sent = await p.invite(bob, shared, { email: 'carol@example.test', sharePct: 20 });
    if (!sent.ok) throw new Error('invite failed');

    // Alice withdraws the invite Bob sent; the 20% goes back to Bob.
    expect(await p.revokeInvite(alice.userId, shared, sent.id)).toBe(true);

    expect(await sharesOf(alice, shared)).toEqual({
      owners: { 'alice@example.test': 50, 'bob@example.test': 50 },
      invites: {},
    });
    expect(await p.claimInvites(carol)).toBe(0);
  });

  it('will not withdraw an invite on an apartment you do not own', async () => {
    const sent = await p.invite(alice, shared, { email: 'bob@example.test', sharePct: 50 });
    if (!sent.ok) throw new Error('invite failed');

    expect(await p.revokeInvite(carol.userId, shared, sent.id)).toBe(false);
    expect((await sharesOf(alice, shared)).invites).toEqual({ 'bob@example.test': 50 });
  });
});

describe('setting ownership shares', () => {
  let id: string;
  let inviteId: string;
  beforeEach(async () => {
    id = await p.create(alice, flat('Co-owned'));
    await p.invite(alice, id, { email: 'bob@example.test', sharePct: 50 });
    await p.claimInvites(bob);
    const sent = await p.invite(alice, id, { email: 'carol@example.test', sharePct: 10 });
    if (!sent.ok) throw new Error('invite failed');
    inviteId = sent.id;
  });

  it('sets every owner and pending invite at once', async () => {
    const result = await p.setShares(bob.userId, id, {
      owners: [
        { userId: alice.userId, sharePct: 33.33 },
        { userId: bob.userId, sharePct: 33.33 },
      ],
      invites: [{ id: inviteId, sharePct: 33.34 }],
    });

    expect(result).toBe('ok');
    expect(await sharesOf(alice, id)).toEqual({
      owners: { 'alice@example.test': 33.33, 'bob@example.test': 33.33 },
      invites: { 'carol@example.test': 33.34 },
    });
  });

  it('refuses shares that do not add up to exactly 100%', async () => {
    const result = await p.setShares(alice.userId, id, {
      owners: [
        { userId: alice.userId, sharePct: 50 },
        { userId: bob.userId, sharePct: 40 },
      ],
      invites: [{ id: inviteId, sharePct: 9.99 }],
    });

    expect(result).toBe('bad_total');
    expect((await sharesOf(alice, id)).owners).toEqual({ 'alice@example.test': 40, 'bob@example.test': 50 });
  });

  it('refuses an assignment that leaves somebody out', async () => {
    const result = await p.setShares(alice.userId, id, {
      owners: [
        { userId: alice.userId, sharePct: 50 },
        { userId: bob.userId, sharePct: 50 },
      ],
      invites: [],
    });

    expect(result).toBe('stale');
    expect((await sharesOf(alice, id)).invites).toEqual({ 'carol@example.test': 10 });
  });

  it('refuses an assignment that names somebody twice', async () => {
    const result = await p.setShares(alice.userId, id, {
      // Everyone is named, and the numbers add up to 100 — but only because
      // Alice is counted twice. Applied, the shares would total 70%.
      owners: [
        { userId: alice.userId, sharePct: 30 },
        { userId: alice.userId, sharePct: 30 },
        { userId: bob.userId, sharePct: 30 },
      ],
      invites: [{ id: inviteId, sharePct: 10 }],
    });

    expect(result).toBe('stale');
    expect((await sharesOf(alice, id)).owners).toEqual({ 'alice@example.test': 40, 'bob@example.test': 50 });
  });

  it('refuses someone who does not own the apartment', async () => {
    const result = await p.setShares(carol.userId, id, {
      owners: [
        { userId: alice.userId, sharePct: 0 },
        { userId: bob.userId, sharePct: 0 },
      ],
      invites: [{ id: inviteId, sharePct: 100 }],
    });

    expect(result).toBe('not_found');
  });
});

describe('leaving and deleting', () => {
  let id: string;
  beforeEach(async () => {
    id = await p.create(alice, flat('Co-owned'));
    await p.invite(alice, id, { email: 'bob@example.test', sharePct: 50 });
    await p.claimInvites(bob);
  });

  it('removes only an owner whose share has been given away first', async () => {
    expect(await p.removeOwner(alice.userId, id, bob.userId)).toBe('has_share');

    await p.setShares(alice.userId, id, {
      owners: [
        { userId: alice.userId, sharePct: 100 },
        { userId: bob.userId, sharePct: 0 },
      ],
      invites: [],
    });
    expect(await p.removeOwner(bob.userId, id, bob.userId)).toBe('ok');

    expect(await p.get(bob.userId, id)).toBeNull();
    expect(await p.list(bob.userId)).toEqual([]);
    expect((await sharesOf(alice, id)).owners).toEqual({ 'alice@example.test': 100 });
  });

  it('never removes the last owner', async () => {
    const solo = await p.create(carol, flat('Solo'));
    expect(await p.removeOwner(carol.userId, solo, carol.userId)).toBe('last_owner');
  });

  it('will not delete an apartment that has other owners', async () => {
    expect(await p.remove(alice.userId, id)).toBe('has_co_owners');
    expect(await p.get(bob.userId, id)).not.toBeNull();
  });

  it('deletes an apartment its only owner deletes, with everything in it', async () => {
    const solo = await p.create(carol, flat('Solo'));
    const costId = await p.createCost(carol.userId, solo, { date: '2025-01-01', category: 'repairs', description: '', amount: 5 });
    await p.putReceipt(carol.userId, solo, costId!, { contentType: 'image/jpeg', base64: 'AQID' });

    expect(await p.remove(carol.userId, solo)).toBe('deleted');

    expect(await p.list(carol.userId)).toEqual([]);
    expect(await db.query('select * from costs where apartment_id = $1', [solo])).toEqual([]);
    expect(await db.query('select * from receipts where cost_id = $1', [costId])).toEqual([]);
  });
});

describe("an apartment's ledger", () => {
  let id: string;
  beforeEach(async () => {
    id = await p.create(alice, flat('Ledger'));
  });

  it('keeps one rent entry per month, the latest save winning', async () => {
    await p.putRent(alice.userId, id, '2025-03', { status: 'unpaid', amount: 0, receivedDate: '', note: 'late' });
    await p.putRent(alice.userId, id, '2025-03', { status: 'paid', amount: 780, receivedDate: '2025-04-02', note: '' });

    expect((await p.get(alice.userId, id))!.rents).toEqual([
      { month: '2025-03', status: 'paid', amount: 780, receivedDate: '2025-04-02', note: '' },
    ]);
  });

  it('records no amount or received date for a month that was not paid', async () => {
    await p.putRent(alice.userId, id, '2025-04', { status: 'vacant', amount: 780, receivedDate: '2025-04-02', note: 'empty' });

    expect((await p.get(alice.userId, id))!.rents).toEqual([
      { month: '2025-04', status: 'vacant', amount: 0, receivedDate: '', note: 'empty' },
    ]);
  });

  it('deletes a rent entry', async () => {
    await p.putRent(alice.userId, id, '2025-04', { status: 'vacant', amount: 0, receivedDate: '', note: '' });
    await p.deleteRent(alice.userId, id, '2025-04');

    expect((await p.get(alice.userId, id))!.rents).toEqual([]);
  });

  it('adds, edits and deletes costs', async () => {
    const costId = await p.createCost(alice.userId, id, { date: '2025-02-10', category: 'insurance', description: 'Home', amount: 96 });
    await p.updateCost(alice.userId, id, costId!, { date: '2025-02-11', category: 'repairs', description: 'Tap', amount: 142.5 });

    expect((await p.get(alice.userId, id))!.costs).toEqual([
      { id: costId, date: '2025-02-11', category: 'repairs', description: 'Tap', amount: 142.5, spreadYears: 10, hasReceipt: false },
    ]);

    expect(await p.deleteCost(alice.userId, id, costId!)).toBe(true);
    expect((await p.get(alice.userId, id))!.costs).toEqual([]);
  });

  it('stores a receipt photo and returns it byte for byte', async () => {
    const costId = await p.createCost(alice.userId, id, { date: '2025-02-10', category: 'repairs', description: '', amount: 1 });
    // Long enough that Postgres would wrap its base64 output across lines.
    const base64 = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256)).toString('base64');

    await p.putReceipt(alice.userId, id, costId!, { contentType: 'image/png', base64 });

    expect(await p.getReceipt(alice.userId, id, costId!)).toEqual({ contentType: 'image/png', base64 });
    expect((await p.get(alice.userId, id))!.costs[0]!.hasReceipt).toBe(true);

    await p.deleteReceipt(alice.userId, id, costId!);
    expect(await p.getReceipt(alice.userId, id, costId!)).toBeNull();
    expect((await p.get(alice.userId, id))!.costs[0]!.hasReceipt).toBe(false);
  });

  it('lets a co-owner see and add to the same ledger', async () => {
    await p.invite(alice, id, { email: 'bob@example.test', sharePct: 50 });
    await p.claimInvites(bob);
    await p.createCost(bob.userId, id, { date: '2025-05-01', category: 'repairs', description: 'Bob fixed it', amount: 20 });

    expect((await p.get(alice.userId, id))!.costs.map((c) => c.description)).toEqual(['Bob fixed it']);
  });
});

describe('deleting an account', () => {
  it('deletes apartments the user owns alone, with their rents, costs and receipts', async () => {
    const id = await p.create(alice, flat('Solo'));
    await p.putRent(alice.userId, id, '2025-01', { status: 'vacant', amount: 0, receivedDate: '', note: '' });
    const costId = (await p.createCost(alice.userId, id, {
      date: '2025-01-05',
      category: 'repairs',
      description: 'Tap',
      amount: 40,
    }))!;
    await p.putReceipt(alice.userId, id, costId, { contentType: 'image/png', base64: 'AAAA' });

    await p.deleteAccount(alice);

    for (const table of ['apartments', 'apartment_owners', 'rents', 'costs', 'receipts']) {
      expect(await db.query(`select 1 from ${table}`), table).toEqual([]);
    }
  });

  it('hands a co-owned apartment, and the leaver’s share, to the remaining owner', async () => {
    const id = await p.create(alice, flat('Shared'));
    expect((await p.invite(alice, id, { email: bob.email, sharePct: 30 })).ok).toBe(true);
    await p.claimInvites(bob);

    await p.deleteAccount(bob);

    expect(await sharesOf(alice, id)).toEqual({ owners: { 'alice@example.test': 100 }, invites: {} });
    expect(await p.get(bob.userId, id)).toBeNull();
  });

  it('gives a leaver’s share to the co-owner holding the most, when there are several', async () => {
    const id = await p.create(alice, flat('Trio'));
    expect((await p.invite(alice, id, { email: bob.email, sharePct: 20 })).ok).toBe(true);
    expect((await p.invite(alice, id, { email: carol.email, sharePct: 30 })).ok).toBe(true);
    await p.claimInvites(bob);
    await p.claimInvites(carol);

    await p.deleteAccount(bob);

    expect(await sharesOf(alice, id)).toEqual({
      owners: { 'alice@example.test': 70, 'carol@example.test': 30 },
      invites: {},
    });
  });

  it('deletes an apartment whose only other claimant is an unclaimed invite', async () => {
    const id = await p.create(alice, flat('Pending'));
    expect((await p.invite(alice, id, { email: 'eve@example.test', sharePct: 40 })).ok).toBe(true);

    await p.deleteAccount(alice);

    expect(await db.query('select 1 from apartments')).toEqual([]);
    expect(await db.query('select 1 from apartment_invites')).toEqual([]);
  });

  it('removes invites addressed to the user, and nobody else’s data', async () => {
    const mine = await p.create(alice, flat('Mine'));
    const theirs = await p.create(bob, flat('Theirs'));
    expect((await p.invite(bob, theirs, { email: alice.email, sharePct: 10 })).ok).toBe(true);

    await p.deleteAccount(alice);

    expect(await p.get(bob.userId, theirs)).not.toBeNull();
    expect(await p.get(alice.userId, mine)).toBeNull();
    expect(await db.query('select 1 from apartment_invites')).toEqual([]);
  });

  it('does not need the retired user_profiles table, so that table can be dropped without breaking it', async () => {
    // Simulates the schema after the migration that drops it, which runs while
    // the previous deployment is still serving: this code must already cope.
    // (Renamed rather than dropped, so reset() still finds it for the next test.)
    await db.query('alter table user_profiles rename to user_profiles_gone');
    try {
      await p.create(alice, flat('Mine'));

      await expect(p.deleteAccount(alice)).resolves.toBeUndefined();

      expect(await db.query('select 1 from apartments')).toEqual([]);
    } finally {
      await db.query('alter table user_profiles_gone rename to user_profiles');
    }
  });

  it('removes the sign-in identity from the auth schema when it exists', async () => {
    await db.query('create schema neon_auth');
    await db.query('create table neon_auth."user" (id text primary key, email text)');
    await db.query(`insert into neon_auth."user" values ('usr_alice', 'a'), ('usr_bob', 'b')`);

    await p.deleteAccount(alice);

    expect(await db.query('select id from neon_auth."user"')).toEqual([{ id: 'usr_bob' }]);
    await db.query('drop schema neon_auth cascade');
  });

  it('succeeds for an account that has no data at all', async () => {
    await expect(p.deleteAccount(alice)).resolves.toBeUndefined();
  });
});
