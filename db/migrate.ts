/**
 * `npm run migrate` — apply db/migrations to the database.
 *
 * This runs as part of the deploy's build command (vercel.json), so the schema
 * is in place before the new code serves a request, and a failed migration
 * fails the build and leaves the previous deployment serving. That ordering is
 * the reason it is not a CI job; see CLAUDE.md.
 *
 * The migrating itself is node-pg-migrate's: the ledger table, ordering,
 * apply-once bookkeeping, the advisory lock and the transaction each migration
 * runs in. What lives here is only the configuration it needs, and an error
 * message that says what to do about a missing connection string.
 */

import { config as loadEnvFiles } from 'dotenv';
import { runner } from 'node-pg-migrate';

// A plain tsx script does not load .env files the way `next dev` does, and
// `vercel env pull` writes .env.local — so without this the command SETUP.md
// tells you to run reports no DATABASE_URL while the file sits next to it.
// Existing variables win, which keeps the platform's build environment
// authoritative.
loadEnvFiles({ path: ['.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
  // The unpooled endpoint when the platform provides one: node-pg-migrate holds
  // a session-scoped advisory lock, and a transaction-mode pooler cannot
  // promise the same session across statements.
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Locally: `npx vercel env pull .env.local`, then ' +
        '`npm run migrate`. See SETUP.md.',
    );
  }

  const applied = await runner({
    databaseUrl,
    dir: 'db/migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    // Loading `.sql` files needs saying: the default loader imports each file as
    // a module, which is right for `.ts` migrations and nonsense for these.
    migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'legacySql' }],
    // Refuse a migration numbered below one that has already run — the shape a
    // merge conflict takes when two branches each add the next file.
    checkOrder: true,
    // Queue behind a run already in flight rather than failing; two deploys
    // landing together should serialise, not lose one.
    advisoryLockMode: 'wait',
  });

  console.log(
    applied.length === 0
      ? 'Database is up to date; no migrations to apply.'
      : `Applied ${applied.length} migration(s).`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
