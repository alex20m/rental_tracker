import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb, type TestDb } from './support/testDb';

let db: TestDb;

beforeAll(async () => {
  db = await testDb();
});

afterAll(async () => {
  await db.close();
});

describe('the schema after every migration', () => {
  it('no longer has the user_profiles table, because the declaration name comes from the account', async () => {
    const rows = await db.query<{ found: string | null }>(`select to_regclass('public.user_profiles') as found`);

    expect(rows).toEqual([{ found: null }]);
  });
});
