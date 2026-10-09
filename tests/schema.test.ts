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

describe('migration 0008, the personal sale', () => {
  const upTo = (n: number) => readdirSync(migrations).filter((f) => f.endsWith('.sql') && Number(f.slice(0, 4)) <= n).sort();
  const apply = async (pg: PGlite, files: string[]) => {
    for (const f of files) await pg.exec(readFileSync(`${migrations}/${f}`, 'utf8'));
  };

  it('hands a sale entered on the apartment to the person who created it, at their share, and drops costs nobody owns', async () => {
    const pg = new PGlite();
    await apply(pg, upTo(7));
    await pg.exec(`
      insert into apartments (id, name, created_by, purchase_date, purchase_price, sale_date, sale_price, sale_costs) values
        ('00000000-0000-4000-8000-000000000001', 'Shared', 'alice', '2018-03-01', 200000, '2025-06-15', 300000, 5000),
        ('00000000-0000-4000-8000-000000000002', 'Not for sale', 'alice', '2018-03-01', 100000, null, 0, 0),
        ('00000000-0000-4000-8000-000000000003', 'Creator left', 'carol', '2018-03-01', 100000, '2025-06-15', 100000, 0);
      insert into apartment_owners (apartment_id, user_id, email, share_pct) values
        ('00000000-0000-4000-8000-000000000001', 'alice', 'a@x.test', 60),
        ('00000000-0000-4000-8000-000000000001', 'bob', 'b@x.test', 40),
        ('00000000-0000-4000-8000-000000000002', 'alice', 'a@x.test', 100),
        ('00000000-0000-4000-8000-000000000003', 'dave', 'd@x.test', 100);
      insert into acquisition_costs (apartment_id, date, kind, amount) values
        ('00000000-0000-4000-8000-000000000001', '2018-03-02', 'transfer_tax', 1500),
        ('00000000-0000-4000-8000-000000000003', '2018-03-02', 'transfer_tax', 700)`);

    await apply(pg, upTo(8).slice(7)); // 0008 alone, on top of what 0001–0007 built

    const sales = await pg.query(`select apartment_id, user_id, purchase_date::text, purchase_price::float8, sale_date::text, sale_price::float8, sale_costs::float8 from sales order by apartment_id`);
    expect(sales.rows).toEqual([
      {
        apartment_id: '00000000-0000-4000-8000-000000000001',
        user_id: 'alice',
        purchase_date: '2018-03-01',
        purchase_price: 120000, // 60 % of 200 000
        sale_date: '2025-06-15',
        sale_price: 180000,
        sale_costs: 3000,
      },
    ]);
    const costs = await pg.query(`select user_id, amount::float8 from acquisition_costs`);
    expect(costs.rows).toEqual([{ user_id: 'alice', amount: 900 }]);
    await pg.close();
  });
});
