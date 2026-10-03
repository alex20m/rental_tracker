# Rental Tracker

Track Finnish rental apartments — rent log, costs with receipt photos, co-owners
and their ownership shares — and generate each owner's rental income & expenses
declaration package (PDF + CSV + receipts, zipped) for their own share.

## What it does

- **Accounts.** Email + password sign-in with Neon Auth. Email addresses are
  verified with a one-time code.
- **A portfolio per person.** Any number of apartments. The app always shows
  one apartment at a time; tap its name at the top to switch, add one, or open
  **All apartments** — your share of each, and your totals for the year with
  the capital income tax estimated on all of them together.
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
- **English, Swedish and Finnish.** Pick the language under **Menu** (or on the
  sign-in page). It defaults to the browser's language, is remembered on that
  device, and covers the whole interface. Server error messages, the PDF and the
  CSV stay as they are — the PDF follows the Finnish form. Strings live in
  `lib/i18n/` — English is the source, and the typecheck fails until a new
  string is translated into the other two.
- **Moving from the first version.** That version kept everything in one
  browser. Export a backup there, then use **Menu → Import backup** here:
  it becomes a new apartment with its rent log, costs and receipt photos.

## Using it

The top bar is always the same: the **apartment** you are looking at (tap to
switch or add one), the **tax year** (‹ ›), and your **menu**. Below it, four
sections:

- **Home** – net income for the year in one big number, with rent, deductions
  and estimated tax under it; a short to-do list of what is still missing;
  monthly chart; occupancy and yield; recent activity. For a co-owned apartment
  a toggle switches between *your share* (what you declare) and the *whole
  apartment*.
- **Rent** – tap a month to log it: paid (amount and received date are
  pre-filled), vacant, or unpaid.
- **Costs** – the **+** button adds a cost: amount, a category chip, optional
  description, date and receipt photo (camera or gallery).
- **Tax** – the figures by Finnish form category for your share (or the whole
  apartment), a checklist of anything to fix before filing — each item takes
  you to where it is fixed — and **Download declaration (.zip)**.

The **menu** holds your name on declarations, **Import backup**, **Apartment
settings** (owners & shares, inviting co-owners, property details,
depreciation (poisto), delete) and sign out.

Explanations are tucked behind small **ⓘ** icons instead of printed as grey
text: tap one to read it, tap anywhere else (or press Escape) to dismiss it.

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
  share; in **All apartments**, on the total of all your shares.

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
lib/i18n/                the English, Swedish and Finnish strings
lib/domain/              pure logic: types, tax, shares, request schemas, backup import
lib/portfolio.ts         every query; access is decided by apartment_owners in SQL
lib/auth.ts              the auth seam — Neon Auth once configured, anonymous before
lib/client/              browser-only: API client, PDF/zip generation
db/migrations/           numbered .sql files, applied during the deploy's build
tests/                   behaviour, against PGlite; plus the pipeline's own shape
AGENTS.md, .claude/      the workflow rules and skills agents follow here
```
