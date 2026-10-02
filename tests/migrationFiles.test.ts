import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The conventions migrations have to follow, checked before a deploy discovers
 * them. Each one here has cost somebody a broken deploy somewhere: a migration
 * that opens its own transaction inside the runner's, a duplicate number from
 * two branches, a rename that makes an applied migration look new.
 */

const dir = fileURLToPath(new URL('../db/migrations', import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
}

function contentsOf(name: string): string {
  return readFileSync(`${dir}/${name}`, 'utf8');
}

describe('migration files', () => {
  it('there is at least one, so the checks below are not vacuous', () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it('are named four digits then lower_snake_case', () => {
    // Applied migrations are tracked by file name, so a rename re-runs one and
    // an ad-hoc name makes the ordering ambiguous.
    for (const name of migrationFiles()) {
      expect(name, `"${name}" must be 0001_like_this.sql`).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
  });

  it('have unique, gapless numbering', () => {
    // Two branches each adding "the next" migration is the common way this
    // breaks, and the runner refuses a number below one already applied.
    const numbers = migrationFiles().map((name) => Number(name.slice(0, 4)));

    expect(new Set(numbers).size, 'duplicate migration numbers').toBe(numbers.length);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  it('do not manage their own transaction', () => {
    // The runner wraps each migration in one. A `begin`/`commit` inside would
    // either nest or commit early, leaving a half-applied schema recorded as
    // applied.
    for (const name of migrationFiles()) {
      const sql = contentsOf(name).replace(/--[^\n]*/g, '');

      expect(sql, `"${name}" must not contain begin`).not.toMatch(/\bbegin\b/i);
      expect(sql, `"${name}" must not contain commit`).not.toMatch(/\bcommit\b/i);
    }
  });

  it('do not use statements Postgres refuses inside a transaction', () => {
    // `create index concurrently` is the one that bites: it is exactly what you
    // reach for to avoid locking a big table, and it cannot run here. Apply it
    // by hand instead.
    for (const name of migrationFiles()) {
      const sql = contentsOf(name).replace(/--[^\n]*/g, '');

      expect(sql, `"${name}" must not use CONCURRENTLY`).not.toMatch(/\bconcurrently\b/i);
      expect(sql, `"${name}" must not VACUUM`).not.toMatch(/\bvacuum\b/i);
    }
  });
});
