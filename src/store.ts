import { useSyncExternalStore } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import type { DB, Settings } from './types';

const KEY = 'rental-tracker-v1';

export const defaultSettings: Settings = {
  taxpayerName: '',
  propertyName: 'My rental apartment',
  address: '',
  housingCompany: '',
  purchaseDate: '',
  purchasePrice: 0,
  buildingSharePct: 100,
  depreciationRate: 2.5,
  depreciationPrior: 0,
  useDepreciation: false,
  monthlyRent: 0,
};

const empty = (): DB => ({ settings: { ...defaultSettings }, rents: [], costs: [] });

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...empty(), ...p, settings: { ...defaultSettings, ...(p.settings ?? {}) } };
    }
  } catch {
    /* storage unavailable or corrupt — start empty */
  }
  return empty();
}

let state: DB = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore (private mode / sandboxed preview) */
  }
}

export function update(fn: (d: DB) => DB) {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

export function replaceAll(db: DB) {
  update(() => ({ ...empty(), ...db, settings: { ...defaultSettings, ...db.settings } }));
}

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- Receipt images: IndexedDB (falls back to memory when unavailable) ----
const mem = new Map<string, string>();

export async function saveReceipt(id: string, dataUrl: string) {
  mem.set(id, dataUrl);
  try {
    await set('receipt:' + id, dataUrl);
  } catch {
    /* memory fallback only */
  }
}

export async function loadReceipt(id: string): Promise<string | undefined> {
  if (mem.has(id)) return mem.get(id);
  try {
    return (await get('receipt:' + id)) as string | undefined;
  } catch {
    return undefined;
  }
}

export async function deleteReceipt(id: string) {
  mem.delete(id);
  try {
    await del('receipt:' + id);
  } catch {
    /* ignore */
  }
}

export async function allReceiptIds(): Promise<string[]> {
  const ids = new Set(mem.keys());
  try {
    for (const k of await keys()) if (typeof k === 'string' && k.startsWith('receipt:')) ids.add(k.slice(8));
  } catch {
    /* ignore */
  }
  return [...ids];
}

/** Shrink a photo to max 1400px JPEG so many receipts fit in browser storage. */
export function compressImage(file: File, maxSize = 1400, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Backup / restore (JSON including receipts) ----
export async function exportBackup(): Promise<Blob> {
  const receipts: Record<string, string> = {};
  for (const id of await allReceiptIds()) {
    const r = await loadReceipt(id);
    if (r) receipts[id] = r;
  }
  return new Blob([JSON.stringify({ version: 1, db: state, receipts })], { type: 'application/json' });
}

export async function importBackup(file: File) {
  const parsed = JSON.parse(await file.text());
  if (!parsed?.db) throw new Error('Not a Rental Tracker backup file');
  replaceAll(parsed.db as DB);
  for (const [id, data] of Object.entries(parsed.receipts ?? {})) await saveReceipt(id, data as string);
}
