/**
 * The first version kept everything in the browser and exported it as a JSON
 * backup: `{ version: 1, db: { settings, rents, costs }, receipts: { [costId]: dataUrl } }`.
 * This turns one into what POST /api/import takes, plus the receipt uploads to
 * make afterwards — so data from that version can move into the shared one.
 */

import type { ApartmentSettings, CostCategory, RentEntry, RentStatus } from '@/lib/domain/types';
import { defaultSettings } from '@/lib/domain/types';

type V1Settings = Partial<Omit<ApartmentSettings, 'name'>> & { propertyName?: string; taxpayerName?: string };
type V1Rent = { month: string; status: RentStatus; amount: number; receivedDate: string; note?: string };
type V1Cost = { id: string; date: string; category: CostCategory; description?: string; amount: number };

export type ImportPayload = {
  settings: ApartmentSettings;
  rents: RentEntry[];
  costs: { id: string; date: string; category: CostCategory; description: string; amount: number }[];
};

export type ConvertedBackup = {
  payload: ImportPayload;
  receipts: { costId: string; dataUrl: string }[];
  /** The old version stored this per database; it now belongs to the person. */
  taxpayerName: string;
};

export function fromV1Backup(parsed: unknown, newId: () => string = () => crypto.randomUUID()): ConvertedBackup {
  const backup = parsed as { db?: { settings?: V1Settings; rents?: V1Rent[]; costs?: V1Cost[] }; receipts?: Record<string, string> } | null;
  const db = backup?.db;
  if (!db || typeof db !== 'object') throw new Error('Not a Rental Tracker backup file');

  const { propertyName, taxpayerName, ...rest } = db.settings ?? {};
  const settings: ApartmentSettings = {
    ...defaultSettings,
    ...pick(rest as Partial<ApartmentSettings>, Object.keys(defaultSettings) as (keyof ApartmentSettings)[]),
    name: propertyName?.trim() || 'Imported apartment',
  };

  // The primary key is (apartment, month); a hand-edited backup could repeat one.
  const byMonth = new Map<string, RentEntry>();
  for (const r of db.rents ?? []) {
    byMonth.set(r.month, { month: r.month, status: r.status, amount: r.amount, receivedDate: r.receivedDate ?? '', note: r.note ?? '' });
  }

  const newIds = new Map<string, string>();
  const costs = (db.costs ?? []).map((c) => {
    const id = newId();
    newIds.set(c.id, id);
    return { id, date: c.date, category: c.category, description: c.description ?? '', amount: c.amount };
  });

  const receipts = Object.entries(backup?.receipts ?? {}).flatMap(([oldId, dataUrl]) => {
    const costId = newIds.get(oldId);
    return costId ? [{ costId, dataUrl }] : [];
  });

  return {
    payload: { settings, rents: [...byMonth.values()], costs },
    receipts,
    taxpayerName: taxpayerName?.trim() ?? '',
  };
}

function pick<T extends object, K extends keyof T>(obj: Partial<T>, keys: K[]): Partial<T> {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]])) as Partial<T>;
}
