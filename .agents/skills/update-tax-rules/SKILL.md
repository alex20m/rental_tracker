---
name: update-tax-rules
description: >-
  Change the Finnish rental income rules this app applies — when a new tax year's
  rates, limits or amounts are published, when vero.fi changes a rule, or when a
  figure in the app is doubted. Covers where every legal number lives, which
  sources to read and how to read them reliably (fetching the page itself, not a
  summary of it), the traps that have already given wrong numbers, and the
  checklist of files that change with a rule.
---

# Updating the tax rules

Every rate, limit and amount the law or the Tax Administration sets is in
`lib/domain/taxRules.ts`, by tax year, and nowhere else: the calculations, the
screens, the ⓘ explanations (`lib/ui/ruleParams.ts` fills `{limit}`-style
placeholders in the messages) and the PDF read it from there. What is not a
number — which costs go on which row, who may depreciate what — is code in
`lib/domain/tax.ts` and `lib/domain/forms.ts`. `docs/finnish-rental-tax-rules.md`
is the evidence: each rule, its source, the date it was read, and whether it was
confirmed, contradicted or could not be verified.

## A new year, rules unchanged or with a new number

1. Read the sources in the doc's table again (below) and note any difference.
2. Add one entry to `RULES` in `taxRules.ts`: spread the year before and override
   only what changed (`const RULES_2027: TaxRules = { ...RULES_2026, mileagePerKm: … }`).
   Anything assumed rather than confirmed gets a comment saying so.
3. Update `tests/taxRules.test.ts` (the literal figures) — and the tests that name
   a figure: `tests/ruleParams.test.ts`, the e2e specs that read a number out of an ⓘ.
4. Update the doc: the status, the source and the date of every row you re-read.

If the rule changes in a way a number cannot express (a new category, a new
condition), write the test first in `tests/deductionRules.test.ts` and watch it
fail, then change `tax.ts`/`forms.ts`; add the setting if the person must choose
(migration + `SETTINGS_FIELDS` + `settingsSchema` + Settings page + three
languages + the e2e gate).

## Reading the sources

- **Fetch the page, do not trust a summary of it.** A model summarising a page
  paraphrases numbers; search snippets mix years. `curl -sL -A Mozilla/5.0 URL`
  and strip tags (the page text is in `<main>`) gives the real wording. vero.fi
  serves the same page in `/sv/`, `/fi/` and `/en/`: read at least two.
- **Primary sources, in this order**: the vero.fi step-by-step pages (Avdrag,
  Deklarera, Underskottsgottgörelse); Verohallinto's detailed guidance
  *Beskattning av hyresinkomster* (the rules with chapter numbers and examples —
  the authority when a page simplifies); the forms (7H, 7K) and their
  instructions; the Acts on Finlex (ISkL 1535/1992, NärSkL 360/1968, KällSkL
  627/1978). veronmaksajat.fi and vuokranantajat.fi only to complement.
- **Finlex pages are Next.js apps**: the text of an Act is in the server-sent
  data (`self.__next_f.push([1,"…"])` strings in the HTML), not in the tags.
  Collect those strings, JSON-decode them, and take the `"className":"highlightable","children":"…"`
  values in order — that is the Act, section by section, greppable.
- **What the declaration PDF names**: its stages and field names are the
  `pdf.*` messages (sv/fi/en), taken from the vero.fi Deklarera and Avdrag pages
  — re-read them when the year changes, the stage names are the first thing a
  redesign of the service renames. A name no page prints (rent received, annual
  repairs) is marked as such in the PDF; do not invent one.
- **The forms**: the PDF linked from a form's page can be an old version (the 7K
  PDF is still the 2018 layout). Compare its row numbers with the instruction page,
  which is kept current.

## Traps that have already cost a wrong number

- **0.27 vs 0.55 €/km.** 0.27 €/km (2025) is what a landlord deducts for a trip in
  their own car (Verohallinto's travel-cost-deduction decision). 0.55 €/km (2026;
  0.59 in 2025) is the tax-free reimbursement an *employer* may pay an employee.
  The decision for a new year is published around November; until then the old
  figure is an assumption, and the code comment must say so.
- **The 1 200 € limit's edge.** Some pages say "under 1 200 €" and "over 1 200 €";
  the detailed guidance and the Act say "at most 1 200 €" — exactly 1 200 is
  deducted at once. A web search returned an English snippet quoting an old 1 000 €;
  the current pages say 1 200 € (a reason to fetch the page, not rely on a snippet).
- **35 % is not for rent.** The 35 % source tax (KällSkL) is on wages; rent from a
  Finnish property is taxed at the capital income rates (30 % / 34 %) whatever the
  owner's country.
- **"Improvements over 10 years"** is the simplified wording; the guidance and
  NärSkL 24 § say over the useful life, at most 10 (the Act applies to costs that
  last three years or more).
- **A building's improvements are not spread.** They join the building's cost
  (form 7K row 4.3) and are depreciated with it. Only a flat's are spread.
- **Deficit credit**: a rental loss first offsets other capital income; the credit
  is 30 % of what remains, at most 1 400 € (+400 / +800 for minor children) and
  only as much as the tax on earned income can take; the rest is a loss kept ten
  years (the *Avdrag* page says it cannot be carried forward — the
  *Underskottsgottgörelse* page and the Act are the complete picture).

## Before you push

`npm run lint && npm run typecheck && npm test`, then `npm run test:e2e` (100 %
browser coverage). If a rule changed, the PR says which and cites the source.
