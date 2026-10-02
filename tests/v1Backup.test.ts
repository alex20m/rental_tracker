import { describe, expect, it } from 'vitest';
import { fromV1Backup } from '@/lib/domain/v1Backup';
import { importSchema } from '@/lib/domain/schemas';

let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const backup = {
  version: 1,
  db: {
    settings: {
      taxpayerName: 'Demo Owner',
      propertyName: 'Demo apartment',
      address: 'Esimerkkikatu 1 B 12, 65100 Vaasa',
      housingCompany: 'Demo Asunto Oy',
      purchaseDate: '2024-08-15',
      purchasePrice: 95000,
      buildingSharePct: 100,
      depreciationRate: 2.5,
      depreciationPrior: 0,
      useDepreciation: true,
      monthlyRent: 780,
    },
    rents: [
      { id: 'r1', month: '2025-01', status: 'paid', amount: 780, receivedDate: '2025-01-03', note: '' },
      { id: 'r4', month: '2025-04', status: 'vacant', amount: 0, receivedDate: '', note: 'Between tenants' },
    ],
    costs: [
      { id: 'c1', date: '2025-04-18', category: 'repairs', description: 'Kitchen tap', amount: 142.5, hasReceipt: true },
      { id: 'c2', date: '2025-02-10', category: 'insurance', description: 'Home insurance', amount: 96, hasReceipt: false },
    ],
  },
  receipts: { c1: 'data:image/jpeg;base64,/9j/AAAA', orphan: 'data:image/jpeg;base64,/9j/BBBB' },
};

describe('reading a backup from the browser-only version', () => {
  it('turns the property settings into an apartment, and keeps the taxpayer name apart', () => {
    n = 0;
    const out = fromV1Backup(backup, ids);

    expect(out.payload.settings).toEqual({
      name: 'Demo apartment',
      address: 'Esimerkkikatu 1 B 12, 65100 Vaasa',
      housingCompany: 'Demo Asunto Oy',
      purchaseDate: '2024-08-15',
      purchasePrice: 95000,
      buildingSharePct: 100,
      depreciationRate: 2.5,
      depreciationPrior: 0,
      useDepreciation: true,
      monthlyRent: 780,
    });
    expect(out.taxpayerName).toBe('Demo Owner');
  });

  it('gives every cost a fresh id and sends each photo to its cost', () => {
    n = 0;
    const out = fromV1Backup(backup, ids);

    expect(out.payload.costs.map((c) => [c.id, c.description])).toEqual([
      ['00000000-0000-4000-8000-000000000001', 'Kitchen tap'],
      ['00000000-0000-4000-8000-000000000002', 'Home insurance'],
    ]);
    // The orphan photo has no cost to belong to, so it is dropped.
    expect(out.receipts).toEqual([
      { costId: '00000000-0000-4000-8000-000000000001', dataUrl: 'data:image/jpeg;base64,/9j/AAAA' },
    ]);
  });

  it('produces something the import endpoint accepts', () => {
    const out = fromV1Backup(backup, ids);

    expect(importSchema.safeParse(out.payload).success).toBe(true);
  });

  it('keeps one entry per month when a backup has duplicates, the last one winning', () => {
    const out = fromV1Backup(
      {
        db: {
          ...backup.db,
          rents: [
            { id: 'a', month: '2025-01', status: 'unpaid', amount: 0, receivedDate: '', note: '' },
            { id: 'b', month: '2025-01', status: 'paid', amount: 780, receivedDate: '2025-01-05', note: '' },
          ],
        },
      },
      ids,
    );

    expect(out.payload.rents).toEqual([
      { month: '2025-01', status: 'paid', amount: 780, receivedDate: '2025-01-05', note: '' },
    ]);
  });

  it('falls back to defaults for settings a backup does not have', () => {
    const out = fromV1Backup({ db: { settings: { propertyName: '' }, rents: [], costs: [] } }, ids);

    expect(out.payload.settings.name).toBe('Imported apartment');
    expect(out.payload.settings.depreciationRate).toBe(2.5);
    expect(out.taxpayerName).toBe('');
  });

  it('refuses a file that is not a backup', () => {
    expect(() => fromV1Backup({ hello: 'world' }, ids)).toThrow('Not a Rental Tracker backup file');
    expect(() => fromV1Backup(null, ids)).toThrow('Not a Rental Tracker backup file');
  });
});
