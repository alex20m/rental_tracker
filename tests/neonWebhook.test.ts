import crypto from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyNeonWebhook } from '@/lib/neonWebhook';

const AUTH = 'https://auth.test/neondb/auth';
const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

let privateKey: crypto.KeyObject;
let jwk: crypto.JsonWebKey;

beforeAll(() => {
  const pair = crypto.generateKeyPairSync('ed25519');
  privateKey = pair.privateKey;
  jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'key-1' };
});

afterEach(() => vi.unstubAllGlobals());

/** Signs the way Neon documents it: detached JWS over `timestamp.base64url(body)`, itself base64url-encoded. */
function signed(body: string, opts: { timestamp?: number; kid?: string } = {}) {
  const timestamp = String(opts.timestamp ?? Date.now());
  const header = b64(JSON.stringify({ alg: 'EdDSA', typ: 'JWS', kid: 'key-1' }));
  const signingInput = `${header}.${b64(`${timestamp}.${b64(body)}`)}`;
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
  return new Headers({
    'x-neon-signature': `${header}..${b64(signature)}`,
    'x-neon-signature-kid': opts.kid ?? 'key-1',
    'x-neon-timestamp': timestamp,
  });
}

function stubJwks(keys: unknown[] = [jwk]) {
  const fetchMock = vi.fn(async () => Response.json({ keys }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const body = JSON.stringify({ event_type: 'send.otp', event_data: { otp_code: '123456' } });

describe('verifying a Neon Auth webhook', () => {
  it('accepts a correctly signed body and fetches the key from the auth base URL', async () => {
    const fetchMock = stubJwks();
    expect(await verifyNeonWebhook(body, signed(body), AUTH)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${AUTH}/.well-known/jwks.json`);
  });

  it('fetches the key set from the right URL when the base URL has a trailing slash', async () => {
    const fetchMock = stubJwks();
    expect(await verifyNeonWebhook(body, signed(body), `${AUTH}/`)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${AUTH}/.well-known/jwks.json`);
  });

  it('rejects a body changed after signing', async () => {
    stubJwks();
    const headers = signed(body);
    expect(await verifyNeonWebhook(body.replace('123456', '999999'), headers, AUTH)).toBe(false);
  });

  it('rejects a signature made with a different key', async () => {
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' });
    stubJwks([{ ...other, kid: 'key-1' }]);
    expect(await verifyNeonWebhook(body, signed(body), AUTH)).toBe(false);
  });

  it('rejects a key id the JWKS does not list', async () => {
    stubJwks();
    expect(await verifyNeonWebhook(body, signed(body, { kid: 'unknown' }), AUTH)).toBe(false);
  });

  it('rejects a replay older than five minutes and one stamped in the future', async () => {
    stubJwks();
    expect(await verifyNeonWebhook(body, signed(body, { timestamp: Date.now() - 6 * 60_000 }), AUTH)).toBe(false);
    expect(await verifyNeonWebhook(body, signed(body, { timestamp: Date.now() + 6 * 60_000 }), AUTH)).toBe(false);
  });

  it('rejects a request missing its signature headers without fetching keys', async () => {
    const fetchMock = stubJwks();
    expect(await verifyNeonWebhook(body, new Headers(), AUTH)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a signature that is not a detached JWS', async () => {
    stubJwks();
    const headers = signed(body);
    headers.set('x-neon-signature', 'a.b.c');
    expect(await verifyNeonWebhook(body, headers, AUTH)).toBe(false);
  });

  it('rejects, rather than throws, when the key set cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await verifyNeonWebhook(body, signed(body), AUTH)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await verifyNeonWebhook(body, signed(body), AUTH)).toBe(false);
  });
});
