import { describe, expect, it } from 'vitest';
import { readConfig, requireDatabaseUrl } from '@/lib/env';

describe('reading configuration', () => {
  it('treats a blank variable as absent rather than as configuration', () => {
    // How an unset variable actually arrives from a shell or a CI env block:
    // present, empty. Passing "" on to a database driver produces a connection
    // error far from the cause.
    const config = readConfig({ DATABASE_URL: '', DATABASE_URL_UNPOOLED: '   ' });

    expect(config.databaseUrl).toBeUndefined();
    expect(config.databaseUrlUnpooled).toBeUndefined();
  });

  it('keeps a real value intact, including its query string', () => {
    // Connection strings carry `?sslmode=require` and friends; trimming or
    // splitting them has broken this before.
    const url = 'postgres://user:pw@host/db?sslmode=require&channel_binding=require';
    expect(readConfig({ DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it('explains what to run when the database URL is missing', () => {
    // The error is the whole feature: someone hits this on a fresh clone, and
    // "undefined is not a string" would not tell them about `vercel env pull`.
    expect(() => requireDatabaseUrl(readConfig({}))).toThrow(/vercel env pull/);
  });
});
