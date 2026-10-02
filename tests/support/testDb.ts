import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Queryable } from '@/lib/portfolio';

const migrations = fileURLToPath(new URL('../../db/migrations', import.meta.url));

export type TestDb = Queryable & {
  /** Empties every app table, so each test starts from nothing without a fresh boot. */
  reset(): Promise<void>;
  close(): Promise<void>;
};

/**
 * A real Postgres, in process, with the app's real migrations applied — so the
 * SQL that decides who can see what is exercised as written, not mocked.
 *
 * Booting one takes a couple of seconds, so create it once per file
 * (`beforeAll`) and `reset()` it before each test.
 */
export async function testDb(): Promise<TestDb> {
  const pg = new PGlite();
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(`${migrations}/${file}`, 'utf8'));
  }
  const { rows } = await pg.query<{ name: string }>(
    `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  const tables = rows.map((r) => r.name).join(', ');

  return {
    async query<T>(text: string, params?: unknown[]) {
      return (await pg.query<T>(text, params)).rows;
    },
    async reset() {
      await pg.exec(`truncate ${tables} cascade`);
    },
    close: () => pg.close(),
  };
}
