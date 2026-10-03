'use client';

/**
 * The browser's side of the API. Everything the first version kept in
 * localStorage and IndexedDB now lives on the server, behind the signed-in
 * user, so it is shared between devices and between an apartment's owners.
 */

import type {
  ApartmentSettings,
  ApartmentView,
  CostCategory,
  PortfolioItem,
  RentStatus,
} from '@/lib/domain/types';
import type { ImportPayload } from '@/lib/domain/v1Backup';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  // A session that ended while the app was open: every screen's answer is the
  // same. A full navigation, not a router push, so nothing of the signed-out
  // account's state survives in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401) window.location.assign('/sign-in');
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

const apt = (id: string) => `/api/apartments/${encodeURIComponent(id)}`;

export type CostInput = { date: string; category: CostCategory; description: string; amount: number };
export type RentInput = { status: RentStatus; amount: number; receivedDate: string; note: string };

export const api = {
  me: () => call<{ userId: string; email: string; emailVerified: boolean }>('GET', '/api/me'),
  portfolio: () => call<{ apartments: PortfolioItem[]; emailVerified: boolean }>('GET', '/api/apartments'),
  apartment: (id: string) => call<ApartmentView>('GET', apt(id)),
  createApartment: (settings: Partial<ApartmentSettings>) => call<{ id: string }>('POST', '/api/apartments', settings),
  updateSettings: (id: string, patch: Partial<ApartmentSettings>) => call('PATCH', apt(id), patch),
  deleteApartment: (id: string) => call('DELETE', apt(id)),

  putRent: (id: string, month: string, rent: RentInput) => call('PUT', `${apt(id)}/rents/${month}`, rent),
  deleteRent: (id: string, month: string) => call('DELETE', `${apt(id)}/rents/${month}`),

  createCost: (id: string, cost: CostInput) => call<{ id: string }>('POST', `${apt(id)}/costs`, cost),
  updateCost: (id: string, costId: string, cost: CostInput) => call('PUT', `${apt(id)}/costs/${costId}`, cost),
  deleteCost: (id: string, costId: string) => call('DELETE', `${apt(id)}/costs/${costId}`),
  receiptUrl: (id: string, costId: string) => `${apt(id)}/costs/${costId}/receipt`,
  putReceipt: (id: string, costId: string, dataUrl: string) => call('PUT', `${apt(id)}/costs/${costId}/receipt`, { dataUrl }),
  deleteReceipt: (id: string, costId: string) => call('DELETE', `${apt(id)}/costs/${costId}/receipt`),

  invite: (id: string, email: string, sharePct: number) => call<{ id: string; emailSent: boolean }>('POST', `${apt(id)}/invites`, { email, sharePct }),
  revokeInvite: (id: string, inviteId: string) => call('DELETE', `${apt(id)}/invites/${inviteId}`),
  setShares: (
    id: string,
    shares: { owners: { userId: string; sharePct: number }[]; invites: { id: string; sharePct: number }[] },
  ) => call('PUT', `${apt(id)}/shares`, shares),
  removeOwner: (id: string, userId: string) => call('DELETE', `${apt(id)}/owners/${encodeURIComponent(userId)}`),

  profile: () => call<{ taxpayerName: string }>('GET', '/api/profile'),
  setProfile: (taxpayerName: string) => call('PUT', '/api/profile', { taxpayerName }),
  importLedger: (payload: ImportPayload) => call<{ id: string }>('POST', '/api/import', payload),
};

/** A receipt photo as bytes, for the declaration zip. Undefined if there is none. */
export async function fetchReceipt(
  id: string,
  costId: string,
): Promise<{ data: ArrayBuffer; extension: string } | undefined> {
  const res = await fetch(api.receiptUrl(id, costId), { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) return undefined;
  const type = res.headers.get('content-type')!;
  const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  return { data: await res.arrayBuffer(), extension };
}

/**
 * Shrink a photo to max 1400px JPEG so receipts stay small to upload and store.
 * Rejects when the file is not an image the browser can decode.
 */
export async function compressImage(file: File, maxSize = 1400, quality = 0.72): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
