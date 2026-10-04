import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb, type TestDb } from './support/testDb';

const migrations = fileURLToPath(new URL('../db/migrations', import.meta.url));

let db: TestDb;

beforeAll(async () => {
  db = await testDb();
});

afterAll(async () => {
  await db.close();
});

describe('the schema after every migration', () => {
  it('no longer has the user_profiles table, because the declaration name comes from the account', async () => {
    const rows = await db.query<{ found: string | null }>(`select to_regclass('public.user_profiles') as found`);

    expect(rows).toEqual([{ found: null }]);
  });
});

describe('migration 0004, the verified deduction rules', () => {
  const upTo = (n: number) => readdirSync(migrations).filter((f) => f.endsWith('.sql') && Number(f.slice(0, 4)) <= n).sort();
  const apply = async (pg: PGlite, files: string[]) => {
    for (const f of files) await pg.exec(readFileSync(`${migrations}/${f}`, 'utf8'));
  };

  it('gives every apartment that already exists the behaviour it had, and anchors earlier depreciation at this year', async () => {
    const pg = new PGlite();
    await apply(pg, upTo(3));
    await pg.exec(`
      insert into apartments (id, name, property_type, use_depreciation, depreciation_prior, created_by) values
        ('00000000-0000-4000-8000-000000000001', 'Property with depreciation', 'property', true, 4000, 'u'),
        ('00000000-0000-4000-8000-000000000002', 'Property without', 'property', false, 0, 'u'),
        ('00000000-0000-4000-8000-000000000003', 'Flat', 'share', false, 0, 'u')`);

    await apply(pg, upTo(4).slice(3));

    const { rows } = await pg.query<Record<string, unknown>>(
      `select name, purchase_costs::float8 as "purchaseCosts", building_kind as "buildingKind",
              depreciation_from_year as "from", furnishing, room_class as "roomClass",
              below_market_rent as "belowMarket", let_share_pct::float8 as "letShare"
         from apartments order by name`,
    );
    const year = new Date().getFullYear();
    const common = { purchaseCosts: 0, buildingKind: 'residential', furnishing: 'actual', roomClass: 'larger', belowMarket: false, letShare: 100 };
    expect(rows).toEqual([
      { name: 'Flat', from: 0, ...common },
      { name: 'Property with depreciation', from: year, ...common },
      { name: 'Property without', from: 0, ...common },
    ]);
    await pg.close();
  });

  it('refuses values outside what the settings allow', async () => {
    // Without the migration every insert below fails for want of the column, which would pass this vacuously.
    expect(upTo(4)).toHaveLength(4);
    const pg = new PGlite();
    await apply(pg, upTo(4));
    const insert = (cols: string, val: string) => pg.exec(`insert into apartments (name, created_by, ${cols}) values ('x', 'u', ${val})`);

    await expect(insert('let_share_pct', '0')).rejects.toThrow();
    await expect(insert('let_share_pct', '101')).rejects.toThrow();
    await expect(insert('furnishing', `'rented'`)).rejects.toThrow();
    await expect(insert('room_class', `'huge'`)).rejects.toThrow();
    await expect(insert('building_kind', `'castle'`)).rejects.toThrow();
    await expect(insert('depreciation_from_year', '1999')).rejects.toThrow();
    await expect(insert('purchase_costs', '-1')).rejects.toThrow();
    await pg.close();
  });
});
