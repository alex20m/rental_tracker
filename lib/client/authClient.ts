'use client';

import { createAuthClient } from '@neondatabase/auth/next';

let client: ReturnType<typeof createAuthClient> | undefined;

/**
 * Neon Auth's browser client. It talks to this app's own /api/auth/* proxy,
 * so it needs no URL. Created on first use rather than at import, so a page
 * that is prerendered never builds one on the server.
 */
export function authClient() {
  client ??= createAuthClient();
  return client;
}
