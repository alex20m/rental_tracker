import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { portfolio, type Actor, type Portfolio } from '@/lib/portfolio';
import { defaultSettings } from '@/lib/domain/types';
import { RECURRING_CATEGORIES, nextMonth } from '@/lib/domain/recurring';
import { testDb, type TestDb } from './support/testDb';

const alice: Actor = { userId: 'usr_alice', email: 'alice@example.test' };
const bob: Actor = { userId: 'usr_bob', email: 'bob@example.test' };

let db: TestDb;
let now = new Date('2026-10-05T12:00:00Z');
let p: Portfolio;

beforeAll(async () => {
  db = await testDb();
  p = portfolio(db, () => now);
});

beforeEach(async () => {
  await db.reset();
  now = new Date('2026-10-05T12:00:00Z');
});

afterAll(async () => {
  await db.close();
});

const flat = () => p.create(alice, { ...defaultSettings, name: 'Flat' });
const charge = { kind: 'cost' as const, category: 'maintenance_charge' as const, description: 'Hoitovastike', amount: 150, dayOfMonth: 1 };

describe('nextMonth', () => {
  it('moves to the next month and rolls over the year', () => {
    expect(nextMonth('2026-09')).toBe('2026-10');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});

describe('which costs can repeat', () => {
  it('leaves out improvements and furniture, which are spread over years rather than paid monthly', () => {
    expect(RECURRING_CATEGORIES).toContain('maintenance_charge');
    expect(RECURRING_CATEGORIES).toContain('loan_interest');
    expect(RECURRING_CATEGORIES).not.toContain('improvement');
    expect(RECURRING_CATEGORIES).not.toContain('furniture');
  });
});

describe('recurring costs', () => {
  it('books a cost on the 1st of every month from the first month up to the current one', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-08' });

    const apt = (await p.get(alice.userId, id))!;

    expect(apt.costs.map((c) => [c.date, c.category, c.description, c.amount])).toEqual([
      ['2026-08-01', 'maintenance_charge', 'Hoitovastike', 150],
      ['2026-09-01', 'maintenance_charge', 'Hoitovastike', 150],
      ['2026-10-01', 'maintenance_charge', 'Hoitovastike', 150],
    ]);
  });

  it('books nothing before the first month has begun', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-11' });

    expect((await p.get(alice.userId, id))!.costs).toEqual([]);
  });

  it('books each month once however often the apartment is opened', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-09' });

    await p.get(alice.userId, id);
    await p.get(alice.userId, id);
    expect((await p.get(alice.userId, id))!.costs).toHaveLength(2);
  });

  it('books a new month when the calendar reaches it', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-10' });
    await p.get(alice.userId, id);

    now = new Date('2026-12-02T08:00:00Z');
    const apt = (await p.get(alice.userId, id))!;

    expect(apt.costs.map((c) => c.date)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('keeps a cost the user deleted deleted', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-09' });
    const [first] = (await p.get(alice.userId, id))!.costs;
    await p.deleteCost(alice.userId, id, first!.id);

    expect((await p.get(alice.userId, id))!.costs.map((c) => c.date)).toEqual(['2026-10-01']);
  });

  it('lists the entry with the month it books next', async () => {
    const id = await flat();
    const entryId = await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-09' });

    const apt = (await p.get(alice.userId, id))!;

    expect(apt.recurring).toEqual([
      { id: entryId, kind: 'cost', category: 'maintenance_charge', description: 'Hoitovastike', amount: 150, dayOfMonth: 1, nextMonth: '2026-11' },
    ]);
  });

  it('changes only the months not booked yet when the amount is edited', async () => {
    const id = await flat();
    const entryId = (await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-10' }))!;
    await p.get(alice.userId, id);

    expect(await p.updateRecurring(alice.userId, id, entryId, { category: 'insurance', description: 'Home', amount: 20, dayOfMonth: 1 })).toBe(true);
    now = new Date('2026-11-03T08:00:00Z');
    const apt = (await p.get(alice.userId, id))!;

    expect(apt.costs.map((c) => [c.date, c.category, c.amount])).toEqual([
      ['2026-10-01', 'maintenance_charge', 150],
      ['2026-11-01', 'insurance', 20],
    ]);
  });

  it('stops booking when the entry is deleted, and keeps what it already booked', async () => {
    const id = await flat();
    const entryId = (await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-09' }))!;
    await p.get(alice.userId, id);

    expect(await p.deleteRecurring(alice.userId, id, entryId)).toBe(true);
    now = new Date('2026-12-02T08:00:00Z');
    const apt = (await p.get(alice.userId, id))!;

    expect(apt.recurring).toEqual([]);
    expect(apt.costs.map((c) => c.date)).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('books a cost registered with “repeat” again only from the month after it, on the same day', async () => {
    const id = await flat();
    await p.createCost(alice.userId, id, { date: '2026-10-03', category: 'insurance', description: '', amount: 30 }, { repeat: true });

    expect((await p.get(alice.userId, id))!.costs.map((c) => c.date)).toEqual(['2026-10-03']);
    now = new Date('2026-11-04T08:00:00Z');
    const apt = (await p.get(alice.userId, id))!;

    expect(apt.costs.map((c) => c.date)).toEqual(['2026-10-03', '2026-11-03']);
    expect(apt.recurring.map((r) => [r.kind, r.category, r.amount])).toEqual([['cost', 'insurance', 30]]);
  });
});

describe('recurring rent', () => {
  const rent = { kind: 'rent' as const, description: '', amount: 800, dayOfMonth: 1 };

  it('logs every month as paid, on the 1st', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...rent, firstMonth: '2026-09' });

    const apt = (await p.get(alice.userId, id))!;

    expect(apt.rents).toEqual([
      { month: '2026-09', status: 'paid', amount: 800, receivedDate: '2026-09-01', note: '' },
      { month: '2026-10', status: 'paid', amount: 800, receivedDate: '2026-10-01', note: '' },
    ]);
  });

  it('leaves a month the user logged themselves exactly as they logged it', async () => {
    const id = await flat();
    await p.putRent(alice.userId, id, '2026-09', { status: 'vacant', amount: 0, receivedDate: '', note: 'Empty' });
    await p.createRecurring(alice.userId, id, { ...rent, firstMonth: '2026-09' });

    const apt = (await p.get(alice.userId, id))!;

    expect(apt.rents.map((r) => [r.month, r.status, r.amount])).toEqual([
      ['2026-09', 'vacant', 0],
      ['2026-10', 'paid', 800],
    ]);
  });

  it('allows one recurring rent per apartment', async () => {
    const id = await flat();
    expect(await p.createRecurring(alice.userId, id, { ...rent, firstMonth: '2026-09' })).toEqual(expect.any(String));
    expect(await p.createRecurring(alice.userId, id, { ...rent, amount: 900, firstMonth: '2026-09' })).toBe('rent_exists');
    expect((await p.get(alice.userId, id))!.recurring).toHaveLength(1);
  });

  it('keeps the rent entry’s own amount when a repeating rent is registered while one exists', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...rent, firstMonth: '2026-11' });
    await p.putRent(alice.userId, id, '2026-10', { status: 'paid', amount: 850, receivedDate: '2026-10-02', note: '' }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring.map((r) => r.amount)).toEqual([800]);
  });

  it('starts a repeating rent the month after the one registered', async () => {
    const id = await flat();
    await p.putRent(alice.userId, id, '2026-10', { status: 'paid', amount: 850, receivedDate: '2026-10-02', note: '' }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring).toEqual([
      expect.objectContaining({ kind: 'rent', amount: 850, nextMonth: '2026-11' }),
    ]);
  });

  it('does not repeat a month that was vacant', async () => {
    const id = await flat();
    await p.putRent(alice.userId, id, '2026-10', { status: 'vacant', amount: 0, receivedDate: '', note: '' }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring).toEqual([]);
  });
});

describe('booking on another day of the month', () => {
  const on15 = { ...charge, dayOfMonth: 15 };

  it('books a cost on its day, and the current month only once that day has come', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...on15, firstMonth: '2026-08' });

    // 5 October: the 15th has not come, so October waits.
    expect((await p.get(alice.userId, id))!.costs.map((c) => c.date)).toEqual(['2026-08-15', '2026-09-15']);
    now = new Date('2026-10-14T23:00:00Z');
    expect((await p.get(alice.userId, id))!.costs.map((c) => c.date)).toEqual(['2026-08-15', '2026-09-15']);
    now = new Date('2026-10-15T00:30:00Z');
    expect((await p.get(alice.userId, id))!.costs.map((c) => c.date)).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
  });

  it('logs rent as received on its day', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { kind: 'rent', description: '', amount: 800, dayOfMonth: 15, firstMonth: '2026-09' });

    expect((await p.get(alice.userId, id))!.rents.map((r) => [r.month, r.receivedDate])).toEqual([['2026-09', '2026-09-15']]);
  });

  it('lists the month it books next, which is the current one while its day is still to come', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...on15, firstMonth: '2026-09' });

    expect((await p.get(alice.userId, id))!.recurring[0]).toMatchObject({ dayOfMonth: 15, nextMonth: '2026-10' });
  });

  it('applies a changed day to the months not booked yet', async () => {
    const id = await flat();
    const entryId = (await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-10' }))!;
    await p.get(alice.userId, id);
    await p.updateRecurring(alice.userId, id, entryId, { description: 'Hoitovastike', amount: 150, dayOfMonth: 20 });

    now = new Date('2026-11-25T08:00:00Z');
    const apt = (await p.get(alice.userId, id))!;

    expect(apt.costs.map((c) => c.date)).toEqual(['2026-10-01', '2026-11-20']);
    expect(apt.recurring[0]!.dayOfMonth).toBe(20);
  });

  it('repeats a registered cost on the day it was dated', async () => {
    const id = await flat();
    await p.createCost(alice.userId, id, { date: '2026-09-12', category: 'insurance', description: '', amount: 30 }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring[0]).toMatchObject({ dayOfMonth: 12, nextMonth: '2026-10' });
  });

  it('repeats a registered rent on the day it was received', async () => {
    const id = await flat();
    await p.putRent(alice.userId, id, '2026-09', { status: 'paid', amount: 800, receivedDate: '2026-09-03', note: '' }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring[0]).toMatchObject({ kind: 'rent', dayOfMonth: 3 });
  });

  it('stops at the 28th for a registered date later in the month, so every month has the day', async () => {
    const id = await flat();
    await p.createCost(alice.userId, id, { date: '2026-08-31', category: 'insurance', description: '', amount: 30 }, { repeat: true });

    expect((await p.get(alice.userId, id))!.recurring[0]!.dayOfMonth).toBe(28);
  });

  it('refuses a day the database could not keep', async () => {
    const id = await flat();
    await expect(p.createRecurring(alice.userId, id, { ...charge, dayOfMonth: 29, firstMonth: '2026-10' })).rejects.toThrow();
    await expect(p.createRecurring(alice.userId, id, { ...charge, dayOfMonth: 0, firstMonth: '2026-10' })).rejects.toThrow();
  });
});

describe('who can change recurring entries', () => {
  it('refuses someone who does not own the apartment, and shows them nothing', async () => {
    const id = await flat();
    const entryId = (await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-10' }))!;

    expect(await p.createRecurring(bob.userId, id, { ...charge, firstMonth: '2026-10' })).toBeNull();
    expect(await p.updateRecurring(bob.userId, id, entryId, { description: 'x', amount: 1, dayOfMonth: 1 })).toBe(false);
    expect(await p.deleteRecurring(bob.userId, id, entryId)).toBe(false);
    expect((await p.get(alice.userId, id))!.recurring).toHaveLength(1);
  });

  it('will not reach an entry of another apartment through an apartment you own', async () => {
    const mine = await p.create(bob, { ...defaultSettings, name: 'Bob' });
    const theirs = await flat();
    const entryId = (await p.createRecurring(alice.userId, theirs, { ...charge, firstMonth: '2026-10' }))!;

    expect(await p.updateRecurring(bob.userId, mine, entryId, { description: 'x', amount: 1, dayOfMonth: 1 })).toBe(false);
    expect(await p.deleteRecurring(bob.userId, mine, entryId)).toBe(false);
    expect((await p.get(alice.userId, theirs))!.recurring).toHaveLength(1);
  });

  it('treats an id that is not a uuid as not found', async () => {
    const id = await flat();
    expect(await p.updateRecurring(alice.userId, id, 'nope', { description: '', amount: 1, dayOfMonth: 1 })).toBe(false);
    expect(await p.deleteRecurring(alice.userId, id, 'nope')).toBe(false);
  });

  it('is removed with the apartment', async () => {
    const id = await flat();
    await p.createRecurring(alice.userId, id, { ...charge, firstMonth: '2026-10' });
    await p.remove(alice.userId, id);

    expect(await db.query('select 1 from recurring_entries')).toEqual([]);
  });
});
