# Rental Tracker

Track Finnish rental apartments — rent log, costs with receipt photos, co-owners
and their ownership shares — and generate each owner's rental income & expenses
declaration package (PDF + CSV + receipts, zipped) for their own share.

## What it does

- **Accounts.** Email + password sign-in with Neon Auth. Email addresses are
  verified with a one-time code.
- **A portfolio per person.** Any number of apartments. The app always shows
  one apartment at a time. The **portfolio** page lists them all, with your
  share of each and your totals for the year (capital income tax estimated on
  all of them together); open one from there, and add a new one there — only
  there. Inside an apartment, the ‹ at the top goes back to the portfolio.
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
- **English, Swedish and Finnish.** Pick the language under the account **Menu** on the portfolio page (or on the
  sign-in page). It defaults to the browser's language, is remembered on that
  device, and covers the whole interface. Server error messages, the PDF and the
  CSV stay as they are — the PDF follows the Finnish form. Strings live in
  `lib/i18n/` — English is the source, and the typecheck fails until a new
  string is translated into the other two.

## Using it

Two levels. The **portfolio** page lists your apartments and has **New
apartment** and the round **account menu** (who you are, language, sign out,
delete account). Open an apartment and the top bar shows its name, a ‹ back to
the portfolio, and the **tax year** (‹ ›). Everything about that apartment is in
the bottom navigation, four places and nothing hidden behind other buttons:

- **Home** – a glance, not a report: net income for the year in one big number,
  with rent, deductions and estimated tax under it; the first three things still
  missing (the rest are counted and lead to the Tax checklist), or — once nothing
  is missing — a button to prepare the declaration; a monthly chart, occupancy
  and yield, and the three latest entries. While nothing is logged for the year
  it shows only the number and how to start. For a co-owned apartment
  a toggle switches between *your share* (what you declare) and the *whole
  apartment*.
- **Rent & costs** – one place for what comes in and goes out, with a
  **Rent | Costs** switch at the top. *Rent*: tap a month to log it: paid
  (amount and received date are pre-filled), vacant, or unpaid. *Costs*: the
  **+** button adds a cost: amount, a category chip, optional description, date
  and receipt photo (camera or gallery). A basic improvement also asks how many
  years to spread it over.
- **Tax** – a **This year | All years** switch at the top. *This year*: the
  figures by Finnish form category for your share (or the whole apartment), a
  checklist of anything to fix before filing — each item takes you to where it
  is fixed — and **Download declaration (.zip)**. *All years*: every year of the
  apartment side by side, newest first, with the combined net income of all
  years; tap a year to open its tax summary.
- **Settings** – a short list of topics, each opening on its own with a ‹ back:
  *Owners* (shares, inviting co-owners, leaving), *Property details* (flat or
  property, how the financing charge is booked, price, usual rent) and
  *Building depreciation* (poisto, for a property). Changes to the last two are
  kept while you move between topics and saved from one bar. Deleting the
  apartment is at the bottom of the list.

The name printed on the declaration is the one given when the account was
created (it is required there); there is nothing to fill in separately.

Explanations are tucked behind small **ⓘ** icons instead of printed as grey
text: tap one to read it, tap anywhere else (or press Escape) to dismiss it.

## Tax logic (`lib/domain/tax.ts`)

- Rent counts in the year it was **received** (cash basis).
The rules follow vero.fi's guidance on deductions from rental income. Each
apartment is either a **housing-company flat** (osakehuoneisto, form 7H — the
default) or a **property of one's own** (kiinteistö, form 7K).

- Deducted in the year paid: maintenance and water charges, annual repairs
  (vuosikorjaukset), insurance, letting agent fees and ads, travel, owner-paid
  utilities, property tax, other.
- **Financing charge** (rahoitusvastike): deductible only if the housing company
  books it as income (a per-apartment setting, off by default). A funded charge
  is not deductible — it adds to the acquisition cost.
- **Basic improvement** (perusparannus): deducted in equal parts over 10 years
  from the year paid, or over fewer (1–10, chosen per cost) if it lasts less.
- **Furniture & appliances**: up to 1 200 €, or lasting under 3 years, deducted
  at once; dearer items at 25 % of the remaining value a year.
- **Loan interest** lowers the net income but is declared with the interest
  deductions in OmaVero, not on the rental form; the PDF lists it separately.
- **Building depreciation**: only for a property of one's own — reducing
  balance (default 4 %, the maximum for a residential building) on the
  building's part of the purchase price, less depreciation already taken. The
  price of a housing-company flat is never depreciated.
- Each owner's figures are the apartment's figures × their ownership %, rounded
  to the cent line by line.
- Estimated tax: 30 % up to 30 000 €, 34 % above (capital income only), on your
  share; in **All apartments**, on the total of all your shares.

## Important

- This does **not** file anything with Vero; there is no public submission API.
  Copy the figures into OmaVero or attach the PDF.
- The rules are a simplified model. Not modelled: below-market rent (for
  example to a relative, where deductions cannot exceed the rent), partly
  private use, and a rental from abroad. Verify categories, depreciation and
  rates on vero.fi (or with an accountant) before filing.
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
npx playwright install chromium   # once
npm run test:e2e
```

`npm test` runs against a real Postgres in process (PGlite) with the real
migrations applied, so it needs no database or credentials.

`npm run test:e2e` builds the app with source maps and drives it in Chromium
with Playwright, the API answered by an in-memory fake (`e2e/fakeApi.ts`). It
**fails unless every module that runs in the browser is 100 % covered** —
statements, branches, functions and lines; the report is in
`coverage-e2e/index.html`, and the failure names the lines and branches still
missing. Where Chromium is pre-installed elsewhere, point
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it.

## The shape

```
app/                     Next.js App Router: pages and API routes
  api/apartments/…       the portfolio API — every route resolves the session first
  api/auth/[...path]/    Neon Auth's endpoints, proxied
components/              the client UI (one client app + the sign-in page)
lib/i18n/                the English, Swedish and Finnish strings
lib/domain/              pure logic: types, tax, shares, request schemas
lib/portfolio.ts         every query; access is decided by apartment_owners in SQL
lib/auth.ts              the auth seam — Neon Auth once configured, anonymous before
lib/client/              browser-only: API client, PDF/zip generation
db/migrations/           numbered .sql files, applied during the deploy's build
tests/                   behaviour, against PGlite; plus the pipeline's own shape
e2e/                     Playwright: the UI in a real browser, gated at 100 % coverage
AGENTS.md, .claude/      the workflow rules and skills agents follow here
```
