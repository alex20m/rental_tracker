# Rental Tracker (PWA)

Track a Finnish rental apartment: rent log, costs with receipt photos, and a one-click
rental income & expenses declaration package (PDF + CSV + receipts, zipped).

## Run

```bash
npm install
npm run dev        # development
npm run build      # production PWA in dist/ (host on any static server over HTTPS)
npm test           # tax calculation tests
```

Open the built app on your phone and use "Add to Home Screen" to install it.

## Pages

- **Overview** – rent received, deductible costs, taxable net income, estimated tax, occupancy, yield, monthly chart.
- **Rent log** – tap a month: paid (amount + received date), vacant, or unpaid.
- **Costs** – add costs by category with a receipt photo (camera or gallery).
- **Tax** – summary by Finnish form categories, warnings for missing data, and the **Generate declaration (.zip)** button.
- **Settings** – taxpayer, property, depreciation (poisto), JSON backup/restore.

## Tax logic (src/tax.ts)

- Rent counts in the year it was **received** (cash basis).
- Deductible: maintenance charge (hoitovastike), repairs, loan interest, insurance, letting agent fee, owner-paid utilities, other.
- **Not** deductible: financing charge (rahoitusvastike) – shown separately.
- Depreciation: optional, reducing balance (default 2.5%) on the depreciable share of the purchase price, less depreciation already taken.
- Estimated tax: 30% up to 30 000 €, 34% above (capital income only).

## Important

- This does **not** file anything with Vero; there is no public submission API. Copy the figures into OmaVero or attach the PDF.
- The rules are a simplified model. Verify categories, depreciation and rates on vero.fi (or with an accountant) before filing.
- Data is stored in the browser (localStorage + IndexedDB for receipts). Use **Settings → Export backup** regularly.
- No personal identity number is stored or needed.
