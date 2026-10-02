/**
 * The database handle.
 *
 * `neon()` speaks HTTP, which suits the app's queries — single statements with
 * parameters, from serverless functions that may not outlive the request. What
 * it cannot do is hold a session across statements, which is why migrations use
 * a different client entirely (db/migrate.ts).
 *
 * Tagged-template usage parameterises automatically:
 *
 *   const rows = await sql`select id from widgets where owner = ${userId}`;
 *
 * Never build a query by string concatenation — that is the one way to lose the
 * parameterisation this gives you for free.
 */

import { neon } from '@neondatabase/serverless';
import { requireDatabaseUrl } from '@/lib/env';
import type { Queryable } from '@/lib/portfolio';

type Sql = ReturnType<typeof neon>;

let cached: Sql | undefined;

/**
 * Created on first use rather than at module load: importing this file must not
 * throw in an environment that has no database yet (a unit test, a build step
 * prerendering a page that never queries).
 */
export function db(): Sql {
  cached ??= neon(requireDatabaseUrl());
  return cached;
}

/** Tests and scripts that swap in their own handle. */
export function setDbForTesting(sql: Sql | undefined): void {
  cached = sql;
}

let queryableOverride: Queryable | undefined;

/**
 * The app's queries, as positional-parameter SQL over Neon's HTTP driver.
 * Tests swap in an in-process Postgres with `setQueryableForTesting`.
 */
export function queryable(): Queryable {
  if (queryableOverride) return queryableOverride;
  const sql = db();
  return {
    query: <T>(text: string, params?: unknown[]) => sql.query(text, params) as Promise<T[]>,
  };
}

export function setQueryableForTesting(next: Queryable | undefined): void {
  queryableOverride = next;
}
