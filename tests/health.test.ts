import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('the health endpoint', () => {
  it('reports the database as unconfigured when no URL is set', async () => {
    delete process.env.DATABASE_URL;

    const body = await (await GET()).json();

    expect(body.ok).toBe(true);
    expect(body.databaseConfigured).toBe(false);
  });

  it('reports the database as configured once a URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://user:pw@host/db';

    const body = await (await GET()).json();

    expect(body.databaseConfigured).toBe(true);
  });

  it('reports email as configured only when both the key and the sender are set', async () => {
    process.env.RESEND_API_KEY = 're_key';
    delete process.env.MAIL_FROM;
    expect((await (await GET()).json()).emailConfigured).toBe(false);

    process.env.MAIL_FROM = 'Rentals <rentals@example.test>';
    expect((await (await GET()).json()).emailConfigured).toBe(true);
  });

  it('never puts a configuration value in the response', async () => {
    // The endpoint is unauthenticated by design, so it may say *whether*
    // something is set and never *what* it is.
    process.env.DATABASE_URL = 'postgres://user:sup3rsecret@host/db';

    const text = await (await GET()).text();

    expect(text).not.toContain('sup3rsecret');
    expect(text).not.toContain('postgres://');
  });
});
