/**
 * Every environment variable the app reads, in one place.
 *
 * Two reasons it is centralised rather than `process.env.X` at each use site:
 * the health endpoint can report what is configured without duplicating the
 * list, and a missing variable produces one clear error instead of `undefined`
 * travelling into a query.
 *
 * Values come from the hosting platform (see SETUP.md) and locally from
 * `vercel env pull .env.local`. Nothing here is hand-maintained in two places.
 */

/**
 * Just the shape this file reads. Not `NodeJS.ProcessEnv`: under Next's types
 * that requires `NODE_ENV`, so a test could not pass a bare object of the two
 * variables it wants to vary.
 */
export type EnvSource = Record<string, string | undefined>;

export type AppConfig = {
  /** Pooled connection, for the app's own queries. */
  databaseUrl: string | undefined;
  /** Direct connection, for migrations — see db/migrate.ts. */
  databaseUrlUnpooled: string | undefined;
  /** Where the app is actually served, for links in emails and redirects. */
  appUrl: string | undefined;
  /** Neon Auth's base URL and cookie secret — both required, or auth is off. */
  authBaseUrl: string | undefined;
  authCookieSecret: string | undefined;
};

export function readConfig(env: EnvSource = process.env): AppConfig {
  return {
    databaseUrl: nonEmpty(env.DATABASE_URL),
    databaseUrlUnpooled: nonEmpty(env.DATABASE_URL_UNPOOLED),
    appUrl: nonEmpty(env.APP_URL),
    authBaseUrl: nonEmpty(env.NEON_AUTH_BASE_URL),
    authCookieSecret: nonEmpty(env.NEON_AUTH_COOKIE_SECRET),
  };
}

/**
 * An empty string is how an unset variable usually arrives from a shell or a
 * CI env block, and it is never a valid value for any of these — so it is
 * treated as absent rather than as configuration.
 */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** For code paths that cannot proceed without it, with an error that says what to do. */
export function requireDatabaseUrl(config: AppConfig = readConfig()): string {
  const url = config.databaseUrl;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Locally: `npx vercel env pull .env.local`. See SETUP.md.',
    );
  }
  return url;
}
