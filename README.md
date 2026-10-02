# Rental Tracker

Track Finnish rental apartments — rent log, costs with receipt photos, co-owners
and their ownership shares — and generate each owner's rental income & expenses
declaration package (PDF + CSV + receipts, zipped) for their own share.

## What it does

- **Accounts.** Email + password sign-in with Neon Auth. Email addresses are
  verified with a one-time code.
- **A portfolio per person.** Any number of apartments. The Portfolio tab
  shows each one with your share, and your totals for the year with the
  capital income tax estimated on all of them together.
- **Sharing one apartment.** In an apartment's settings, share it with another
  owner's email and choose their percentage; it is taken from your own share.
  They get that apartment — and only that one — the next time they sign in
  with that email, once it is verified. Your other apartments stay private.
- **Ownership shares.** Owners can rebalance the percentages at any time; they
  must add up to exactly 100 %. An owner whose share is 0 % can be removed (or
  leave). Only an apartment's sole owner can delete it.
- **Per-owner tax.** Rent and costs are logged for the whole apartment. The Tax
  tab, the PDF and the CSV show the apartment total next to your share, and the
  share is what you declare.
- **Moving from the first version.** That version kept everything in one
  browser. Export a backup there, then use **Portfolio → Import backup** here:
  it becomes a new apartment with its rent log, costs and receipt photos.

## Pages

- **Portfolio** – your apartments, your share of the year's figures, add an
  apartment, your name on declarations, import a backup, sign out.
- **Overview** – rent received, deductible costs, net income (whole apartment
  and your share), occupancy, yield, monthly chart.
- **Rent log** – tap a month: paid (amount + received date), vacant, or unpaid.
- **Costs** – costs by category with a receipt photo (camera or gallery).
- **Tax** – summary by Finnish form categories with your share, warnings for
  missing data, and **Generate declaration (.zip)**.
- **Apartment settings** (gear) – owners & shares, sharing by email, property
  details, depreciation (poisto), delete.

## Tax logic (`lib/domain/tax.ts`)

- Rent counts in the year it was **received** (cash basis).
- Deductible: maintenance charge (hoitovastike), repairs, loan interest,
  insurance, letting agent fee, owner-paid utilities, other.
- **Not** deductible: financing charge (rahoitusvastike) — shown separately.
- Depreciation: optional, reducing balance (default 2.5 %) on the depreciable
  share of the whole apartment's purchase price, less depreciation already taken.
- Each owner's figures are the apartment's figures × their ownership %, rounded
  to the cent line by line.
- Estimated tax: 30 % up to 30 000 €, 34 % above (capital income only), on your
  share; on the Portfolio tab, on the total of all your shares.

## Important

- This does **not** file anything with Vero; there is no public submission API.
  Copy the figures into OmaVero or attach the PDF.
- The rules are a simplified model. Verify categories, depreciation and rates on
  vero.fi (or with an accountant) before filing.
- No personal identity number is stored or needed.

## Running it

Stack: Next.js + TypeScript on Vercel, Neon Postgres, Neon Auth. Provisioning
is in [`SETUP.md`](SETUP.md).

```bash
npm install
npx vercel env pull .env.local   # once the Vercel project exists
npm run migrate
npm run dev                      # http://localhost:3000
```

The full check set, exactly what CI runs:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

The tests run against a real Postgres in process (PGlite) with the real
migrations applied, so they need no database or credentials.

## The shape

```
app/                     Next.js App Router: pages and API routes
  api/apartments/…       the portfolio API — every route resolves the session first
  api/auth/[...path]/    Neon Auth's endpoints, proxied
components/              the client UI (one client app + the sign-in page)
lib/domain/              pure logic: types, tax, shares, request schemas, backup import
lib/portfolio.ts         every query; access is decided by apartment_owners in SQL
lib/auth.ts              the auth seam — Neon Auth once configured, anonymous before
lib/client/              browser-only: API client, PDF/zip generation
db/migrations/           numbered .sql files, applied during the deploy's build
tests/                   behaviour, against PGlite; plus the pipeline's own shape
AGENTS.md, .claude/      the workflow rules and skills agents follow here
```
