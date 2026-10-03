/**
 * Everything the app stores, behind one rule: **a user reaches an apartment
 * only through their own row in apartment_owners.** Each function takes the
 * acting user's id and checks ownership of the one apartment it touches, and
 * every child row (rent, cost, receipt, invite) is addressed through its
 * apartment, so an id copied from someone else's apartment matches nothing.
 *
 * "Not yours" and "does not exist" deliberately produce the same answer, so
 * probing ids tells an outsider nothing.
 *
 * Statements that move ownership shares around are written as single
 * statements, so the shares of an apartment never pass through a state where
 * they do not add up — Postgres runs one statement atomically, and the HTTP
 * driver the app uses has no multi-statement session to wrap in a transaction.
 */

import type {
  ApartmentSettings,
  ApartmentView,
  CostCategory,
  CostEntry,
  Owner,
  PendingInvite,
  PortfolioItem,
  RentEntry,
  RentStatus,
} from '@/lib/domain/types';

/** Just enough of a Postgres client: Neon's HTTP driver in the app, PGlite in tests. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Actor {
  userId: string;
  email: string;
}

export type CostInput = Omit<CostEntry, 'id' | 'hasReceipt'>;
export type RentInput = Omit<RentEntry, 'month'>;
export type Receipt = { contentType: string; base64: string };
export type ShareAssignment = {
  owners: { userId: string; sharePct: number }[];
  invites: { id: string; sharePct: number }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from URLs. Anything that is not a uuid cannot name a row. */
export const isUuid = (id: string) => UUID.test(id);

const SETTINGS_COLUMNS = `
  a.name,
  a.address,
  a.housing_company       as "housingCompany",
  coalesce(a.purchase_date::text, '') as "purchaseDate",
  a.purchase_price::float8     as "purchasePrice",
  a.building_share_pct::float8 as "buildingSharePct",
  a.depreciation_rate::float8  as "depreciationRate",
  a.depreciation_prior::float8 as "depreciationPrior",
  a.use_depreciation      as "useDepreciation",
  a.monthly_rent::float8  as "monthlyRent"`;

const SETTINGS_FIELDS: Record<keyof ApartmentSettings, string> = {
  name: 'name',
  address: 'address',
  housingCompany: 'housing_company',
  purchaseDate: 'purchase_date',
  purchasePrice: 'purchase_price',
  buildingSharePct: 'building_share_pct',
  depreciationRate: 'depreciation_rate',
  depreciationPrior: 'depreciation_prior',
  useDepreciation: 'use_depreciation',
  monthlyRent: 'monthly_rent',
};

const toDbValue = (key: keyof ApartmentSettings, value: unknown) =>
  key === 'purchaseDate' && value === '' ? null : value;

/** Ownership shares are compared in hundredths, never as floats. */
const cents = (pct: number) => Math.round(pct * 100);

export function portfolio(db: Queryable) {
  async function myShare(userId: string, apartmentId: string): Promise<number | null> {
    if (!isUuid(apartmentId)) return null;
    const rows = await db.query<{ share: number }>(
      'select share_pct::float8 as share from apartment_owners where apartment_id = $1 and user_id = $2',
      [apartmentId, userId],
    );
    return rows[0]?.share ?? null;
  }

  const owns = async (userId: string, apartmentId: string) => (await myShare(userId, apartmentId)) !== null;

  return {
    /**
     * Turns invites addressed to this user's email into ownership. Call only
     * with an email the auth provider has verified — anyone can type any
     * address at sign-up, and an unverified one would let them claim an
     * apartment shared with somebody else.
     */
    async claimInvites(actor: Actor): Promise<number> {
      const rows = await db.query(
        `with claimed as (
           delete from apartment_invites where email = lower($2)
           returning apartment_id, share_pct
         )
         insert into apartment_owners (apartment_id, user_id, email, share_pct)
         select apartment_id, $1, lower($2), share_pct from claimed
         on conflict (apartment_id, user_id)
           do update set share_pct = least(apartment_owners.share_pct + excluded.share_pct, 100)
         returning apartment_id`,
        [actor.userId, actor.email],
      );
      return rows.length;
    },

    async list(userId: string): Promise<PortfolioItem[]> {
      return db.query<PortfolioItem>(
        `select a.id, a.name, a.address,
                o.share_pct::float8 as "mySharePct",
                (select count(*)::int from apartment_owners x where x.apartment_id = a.id) as "ownerCount"
           from apartment_owners o
           join apartments a on a.id = o.apartment_id
          where o.user_id = $1
          order by a.created_at, a.id`,
        [userId],
      );
    },

    async create(actor: Actor, settings: ApartmentSettings): Promise<string> {
      const keys = Object.keys(SETTINGS_FIELDS) as (keyof ApartmentSettings)[];
      const columns = keys.map((k) => SETTINGS_FIELDS[k]);
      const values = keys.map((k) => toDbValue(k, settings[k]));
      const placeholders = keys.map((_, i) => `$${i + 3}`);
      const rows = await db.query<{ id: string }>(
        `with a as (
           insert into apartments (created_by, ${columns.join(', ')})
           values ($1, ${placeholders.join(', ')})
           returning id
         )
         insert into apartment_owners (apartment_id, user_id, email, share_pct)
         select id, $1, lower($2), 100 from a
         returning apartment_id as id`,
        [actor.userId, actor.email, ...values],
      );
      return rows[0]!.id;
    },

    async get(userId: string, apartmentId: string): Promise<ApartmentView | null> {
      const share = await myShare(userId, apartmentId);
      if (share === null) return null;

      const [settingsRows, owners, invites, rents, costs] = await Promise.all([
        db.query<ApartmentSettings>(`select ${SETTINGS_COLUMNS} from apartments a where a.id = $1`, [apartmentId]),
        db.query<Owner>(
          `select user_id as "userId", email, share_pct::float8 as "sharePct"
             from apartment_owners where apartment_id = $1 order by joined_at, user_id`,
          [apartmentId],
        ),
        db.query<PendingInvite>(
          `select id, email, share_pct::float8 as "sharePct"
             from apartment_invites where apartment_id = $1 order by created_at, id`,
          [apartmentId],
        ),
        db.query<RentEntry>(
          `select month, status, amount::float8 as amount,
                  coalesce(received_date::text, '') as "receivedDate", note
             from rents where apartment_id = $1 order by month`,
          [apartmentId],
        ),
        db.query<CostEntry>(
          `select c.id, c.date::text as date, c.category, c.description, c.amount::float8 as amount,
                  exists (select 1 from receipts r where r.cost_id = c.id) as "hasReceipt"
             from costs c where c.apartment_id = $1 order by c.date, c.created_at`,
          [apartmentId],
        ),
      ]);
      const settings = settingsRows[0];
      if (!settings) return null;

      return { id: apartmentId, settings, owners, invites, rents, costs, mySharePct: share };
    },

    async updateSettings(userId: string, apartmentId: string, patch: Partial<ApartmentSettings>): Promise<boolean> {
      if (!(await owns(userId, apartmentId))) return false;
      const keys = (Object.keys(patch) as (keyof ApartmentSettings)[]).filter((k) => k in SETTINGS_FIELDS);
      if (keys.length === 0) return true;
      const assignments = keys.map((k, i) => `${SETTINGS_FIELDS[k]} = $${i + 2}`);
      await db.query(`update apartments set ${assignments.join(', ')} where id = $1`, [
        apartmentId,
        ...keys.map((k) => toDbValue(k, patch[k])),
      ]);
      return true;
    },

    /**
     * Deleting removes the apartment for every owner, so only someone who owns
     * it alone may do it. With co-owners, they leave instead.
     */
    async remove(userId: string, apartmentId: string): Promise<'deleted' | 'not_found' | 'has_co_owners'> {
      if (!(await owns(userId, apartmentId))) return 'not_found';
      const rows = await db.query(
        `delete from apartments a
          where a.id = $1
            and not exists (select 1 from apartment_owners o where o.apartment_id = a.id and o.user_id <> $2)
          returning a.id`,
        [apartmentId, userId],
      );
      return rows.length ? 'deleted' : 'has_co_owners';
    },

    async putRent(userId: string, apartmentId: string, month: string, rent: RentInput): Promise<boolean> {
      if (!(await owns(userId, apartmentId))) return false;
      const paid = rent.status === 'paid';
      await db.query(
        `insert into rents (apartment_id, month, status, amount, received_date, note)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (apartment_id, month) do update
           set status = excluded.status, amount = excluded.amount,
               received_date = excluded.received_date, note = excluded.note`,
        [apartmentId, month, rent.status, paid ? rent.amount : 0, paid ? rent.receivedDate : null, rent.note],
      );
      return true;
    },

    async deleteRent(userId: string, apartmentId: string, month: string): Promise<boolean> {
      if (!(await owns(userId, apartmentId))) return false;
      await db.query('delete from rents where apartment_id = $1 and month = $2', [apartmentId, month]);
      return true;
    },

    async createCost(userId: string, apartmentId: string, cost: CostInput): Promise<string | null> {
      if (!(await owns(userId, apartmentId))) return null;
      const rows = await db.query<{ id: string }>(
        `insert into costs (apartment_id, date, category, description, amount)
         values ($1, $2, $3, $4, $5) returning id`,
        [apartmentId, cost.date, cost.category, cost.description, cost.amount],
      );
      return rows[0]!.id;
    },

    async updateCost(userId: string, apartmentId: string, costId: string, cost: CostInput): Promise<boolean> {
      if (!isUuid(costId) || !(await owns(userId, apartmentId))) return false;
      const rows = await db.query(
        `update costs set date = $3, category = $4, description = $5, amount = $6
          where id = $1 and apartment_id = $2 returning id`,
        [costId, apartmentId, cost.date, cost.category, cost.description, cost.amount],
      );
      return rows.length > 0;
    },

    async deleteCost(userId: string, apartmentId: string, costId: string): Promise<boolean> {
      if (!isUuid(costId) || !(await owns(userId, apartmentId))) return false;
      const rows = await db.query('delete from costs where id = $1 and apartment_id = $2 returning id', [
        costId,
        apartmentId,
      ]);
      return rows.length > 0;
    },

    async putReceipt(userId: string, apartmentId: string, costId: string, receipt: Receipt): Promise<boolean> {
      if (!isUuid(costId) || !(await owns(userId, apartmentId))) return false;
      const rows = await db.query(
        `insert into receipts (cost_id, content_type, data)
         select c.id, $3, decode($4, 'base64') from costs c where c.id = $1 and c.apartment_id = $2
         on conflict (cost_id) do update set content_type = excluded.content_type, data = excluded.data
         returning cost_id`,
        [costId, apartmentId, receipt.contentType, receipt.base64],
      );
      return rows.length > 0;
    },

    async getReceipt(userId: string, apartmentId: string, costId: string): Promise<Receipt | null> {
      if (!isUuid(costId) || !(await owns(userId, apartmentId))) return null;
      const rows = await db.query<Receipt>(
        `select r.content_type as "contentType", encode(r.data, 'base64') as base64
           from receipts r join costs c on c.id = r.cost_id
          where c.id = $1 and c.apartment_id = $2`,
        [costId, apartmentId],
      );
      // Postgres wraps base64 output at 76 characters; a data URL must not.
      return rows[0] ? { ...rows[0], base64: rows[0].base64.replace(/\s+/g, '') } : null;
    },

    async deleteReceipt(userId: string, apartmentId: string, costId: string): Promise<boolean> {
      if (!isUuid(costId) || !(await owns(userId, apartmentId))) return false;
      await db.query(
        'delete from receipts r using costs c where r.cost_id = c.id and c.id = $1 and c.apartment_id = $2',
        [costId, apartmentId],
      );
      return true;
    },

    /**
     * Shares the apartment with an email address, moving `sharePct` of the
     * inviter's own share to the invite. Taking it from the inviter keeps the
     * apartment's shares at 100% throughout; they can be rebalanced afterwards
     * with setShares.
     */
    async invite(
      actor: Actor,
      apartmentId: string,
      invite: { email: string; sharePct: number },
    ): Promise<
      | { ok: true; id: string }
      | { ok: false; reason: 'not_found' | 'self' | 'already_owner' | 'already_invited' | 'insufficient_share' }
    > {
      const share = await myShare(actor.userId, apartmentId);
      if (share === null) return { ok: false, reason: 'not_found' };
      // How much the inviter can give away is decided by the update below,
      // against the share as it is at that moment, not as it was read here.
      const email = invite.email.toLowerCase();
      if (email === actor.email.toLowerCase()) return { ok: false, reason: 'self' };

      const [existing] = await db.query<{ owner: boolean; invited: boolean }>(
        `select exists (select 1 from apartment_owners where apartment_id = $1 and email = $2) as owner,
                exists (select 1 from apartment_invites where apartment_id = $1 and email = $2) as invited`,
        [apartmentId, email],
      );
      if (existing?.owner) return { ok: false, reason: 'already_owner' };
      if (existing?.invited) return { ok: false, reason: 'already_invited' };

      try {
        // One statement: if the insert fails (a concurrent invite for the same
        // email), the share taken from the inviter is rolled back with it.
        const rows = await db.query<{ id: string }>(
          `with taken as (
             update apartment_owners set share_pct = share_pct - $4
              where apartment_id = $1 and user_id = $2 and share_pct >= $4
             returning apartment_id
           )
           insert into apartment_invites (apartment_id, email, share_pct, invited_by)
           select apartment_id, $3, $4, $2 from taken
           returning id`,
          [apartmentId, actor.userId, email, invite.sharePct],
        );
        if (!rows[0]) return { ok: false, reason: 'insufficient_share' };
        return { ok: true, id: rows[0].id };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return { ok: false, reason: 'already_invited' };
        throw error;
      }
    },

    /**
     * Withdraws a pending invite. Its share goes back to whoever sent it, or to
     * the person withdrawing it if the sender is no longer an owner.
     */
    async revokeInvite(userId: string, apartmentId: string, inviteId: string): Promise<boolean> {
      if (!isUuid(inviteId) || !(await owns(userId, apartmentId))) return false;
      const rows = await db.query(
        `with gone as (
           delete from apartment_invites where id = $1 and apartment_id = $2
           returning share_pct, invited_by
         ),
         returned as (
           update apartment_owners o set share_pct = least(o.share_pct + gone.share_pct, 100)
             from gone
            where o.apartment_id = $2
              and o.user_id = case
                    when exists (select 1 from apartment_owners x
                                  where x.apartment_id = $2 and x.user_id = gone.invited_by)
                    then gone.invited_by else $3 end
           returning o.user_id
         )
         select (select count(*)::int from gone) as removed`,
        [inviteId, apartmentId, userId],
      );
      return (rows[0] as { removed: number } | undefined)?.removed === 1;
    },

    /**
     * Sets every owner's and invite's share at once. The assignment must name
     * exactly the apartment's current owners and invites — so a stale form
     * cannot silently drop someone — and add up to exactly 100%.
     */
    async setShares(
      userId: string,
      apartmentId: string,
      shares: ShareAssignment,
    ): Promise<'ok' | 'not_found' | 'stale' | 'bad_total'> {
      if (!(await owns(userId, apartmentId))) return 'not_found';

      const total = [...shares.owners, ...shares.invites].reduce((a, s) => a + cents(s.sharePct), 0);
      if (total !== 10000) return 'bad_total';

      const current = await db.query<{ kind: 'owner' | 'invite'; key: string }>(
        `select 'owner' as kind, user_id as key from apartment_owners where apartment_id = $1
         union all
         select 'invite', id::text from apartment_invites where apartment_id = $1`,
        [apartmentId],
      );
      const want = new Set([
        ...shares.owners.map((o) => `owner:${o.userId}`),
        ...shares.invites.map((i) => `invite:${i.id}`),
      ]);
      const have = new Set(current.map((c) => `${c.kind}:${c.key}`));
      const sameSet =
        want.size === have.size &&
        want.size === shares.owners.length + shares.invites.length &&
        [...want].every((k) => have.has(k));
      if (!sameSet) return 'stale';

      await db.query(
        `with o as (
           update apartment_owners a set share_pct = v.share_pct
             from jsonb_to_recordset($2::jsonb) as v(user_id text, share_pct numeric)
            where a.apartment_id = $1 and a.user_id = v.user_id
           returning 1
         ),
         i as (
           update apartment_invites a set share_pct = v.share_pct
             from jsonb_to_recordset($3::jsonb) as v(id uuid, share_pct numeric)
            where a.apartment_id = $1 and a.id = v.id
           returning 1
         )
         select (select count(*) from o) as owners, (select count(*) from i) as invites`,
        [
          apartmentId,
          JSON.stringify(shares.owners.map((o) => ({ user_id: o.userId, share_pct: o.sharePct }))),
          JSON.stringify(shares.invites.map((i) => ({ id: i.id, share_pct: i.sharePct }))),
        ],
      );
      return 'ok';
    },

    /**
     * Removes an owner — another one, or yourself to leave. Only an owner whose
     * share is already 0% can be removed, so the shares never stop adding up to
     * 100% and nobody's part of the apartment disappears without being given
     * to someone first. The last owner cannot leave; they delete instead.
     */
    async removeOwner(
      userId: string,
      apartmentId: string,
      ownerId: string,
    ): Promise<'ok' | 'not_found' | 'has_share' | 'last_owner'> {
      if (!(await owns(userId, apartmentId))) return 'not_found';
      const [target] = await db.query<{ owners: number }>(
        `select (select count(*)::int from apartment_owners where apartment_id = $1) as owners
           from apartment_owners where apartment_id = $1 and user_id = $2`,
        [apartmentId, ownerId],
      );
      if (!target) return 'not_found';
      if (target.owners < 2) return 'last_owner';

      const rows = await db.query(
        `delete from apartment_owners
          where apartment_id = $1 and user_id = $2 and share_pct = 0
            and (select count(*) from apartment_owners where apartment_id = $1) > 1
          returning user_id`,
        [apartmentId, ownerId],
      );
      return rows.length ? 'ok' : 'has_share';
    },

    async profile(userId: string): Promise<{ taxpayerName: string }> {
      const rows = await db.query<{ taxpayerName: string }>(
        'select taxpayer_name as "taxpayerName" from user_profiles where user_id = $1',
        [userId],
      );
      return rows[0] ?? { taxpayerName: '' };
    },

    async setProfile(userId: string, profile: { taxpayerName: string }): Promise<void> {
      await db.query(
        `insert into user_profiles (user_id, taxpayer_name) values ($1, $2)
         on conflict (user_id) do update set taxpayer_name = excluded.taxpayer_name, updated_at = now()`,
        [userId, profile.taxpayerName],
      );
    },


    /**
     * Erases the account and everything that is only theirs. Apartments they
     * own alone are deleted (rents, costs and receipts cascade). In an
     * apartment with co-owners their share goes to the co-owner holding the
     * most, so the shares still add up to 100 and nobody else loses access.
     * Invites addressed to them and their profile go too; the sign-in identity
     * goes last, so a failure part-way leaves an account that can retry.
     */
    async deleteAccount(actor: Actor): Promise<void> {
      const { userId, email } = actor;
      await db.query(
        `delete from apartments a
          where exists (select 1 from apartment_owners o where o.apartment_id = a.id and o.user_id = $1)
            and not exists (select 1 from apartment_owners o where o.apartment_id = a.id and o.user_id <> $1)`,
        [userId],
      );
      await db.query(
        `with leaving as (
           select apartment_id, share_pct from apartment_owners where user_id = $1
         ), heirs as (
           select distinct on (o.apartment_id) o.apartment_id, o.user_id
             from apartment_owners o join leaving l using (apartment_id)
            where o.user_id <> $1
            order by o.apartment_id, o.share_pct desc, o.joined_at, o.user_id
         )
         update apartment_owners o set share_pct = o.share_pct + l.share_pct
           from heirs h join leaving l using (apartment_id)
          where o.apartment_id = h.apartment_id and o.user_id = h.user_id`,
        [userId],
      );
      await db.query('delete from apartment_owners where user_id = $1', [userId]);
      await db.query('delete from apartment_invites where email = lower($1)', [email]);
      await db.query('delete from user_profiles where user_id = $1', [userId]);

      // Identity lives in the neon_auth schema of this same database; it is
      // absent on a plain Postgres. Its session and account rows cascade.
      const [auth] = await db.query<{ present: boolean }>(`select to_regclass('neon_auth."user"') is not null as present`);
      if (auth?.present) await db.query('delete from neon_auth."user" where id = $1', [userId]);
    },
  };
}

export type Portfolio = ReturnType<typeof portfolio>;
export type { CostCategory, RentStatus };
