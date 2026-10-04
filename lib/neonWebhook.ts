/**
 * Verifying a webhook from Neon Auth.
 *
 * Neon signs with Ed25519 and publishes the public keys at the auth base URL's
 * JWKS, so there is no shared secret to store or rotate. The signature is a
 * detached JWS, and the signed bytes are NOT the body: they are
 * `base64url(timestamp + "." + base64url(body))` after the JWS header — the
 * body is encoded twice. Rebuilding it the obvious way fails every request.
 *
 * Verification needs the exact bytes Neon sent, so the caller passes the raw
 * text of the request, not a re-serialised object.
 */

import crypto from 'node:crypto';

const MAX_AGE_MS = 5 * 60 * 1000;

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

/** True only for a fresh request signed by a key the auth service publishes. Never throws. */
export async function verifyNeonWebhook(rawBody: string, headers: Headers, authBaseUrl: string): Promise<boolean> {
  const signature = headers.get('x-neon-signature');
  const kid = headers.get('x-neon-signature-kid');
  const timestamp = headers.get('x-neon-timestamp');
  if (!signature || !kid || !timestamp) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > MAX_AGE_MS) return false;

  const [header, payload, signatureB64] = signature.split('.');
  if (!header || payload !== '' || !signatureB64) return false;

  try {
    const res = await fetch(`${authBaseUrl.replace(/\/+$/, '')}/.well-known/jwks.json`);
    if (!res.ok) return false;
    const { keys } = (await res.json()) as { keys: (crypto.JsonWebKey & { kid?: string })[] };
    const jwk = keys.find((key) => key.kid === kid);
    if (!jwk) return false;

    const signingInput = `${header}.${b64(`${timestamp}.${b64(rawBody)}`)}`;
    return crypto.verify(
      null,
      Buffer.from(signingInput),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(signatureB64, 'base64url'),
    );
  } catch (error) {
    console.error('Could not verify the Neon Auth webhook', error);
    return false;
  }
}
