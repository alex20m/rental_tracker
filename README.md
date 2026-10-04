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
- **English, Swedish and Finnish.** Pick the language under **Account settings** (or on the sign-in page). It defaults to the browser's language, is remembered on that
  device, and covers the whole interface. Server error messages, the PDF and the
  CSV stay as they are — the PDF follows the Finnish form. Strings live in
  `lib/i18n/` — English is the source, and the typecheck fails until a new
  string is translated into the other two.

## Using it

Two levels, one **menu**. The ☰ in the top bar opens a drawer (from 960 px wide it
is a permanent sidebar) with every place in the app: first the open apartment's
own — **Home**, **Rent & costs**, **Tax**, **Apartment settings** — under its name,
then, after a divider, what is about you rather than an apartment — **All
apartments** (the portfolio: your totals, one row per apartment, **New
apartment**) and **Account settings** (who you are, language, sign out, delete
account). Nothing floats over the page while you read it. The top bar shows the
apartment's name and, quietly at the right, the **tax year** — a plain list of the
years that have data, since it is rarely changed; it is left out on pages that
have no figures. Everything about an apartment:

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
  and receipt photo (camera or gallery). A basic improvement of a flat also asks
  how many years to spread it over, and a trip by car asks for the kilometres.
- **Tax** – a **This year | All years** switch at the top. *This year*: the
  figures by Finnish form category for your share (or the whole apartment), a
  checklist of anything to fix before filing — each item takes you to where it
  is fixed — and **Download declaration (.zip)**. *All years*: every year of the
  apartment side by side, newest first, with the combined net income of all
  years; tap a year to open its tax summary.
- **Apartment settings** – a short list of topics, each opening on its own with a ‹ back:
  *Owners* (shares, inviting co-owners, leaving), *Property details* (flat or
  property, how the financing charge is booked, price, usual rent, how much of
  the home is let and whether the rent is below the usual, the furniture
  deduction: actual cost or flat rate) and *Building depreciation* (poisto, for
  a property: kind of building, purchase costs, where the count starts). Changes to the last two are
  kept while you move between topics and saved from one bar. Deleting the
  apartment is at the bottom of the list.

The name printed on the declaration is the one given when the account was
created (it is required there); there is nothing to fill in separately.

Explanations are tucked behind small **ⓘ** icons instead of printed as grey
text: tap one to read it, tap anywhere else (or press Escape) to dismiss it.

## Tax logic (`lib/domain/tax.ts`)

Every number the law or the Tax Administration sets — the rates, limits, amounts
per month and per kilometre — is in **one file, `lib/domain/taxRules.ts`**, by
tax year. Nothing else writes one out: the calculations, the screens, the
explanations behind the ⓘ icons and the PDF all read them from there. A new
year's rules are one new entry in that file; where each figure comes from, and
when it was last checked against vero.fi, Verohallinto's detailed guidance and
Finlex, is in
[`docs/finnish-rental-tax-rules.md`](docs/finnish-rental-tax-rules.md), and the
`update-tax-rules` skill is the checklist for doing it.

The rules follow vero.fi. Each apartment is either a **housing-company flat**
(osakehuoneisto, form 7H — the default) or a **property of one's own**
(kiinteistö, form 7K).

- Rent counts in the year it was **received** (cash basis).
- Deducted in the year paid: maintenance and water charges, annual repairs
  (vuosikorjaukset), insurance, letting agent fees and ads, travel, owner-paid
  utilities, property tax, other.
- **Financing charge** (rahoitusvastike): deductible only if the housing company
  books it as income (a per-apartment setting, off by default). A funded charge
  is not deductible — it adds to the acquisition cost.
- **Basic improvement** (perusparannus) of a **flat**: deducted in equal parts
  from the year paid, over as many years as it lasts (3–10, chosen per cost). Of a
  **property's building**: added to the building's cost and depreciated with it,
  not spread.
- **Furniture & appliances**: up to 1 200 €, or lasting under 3 years, deducted
  at once; dearer items at 25 % of the remaining value a year, and the whole
  remainder once 1 200 € or less is left. Alternatively a furnished flat takes
  the **flat rate** per month it was let (40 € for a studio or one room, 60 €
  for a larger flat), which covers all furniture.
- **Travel** by one's own car: enter the kilometres and the amount is worked out
  at the rate of the year (0.27 €/km; the higher figure quoted for 2026 is what
  an employer may pay tax-free, not a landlord's deduction).
- **Loan interest** lowers the net income but is declared with the interest
  deductions in OmaVero, not on the rental form; the PDF lists it separately.
- **Building depreciation**: only for a property of one's own — the highest
  rate for the kind of building (4 % residential or office, 7 % shop, warehouse,
  factory, workshop; any lower rate may be claimed) on what is left of the
  building's cost: its part of the price and purchase costs plus improvements,
  less what was deducted before. It goes down year by year from the first year
  counted (the year of the first rent logged unless set). The price of a
  housing-company flat is never depreciated.
- **Rent below the usual** (per apartment): costs and depreciation together may
  not exceed the rent, no loss arises, and loan interest is not deductible.
- **Only part of the home let** (per apartment, a percentage): the costs of the
  whole home — charges, insurance, utilities, property tax, interest and
  depreciation — count by that share; repairs, furniture, travel and agent fees
  count in full.
- A **rental loss** shows the **deficit credit** (alijäämähyvitys): 30 % of the
  deficit, at most 1 400 € (more with minor children), taken off the tax on
  earned income. It is the most it can be — other capital income and the tax
  there is to take it from also matter.
- Each owner's figures are the apartment's figures × their ownership %, rounded
  to the cent line by line.
- Estimated tax: 30 % up to 30 000 €, 34 % above (capital income only), on your
  share; in **All apartments**, on the total of all your shares. The same rates
  apply to an owner who lives abroad; the 35 % source tax is on wages, not rent.

### The declaration PDF

The PDF is laid out like **form 7H** or **form 7K**: the same row numbers
(2.1–2.5, or 2 and 3.1–3.5 with the depreciation tables 4.1–4.6), the form's own
Finnish row names beneath each, and your share of each amount — so the numbers
can be copied straight onto the form or into the matching OmaVero fields (OmaVero
has no numbered forms). Under row 2.5 / 3.2 it lists what the amount is made of.
It also gives the period the flat was let, the schedule of improvements being
deducted over several years, and the inventory of furniture the law asks for. It
stays in English with the Finnish names of the form's rows.

## Important

- This does **not** file anything with Vero; there is no public submission API.
  Copy the figures into OmaVero or attach the PDF.
- The rules are a simplified model. Not modelled: estates (dödsbo), tax
  partnerships (a jointly owned farm or forest), rental from abroad, short-term
  and sporadic rental of one's own home, a housing company that books only part
  of a financing charge as income (log only that part), and the deficit credit's
  dependence on your other capital income and on how much tax there is to take it
  from. Verify categories, depreciation and rates on vero.fi (or with an
  accountant) before filing; the rules and the places they are still uncertain
  are in `docs/finnish-rental-tax-rules.md`.
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
lib/domain/              pure logic: types, tax, the rules by year (taxRules.ts), form figures, request schemas
lib/portfolio.ts         every query; access is decided by apartment_owners in SQL
lib/auth.ts              the auth seam — Neon Auth once configured, anonymous before
lib/client/              browser-only: API client, PDF/zip generation
db/migrations/           numbered .sql files, applied during the deploy's build
tests/                   behaviour, against PGlite; plus the pipeline's own shape
e2e/                     Playwright: the UI in a real browser, gated at 100 % coverage
docs/                    the verified Finnish rental income rules and their sources
AGENTS.md, .claude/      the workflow rules and skills agents follow here
```
