/**
 * What the API accepts. Every request body is parsed here before it reaches a
 * query, so the database only ever sees values of the right shape and range —
 * the constraints in the migration are the backstop, not the first line.
 */

import { z } from 'zod';
import {
  BUILDING_KINDS,
  COST_CATEGORIES,
  FURNISHINGS,
  PROPERTY_TYPES,
  RENT_STATUSES,
  ROOM_CLASSES,
  defaultSettings,
} from '@/lib/domain/types';
import { RULES } from '@/lib/domain/taxRules';

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** YYYY-MM-DD that names a day that exists — 2025-02-30 is refused. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Not a real date');

/**
 * The latest month that has begun anywhere on Earth (UTC+14), as YYYY-MM. The
 * server cannot know the user's time zone, so it allows whatever month the
 * browser could legitimately be in; the browser itself blocks by local time.
 */
export const latestMonth = (now = new Date()) => new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 7);

const NOT_FUTURE = 'Cannot log a month that has not started yet';

export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

/** A month that has started: the ledger only records what already happened. */
export const pastOrCurrentMonth = month.refine((m) => m <= latestMonth(), NOT_FUTURE);

const hundredths = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Euros: non-negative, whole cents, and below what numeric(12,2) holds. */
const money = z.number().finite().min(0).max(9_999_999_999.99).refine(hundredths, 'At most two decimals');

/** A percentage with at most two decimals, matching numeric(5,2). */
export const percent = z.number().finite().min(0).max(100).refine(hundredths, 'At most two decimals');

const text = (max: number) => z.string().trim().max(max);

export const settingsSchema = z.object({
  name: text(200).min(1, 'Give the apartment a name'),
  address: text(300),
  housingCompany: text(200),
  propertyType: z.enum(PROPERTY_TYPES),
  financingChargeDeductible: z.boolean(),
  purchaseDate: z.union([z.literal(''), isoDate]),
  purchasePrice: money,
  purchaseCosts: money,
  buildingSharePct: percent,
  buildingKind: z.enum(BUILDING_KINDS),
  depreciationRate: percent,
  depreciationPrior: money,
  /** 0 = from the first rent logged; otherwise a tax year. */
  depreciationFromYear: z.union([z.literal(0), z.number().int().min(2000).max(2100)]),
  useDepreciation: z.boolean(),
  monthlyRent: money,
  furnishing: z.enum(FURNISHINGS),
  roomClass: z.enum(ROOM_CLASSES),
  belowMarketRent: z.boolean(),
  letSharePct: percent.refine((n) => n > 0, 'Something must be let'),
});

/** Creating an apartment: anything left out takes the default. */
export const newApartmentSchema = settingsSchema
  .partial()
  .strict()
  .transform((s) => ({ ...defaultSettings, ...s }))
  .pipe(settingsSchema);

export const settingsPatchSchema = settingsSchema.partial().strict();

export const rentSchema = z
  .object({
    status: z.enum(RENT_STATUSES),
    amount: money,
    receivedDate: z.union([z.literal(''), isoDate]),
    note: text(500),
  })
  .strict()
  .refine((r) => r.status !== 'paid' || (r.amount > 0 && r.receivedDate !== ''), {
    message: 'A paid month needs an amount and the date it was received',
  });

export const costSchema = z
  .object({
    date: isoDate.refine((d) => d.slice(0, 7) <= latestMonth(), NOT_FUTURE),
    category: z.enum(COST_CATEGORIES),
    description: text(500),
    amount: money.refine((n) => n > 0, 'Amount must be more than zero'),
    /**
     * Left out, a cost is spread over the legal maximum where spreading applies.
     * Any year count up to the longest the rules ever allow is stored; the rules
     * of the cost's year narrow it when it is used (and the migration's own
     * check holds the number to 1–10: widen it if the law ever does).
     */
    spreadYears: z
      .number()
      .int()
      .min(1)
      .max(Math.max(...RULES.map(([, r]) => r.improvement.maxYears)))
      .optional(),
  })
  .strict();

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    sharePct: percent.refine((n) => n > 0, 'Share must be more than zero'),
  })
  .strict();

export const sharesSchema = z
  .object({
    owners: z.array(z.object({ userId: z.string().min(1), sharePct: percent }).strict()).max(100),
    invites: z
      .array(z.object({ id: z.uuid(), sharePct: percent.refine((n) => n > 0, 'Share must be more than zero') }).strict())
      .max(100),
  })
  .strict();

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * A receipt photo as the browser produced it. Only raster image types: an SVG
 * served back from this origin could carry script.
 */
export const receiptSchema = z
  .object({ dataUrl: z.string().max(4_000_000, 'Photo is too large').regex(IMAGE_DATA_URL, 'Not a JPEG, PNG or WebP image') })
  .strict()
  .transform(({ dataUrl }) => {
    const [, contentType, base64] = IMAGE_DATA_URL.exec(dataUrl)!;
    return { contentType: contentType!, base64: base64! };
  });

