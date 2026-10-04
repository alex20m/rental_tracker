# Finnish rental income — the rules this app applies, and where they come from

Verified on **2026-10-04** against the primary sources below. When a rule or an
amount changes, change it in **one place** — `lib/domain/taxRules.ts` — and
update this file with the source and the date.

Status: ✅ confirmed by a primary source · ⚠️ sources disagree (what we did) ·
❓ could not be verified (what we assumed).

## Sources

All fetched 2026-10-04. "upd." is the date the page itself carries.

| Key | Source |
| --- | --- |
| **A** | vero.fi, *Avdrag* (sv; the fi and en pages say the same, numbers identical) — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/avdrag/ (upd. 26.5.2026; fi 26.5.2026, en 26.4.2026) |
| **D** | Verohallinto, detailed guidance *Beskattning av hyresinkomster* VH/7418/00.01.00/2025 — https://www.vero.fi/sv/Detaljerade_skatteanvisningar/anvisningar/49336/ (given 12.1.2026, upd. 14.1.2026). Chapter numbers are cited as "D 3.5". |
| **DK** | vero.fi, *Så här deklarerar du hyresinkomsterna* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/deklarationsanvisningar/ (upd. 1.1.2026) |
| **7H** | Form 7H (3011) PDF v1.2025 — https://www.vero.fi/contentassets/d1b13e41f36f4e89bafe967dd497d2ed/3011rv25_ws.pdf ; instruction — https://vero.fi/sv/skatteforvaltningen/kontakta-oss/blanketter/deklarationsanvisningar/7h-hyresinkomster--aktiel%C3%A4genheter/ (upd. 4.2.2026) |
| **7K** | Form 7K (3012) PDF v1.2018/2 (the version the form page links) — https://www.vero.fi/contentassets/411ac7684ce144e283fa523c7846022e/7k_3012rv18_ws.pdf ; instruction — https://vero.fi/sv/skatteforvaltningen/kontakta-oss/blanketter/deklarationsanvisningar/7k-hyresinkomster--fastighet-deklarationsanvisning/ (upd. 17.9.2025) |
| **UP** | vero.fi, *Uthyrning av en bostad till underpris* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/uthyrning-av-en-bostad-till-underpris/ (upd. 1.1.2025) |
| **KF** | vero.fi, *Kortfristig eller sporadisk uthyrning* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/kortfristig-eller-sporadisk-uthyrning/ (upd. 1.1.2025) |
| **ÄN** | vero.fi, *Ändringar under uthyrningen* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/andringar-under-uthyrningen/ (upd. 5.2.2025) |
| **SK** | vero.fi, *Hur stor är skatten på hyresinkomster?* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/hur-stor-ar-skatten-pa-hyresinkomster/ (upd. 16.12.2025) |
| **UT** | vero.fi, *Hyresinkomst från annat än hemvistlandet* — https://www.vero.fi/sv/privatpersoner/egendom/hyresinkomster/hyresinkomst-från-annat-än-hemvistlandet/ (upd. 1.1.2026) |
| **UG** | vero.fi, *Underskottsgottgörelse* — https://vero.fi/sv/privatpersoner/avdrag/vad-kan-jag-dra-av/underskottsgottgorelse/ (upd. 1.1.2026) |
| **RK** | Verohallinto, decision on the travel cost deduction for 2025 (VH/6253/00.01.00/2025) — https://www.vero.fi/sv/Detaljerade_skatteanvisningar/beslut/47204/ (given 13.11.2025) |
| **KM** | vero.fi, *Kilometerersättning och dagtraktamente* — https://www.vero.fi/sv/privatpersoner/avdrag/kilometerersattning-och-dagtraktamente/ |
| **Ä26** | vero.fi, *What will change in taxation in 2026* — https://vero.fi/en/About-us/newsroom/news/uutiset/2025/what-will-change-in-taxation-in-2026/ (12.8.2025) and *Muutokset veroperusteisiin 2026* — https://vero.fi/tietoa-verohallinnosta/tilastot/verotulojen-kehitys/muutokset-veroperusteisiin-verovuosittain/2026/ (upd. 16.6.2026) |
| **RÄ** | Verohallinto, detailed guidance *Ränteavdrag i personbeskattningen* — https://vero.fi/sv/Detaljerade_skatteanvisningar/anvisningar/49021/ |
| **DB** | vero.fi, *Dödsboets hyresinkomster och skatter* — https://vero.fi/sv/privatpersoner/egendom/arv/dodsboets-skattearenden/hyresinkomster/ (upd. 3.5.2024) |
| **IL** | Income Tax Act 1535/1992, consolidated — https://www.finlex.fi/fi/lainsaadanto/1992/1535 (54, 58, 114, 124 b, 131–134 §) |
| **NL** | Business Income Tax Act 360/1968, consolidated — https://www.finlex.fi/fi/lainsaadanto/1968/360 (24 § and the depreciation provisions) |
| **KS** | Source Tax Act 627/1978, consolidated — https://www.finlex.fi/fi/lainsaadanto/1978/627 |

## 1 · Housing-company share vs. a property of one's own

| Claim | Source | Status |
| --- | --- | --- |
| The purchase price of a housing-company share can never be depreciated (shares do not wear out); it is deducted only when the share is sold. | D 3.9.1–3.9.2 | ✅ |
| A building on a property is depreciated at most **4 %** (residential, office) or **7 %** (shop, warehouse, factory, workshop, farm/power-station building, or comparable) of the *remaining* (unwritten-off) acquisition cost. The owner chooses any amount from 0 up to the maximum and must claim it in the return; it is never automatic. | D 3.9.2, A, 7K | ✅ |
| Land never; connection fees never (except one that can be neither transferred nor refunded — 10 years straight-line); improvements to the land (e.g. asphalt) straight-line over their useful life. | D 3.9.1–3.9.3 | ✅ |
| Building vs. land: the building's part of the price per the deed of sale if reasonable; otherwise estimated with Verohallinto's valuation guidance for inheritance/gift tax. Purchase costs (transfer tax, registration, agent, legal) go to the building in the building's share of the price (example 16: 200 000 € with 145 000 € building and 6 000 € costs → 149 350 €). There is no fixed percentage. | D 3.9.3 | ✅ |
| Improvements and renovations of a building are **added to the unwritten-off cost** (form 7K 4.3 *Tillägg*) and depreciated at 4/7 % with the rest — not spread over ten years. Alternatively deducted at sale. | A, D 3.7.1, 3.9.3 (ex. 17), 7K 4.3 | ✅ |
| No depreciation in the year the building is sold; the building must be owned at year end. Pro rata by days when part of the year is own use (example 19: 304/365); a building let from day one but bought mid-year gets the full rate; a part-let building only the let part (by area). | A, D 3.9.5 | ✅ |
| If depreciation has been taken before and the remaining cost at the start of the year is under 1 200 €, all of it may be deducted as an ordinary cost. | A (7K section) | ✅ (the NL text we found for the 1 200 € rule is explicit for movables only — ❓ for buildings the vero.fi page is the only source) |
| Renovation right after buying and before the first tenant moves in is always acquisition cost, annual repair or improvement alike. For a share it cannot be deducted until sale; for a building it enters the depreciation base. | D 3.7.3 (HFD 2000:51, 2003:21) | ✅ |
| Only the owner of the property may depreciate, not a holder of a right of possession. | D 3.9.2, 4.4 | ✅ |

## 2 · Basic improvement (ombyggnad / perusparannus) of a share

| Claim | Source | Status |
| --- | --- | --- |
| Straight-line in equal parts over the improvement's *probable useful life*, at most 10 years (NL 24 §: costs lasting 3+ years; over 10 → 10). The public page A only says "10 years". We accept **3–10**; 1–2 years has no basis (an improvement of a share cannot be an annual cost). | D 3.7.2 (HFD:2001:2), NL 24 §, A | ⚠️ A says 10, D and the Act say "useful life, max 10" |
| Optional and must be claimed; to deduct everything straight-line it must start in the year it is paid and run every year; what is left is added to the acquisition cost when the flat is sold or taken into own use. Only for work the owner had done and paid. | D 3.7.2 | ✅ |
| First deduction in the year it is paid, a full year's part (8 000 € with half improvement → 4 000 / 10 = 400 in 2025). | A (Lars), D ex. 10 | ✅ |
| Annual repair restores the original standard (painting, wallpaper, replacing stove/fridge/kitchen cabinets/toilet fittings/doors/windows/floor of the same quality). Improvement raises the standard or floor area (balcony glazing, heating/ventilation, foundations/structure, water/sewage, electricity, cold store → sauna). Mixed projects are split by nature; with no split an estimate by percentage is used. Own labour is never deductible; materials and travel are. | A, D 3.7.1 | ✅ |
| A renovation ordered by the housing company is, for the shareholder, neither: it is charged as *vederlag* and deducted per section 4 below. | D 3.7.1, 3.8 | ✅ |

## 3 · Furniture and loose property (lösöre / irtain omaisuus)

| Claim | Source | Status |
| --- | --- | --- |
| Cost **at most 1 200 €** (so exactly 1 200 included), or useful life under 3 years → deducted at once. More than 1 200 € and life over 3 years → depreciation. | D 3.5, A (fi/en say "enintään"/"no more than" for the property variant; the sv page for shares says "understiger/överstiger") | ✅ (⚠️ wording at exactly 1 200 differs between pages; D and NL are explicit: at most) |
| Depreciation is per item, at most 25 % of the remaining cost; the first year is the full 25 % of the price (2 000 → 500 → 375 → …). | D 3.5 (ex. 6) | ✅ |
| When the remaining cost at the **start** of the year is at most 1 200 €, all of it is deducted that year (also if the item was destroyed) — the 2 000 € dryer's third year is 1 125 €. | D 3.5 (ex. 7), A | ✅ |
| An inventory list is required: quantity, quality, price (or unwritten-off cost). | D 3.5, A | ✅ |
| An item moved from private use enters at its market value, at most its original cost. Fixed appliances (fridge, stove, dishwasher) bought when renovating at acquisition add to the acquisition cost; a later replacement is an annual repair. | D 3.5 | ✅ |
| IL 114 § says NL 33 § (small purchases) is *not* applied to equipment used to earn income; the 1 200 € at-once rule is how the Tax Administration applies the "remaining cost ≤ 1 200 € may be written off at once" provision. | IL 114 §, NL, D 3.5 | ✅ |

## 4 · Financing charge (rahoitusvastike / kapitalvederlag)

| Claim | Source | Status |
| --- | --- | --- |
| Deductible only if the housing company **books it as income** (tuloutus). A charge it books as the shareholder's capital investment (rahastointi / "fonderad") is not deductible; it is added to the acquisition cost of the share and counts when the share is sold. What the money is used for does not matter. | D 3.8, A, 7H 2.3 | ✅ |
| Monthly charge or lump-sum loan-share payment: same treatment. The company may book part as income and part as capital; only the booked-as-income part is deductible. | D 3.8, A | ✅ |
| How to tell: ask the housing company's manager (disponent) — the booking is in the company's accounts; nothing else decides it. | D 3.8, A | ✅ |
| Only charges the taxpayer paid; charges before letting began (active search for a tenant) are not deductible; during a renovation they are, while the flat is in letting use. | D 2.2, 3.8 | ✅ |
| A loss caused by high capital charges is deductible if the rent is the going rate and letting is clearly for income. Constructed arrangements can be struck down as tax avoidance. | D 3.8, 3.12 | ✅ |

## 5 · Furnished letting and the flat-rate deduction

| Claim | Source | Status |
| --- | --- | --- |
| Flat-rate deduction **40 €/month** for a furnished studio or one room, **60 €/month** for a larger flat, per flat, regardless of the number of tenants. For sporadic letting **1.30 €/day** and **2.00 €/day**. | D 3.6, A | ✅ |
| It covers furniture and loose appliances. Fixed appliances (fridge, electric stove, dishwasher) and the maintenance charge etc. are deductible on top. Choose flat rate **or** actual costs; keep the choice in following years in general, but it may change when circumstances change. Declared under *Other expenses*. | D 3.6, A, 7H 2.5 | ✅ |
| How months with vacancy or part months are counted is not stated (the examples use 12 full months). The app counts months in which the flat was let (paid or unpaid rent). | — | ❓ |

## 6 · Travel

| Claim | Source | Status |
| --- | --- | --- |
| **0.27 €/km** with one's own car is the amount for travel connected to letting in the **2025** return. The same figure as the decision on the travel cost deduction (car 0.27, motorcycle 0.22, moped 0.13, bicycle 100 €/year). | A, KM, RK | ✅ |
| **0.55 €/km (2026; 0.59 in 2025)** is the *tax-free reimbursement an employer may pay an employee* — a different thing, not applicable to a landlord's deduction. | KM, Ä26 | ⚠️ not a conflict between pages, but the premise that 0.55 applies is wrong |
| The rate for tax year **2026** (return in spring 2027): no new decision found; the 2025 decision is valid "until further notice". Assumed unchanged. | RK | ❓ |
| Deductible: viewings, inspections, service visits, signing a lease, the housing company's general meeting and (for board members) board meetings; actual costs (tickets, lodging, extra living costs); no per-diem or meal flat rate; commuting limits do not apply; for own renovation the material and the trips, not the labour. | D 3.4, A | ✅ |

## 7 · Loan interest

| Claim | Source | Status |
| --- | --- | --- |
| Interest on a loan used to acquire the rented property is deducted from *capital income* (IL 58 §), in full, with no cap and no deductible. It is **not** entered on 7H/7K; it goes under *Interest on debts* (sv *Räntor på skuld*, fi *Velan korot*; paper form 50B / 5010r). Banks report the loans — check the purpose reads income-producing. | A, D 3.11, RÄ, DK, IL 58 § | ✅ |
| Only when the rent is the going rate; for part of the year in letting use, only that part; interest on one's own home is not deductible. | UP, RÄ, D 4.2, ÄN | ✅ |
| Loan costs other than interest (arrangement fee, reservation fee, expedition fee) are deductible; repayment-protection insurance is not. Where they go differs: D 3.3 lists them with the rental costs, the return's *Other deductions from capital income* also fits. The tax effect is the same. | D 3.3, A, DK | ⚠️ placement |
| Interest paid in advance is deductible only for the tax year and the next. | IL 58 § | ✅ |

## 8 · Below-market rent, own use, splitting a flat

| Claim | Source | Status |
| --- | --- | --- |
| Rent below the going rate (the taxable value of the housing benefit is the reference when there is nothing else): costs plus depreciation may not exceed the rent; no loss is established; no loan interest or loan costs at all; the rent is still declared. When both depreciation and other costs are claimed, the same share is taken of each (example 27). | UP, D 4.2 | ✅ |
| Part of the flat in own use or let to a flatmate: split costs by person count (example 4: half) or by area (example 5: 20 % + ⅓ × 15 % = 25 %). Costs of a separately let part: all of that part's costs, but costs of the whole property (property tax) by area. Direct letting costs (ads, agent) in full. | D 3.2, KF | ✅ |
| Sporadic letting of one's own home: only the costs of the let time plus direct costs, no depreciation of the purchase price; letting the *whole* home, even briefly, breaks the "lived in for two years" period for tax-free sale. | D 4.1, KF | ✅ |

## 9 · Deficit credit (alijäämähyvitys / underskottsgottgörelse)

| Claim | Source | Status |
| --- | --- | --- |
| Credit = **30 %** of the year's capital-income deficit (rental loss plus interest and other capital costs, less other capital income), at most **1 400 €**; +400 € for one, +800 € for two or more minors the taxpayer or the spouses support. Deducted from tax on earned income (state tax first, then municipal etc.), so it cannot exceed what that tax can take. | UG, IL 131–134 § | ✅ |
| What the credit cannot use (over the maximum, or no tax to deduct it from) stays as a capital-income loss for the next 10 years; the unused part can pass to the spouse. | UG | ✅ |
| Page A says a rental loss cannot be carried to next year's rental income, "the Tax Administration instead gives the credit". UG gives the full picture (carry-forward of the rest). We follow UG. | A vs UG | ⚠️ |
| Example: deficit 6 000 € → 30 % = 1 800 € → capped at 1 400 €. | A | ✅ |
| A loss is established only for letting done to earn income: going-rate rent, a realistic expectation of profit in the longer run; a long vacancy is neither deductible nor a loss. | D 3.12, 3.1, 4.1–4.3 | ✅ |

## 10 · Co-owners and estates

| Claim | Source | Status |
| --- | --- | --- |
| Income is the owners' in proportion to their shares; costs are deducted by share even if one owner paid all; each owner (each spouse) files their own form with their own share. | D 2.2, 3.1, 7H, 7K | ✅ |
| Farm/forest property and VAT-liable property: a tax partnership (one joint form; depreciation on the summed cost; income split by share). Otherwise each owner depreciates their own share (example 31, 70 %/30 %). | D 4.5, 7K | ✅ |
| An estate that owns the flat is taxed itself (own declaration, mostly paper or a business ID with a Suomi.fi mandate); it continues the deceased's depreciation base; after the estate is divided the new owner declares; a surviving spouse with a right of possession is taxed. | DB, D 2.2, 3.9.4, 4.4 | ✅ (the app does not model estates) |

## 11 · Non-resident landlords

| Claim | Source | Status |
| --- | --- | --- |
| Rent from a Finnish flat or property is taxed in Finland even if the owner lives abroad, at the **capital-income rates (30 % / 34 %)** — residence does not change the rate. Apply for advance tax at once; declare in the tax return (forms 7H/7K, rent and costs); same deductions as a resident. | UT, KS | ✅ |
| The **35 %** source tax applies to wages and other earned income (KS); 30 % to dividends/interest/royalties to non-companies. Rent from Finnish real estate is assessed in the ordinary procedure at 30/34 %, **not** at 35 %. | KS | ✅ |
| Finland–Sweden (Nordic convention SopS 26/1997): income from real estate (including shares that give the right to a flat) may be taxed where the property is; the residence state relieves double tax. Confirmed through the vero.fi examples (Finnish resident with a Swedish flat; Swedish citizen with a Finnish flat), **not** against Articles 6 and 23 — the treaty text could not be retrieved. The Swedish side (Skatteverket) is outside this app. | D 4.6 (ex. 32), UT | ❓ partly |
| Finnish resident with a foreign flat: credit method (Nordic countries) or exemption method (France, Egypt: costs may not exceed the income); form 16B / "Foreign income". | UT, D 4.6 | ✅ |
| Whether a non-resident can use the deficit credit (it comes off Finnish tax on *earned* income, which a non-resident often does not have): no source found. | — | ❓ |

## 12 · The forms

| Claim | Source | Status |
| --- | --- | --- |
| **7H** (3011, v1.2025). Per flat: housing company name, business ID, flat number; tenant ID and name ("flera" if several); letting period (ddmmyyyy–ddmmyyyy, the whole year if several periods); ownership share %. **2.1** rent for the whole year (your share, gross) · **2.2** maintenance charges and water charges (your share) · **2.3** financing charges booked as income by the company · **2.4** annual repairs · **2.5** other expenses. There are no rows for depreciation or the result. Straight-line improvement, flat-rate furniture and loose-property depreciation go in 2.5. | 7H PDF, 7H instr., A | ✅ |
| **7K** (3012). **2** the property (designation, name, tenant, period, share %, square metres let when only part is, gross rent your share) · **3.1** annual repairs · **3.2** other costs (insurance, property tax, electricity, water, heating, sewage, waste, ground rent) · **3.3** this year's depreciation (from 4.5) · **3.4** taxable rental income (net, +) · **3.5** loss (net, −) · **4** depreciation: acquisition price of the whole property (your share), the rates (7 % / 4 % / 25 % loose property) · **4.1** the let building's or item's part of the acquisition price · **4.2** unwritten-off cost at the start of the year · **4.3** additions during the year · **4.4** after additions · **4.5** this year's depreciation · **4.6** unwritten-off at year end (columns: building 1, building 2, loose property). | 7K PDF v1.2018/2, 7K instr. | ✅ (❓ no 2025 PDF is linked; the field numbers match the 2025 instruction) |
| OmaVero / MinSkatt / MyTax have **no numbered forms**. Flow for tax year 2025: pre-filled tax return 2025 → *Correct the information* → phase *Pre-filled income and deductions* or *Other income* → *Rental income: Yes* → *Add a new rental income* → choose the property → one flat at a time, all tenants → own fields for income and costs (*Skötselvederlag och vattenavgifter (egen andel)*, *Kapitalvederlag som bolaget intäktsfört (egen andel)*, annual repairs, *Övriga kostnader*, *Avskrivningar*) → *Uträkning av avskrivningar* (shown only for a property or other asset, not for a flat) → OK → phase *Other deductions*: *Räntor på skuld* → *Preview and send*. Finnish names: *Vuokratulot – Vuokrauksen tulot ja kulut – Hoitovastikkeet ja vesimaksut (oma osuus)*, *… Yhtiön tulouttamat pääomavastikkeet (oma osuus)*, *Muut kulut*, *Poistot*, *Velan korot*. | DK, A (fi, en) | ✅ |
| The stages and buttons, in the three languages (read 2026-10-04 on DK, sv/fi/en). **sv** *MinSkatt → Inkomstskatt för personer → Förhandsifylld skattedeklaration 2025 → Kontrollera den förhandsifyllda skattedeklarationen → Korrigera uppgifterna i den förhandsifyllda skattedeklarationen*; stages *Förhandsifyllda inkomster och avdrag · Övriga inkomster · Övriga avdrag · Förhandsgranska och skicka*; *Hyresinkomster: Ja → Lägg till en ny hyresinkomst*. **fi** *OmaVero → Henkilön tulovero → Esitäytetty veroilmoitus 2025 → Tarkista esitäytetty veroilmoitus → Korjaa esitäytetyn veroilmoituksen tietoja*; *Esitäytetyt tulot ja vähennykset · Muut tulot · Muut vähennykset · Esikatsele ja lähetä*; *Lisää uusi vuokratulo*. **en** *MyTax → Individual income tax → Pre-completed tax return 2025 → Check your pre-completed tax return → Make corrections to the pre-completed tax return*; *Pre-completed income and deductions · Other income · Other deductions · Preview and send*; *Add new rental income*. The group of fields is *Hyresinkomster – Inkomster och utgifter för uthyrningen* / *Vuokratulot – Vuokrauksen tulot ja kulut* / *Rental income – Rental income and expenses*. The PDF's `pdf.*` messages use exactly these names. | DK, A (sv, fi, en) | ✅ |
| Field names OmaVero gives a flat, in the three languages: maintenance and water charges (*Skötselvederlag och vattenavgifter (egen andel)* · *Hoitovastikkeet ja vesimaksut (oma osuus)* · *Monthly maintenance charges and water charges (your portion)*), financing charges booked as income (*Kapitalvederlag som bolaget intäktsfört (egen andel)* · *Yhtiön tulouttamat pääomavastikkeet (oma osuus)* · *Charges for financial costs entered as income by the company (your portion)*), *Övriga kostnader* · *Muut kulut* · *Other expenses* (improvements, flat-rate furniture and loose property of a flat go here), and *Avskrivningar* · *Poistot* · *Depreciation* for a property. **Not published**: the names of the fields for rent received and annual repairs — the PDF uses the wording of form 7H for them (*Vuokratulojen määrä koko vuonna*, *Vuosikorjausten kulut*) and says on the page that the screen may differ. | A (sv, fi, en) | ✅ (❓ for the two unpublished fields) |
| The flow for tax year **2026** (return in spring 2027) is not published yet; DK describes 2025 and says 2026 rents are given when applying for a tax card or advance tax. | DK | ❓ |
| Notes and receipts are kept six years; do not attach them. The start of the six years differs: A/DK "from the end of the tax year", D 5.1 "from the start of the year after the year taxation was completed". We tell users the longer. | A, DK, D 5.1 | ⚠️ |

## 13 · Capital-income rates

| Claim | Source | Status |
| --- | --- | --- |
| **30 %** of capital income up to 30 000 €, **34 %** of the part above. | SK, IL 124 b §, KS | ✅ |
| 2026: no change in these rates or in the deficit credit (1 400 / 400 / 800 €). Other 2026 changes (no home-office flat deduction, union fees not deductible, bank loyalty bonuses become capital income, forestry deduction 75 %, reduced VAT 13.5 %) do not touch rental income. | Ä26, UG | ✅ |

## 14 · Often overlooked

| Claim | Source | Status |
| --- | --- | --- |
| Travel to the housing company's general meeting is deductible. | A, D 3.4 | ✅ |
| Ads, agent fees, phone costs for finding a tenant, platform fees: in full. | D 3.3, KF | ✅ |
| Legal and court costs for collecting rent, ending a lease, evicting; wages and fees paid for the letting (not to a spouse or a child of 14 or under). | D 3.3, ÄN | ✅ |
| Cleaning and general bank-account fees are not named in these sources. Cleaning for the letting is an ordinary cost of earning the income (IL 54 §); private cleaning is not. | IL 54 § | ❓ |
| Costs before the first letting: deductible only from when the owner actively looks for a tenant; charges for the time before are not; renovation before letting is acquisition cost; charges during a renovation are deductible from the start of letting. | D 3.1, 3.7.3, 3.8 | ✅ |
| Empty months: deductible while the flat is temporarily empty (tenant change, renovation) and still offered for letting — be able to show an ad or agency contract; a long vacancy is no longer letting for income (no deduction, no loss); rent is declared only for the let time; moving in yourself ends it. | D 3.1, ÄN | ✅ |
| Cash principle: rent paid late belongs to the year it is paid; costs to the year paid. | ÄN, D 2.1.2, 3.1 | ✅ |
| A rental deposit is not income unless it is used against unpaid rent; damage compensated by the tenant is not deductible; a repair the tenant pays for (with the landlord's permission, not in the lease) is income when the lease ends. | D 2.1.3, 2.1.2, ÄN | ✅ |
| Water charges and similar fees the tenant pays the landlord are rental income. | vero.fi *Vad är hyresinkomst?* (upd. 8.8.2025) | ✅ |
| Insurance compensation is tax-free and does not reduce the deduction for repairs. | D 3.7.5 | ✅ |
| A private landlord does not charge VAT; a business above 20 000 € turnover registers. | ÄN | ✅ |
| Rent must be declared even when no tax is left; letting through a platform is reported to the Tax Administration. | DK | ✅ |

## What the app does about each — decisions and limits

Where the sources leave a choice, or the app deliberately stops short:

- **Improvement of a flat**: 3–10 years, default 10 (§2). A value of 1 or 2 stored
  by an earlier version is read as 3.
- **Improvement of a property's building**: added to the building's cost in the
  year it is paid (row 4.3 of form 7K) and depreciated with it; with building
  depreciation switched off it is simply not deducted (it waits for the sale).
  An improvement paid before the year depreciation is first counted is not added
  automatically.
- **Building depreciation** goes down year by year from the first year counted:
  the year chosen in Settings, else the year of the first rent logged, else the
  purchase year. It assumes the highest rate was claimed every year since; what
  was claimed before goes in "Depreciated before that year". Lower the rate for
  a year of own use, and switch it off in the year of a sale — the app does not
  prorate by days. Existing properties with depreciation switched on are
  anchored at the year migration 0004 ran.
- **Flat rate for furniture** counts the months logged as paid or unpaid (§5); the
  actual cost of furniture is then not deducted. Fixed appliances are logged as
  repairs.
- **The PDF** for a flat follows the OmaVero screens in the language of the app
  (`pdf.*` messages); a property of one's own gets form 7K in English. What is
  only for the owner's own papers (income by month, the result, the schedules)
  comes after the steps, on a page of its own. A flat's purchase price is not on
  it: OmaVero does not ask for it.
- **Advanced settings**: the app assumes one person letting a whole flat in a
  housing company. The kind of property, the share of the home let, a rent below
  the usual, the flat-rate furniture deduction and building depreciation are
  under Advanced; the list of settings names the ones in use.
- **Kilometre rate** by year in `taxRules.ts`; 2026 is the 2025 figure until
  Verohallinto publishes its decision (§6).
- **Part of the home let**: a percentage that scales the costs of the whole home
  and the building's depreciation; direct costs (repairs, furniture, travel, agent
  fees, other) are taken in full — the person logs only the let part of those.
- **Financing charge partly booked as income**: log only the part that is.
- **Deficit credit** is shown as the most it can be: 30 % of the deficit, at most
  1 400 €. The app does not know other capital income, children, or the tax on
  earned income it comes off.
- **Not modelled**: estates, tax partnerships, rental of property abroad,
  short-term rental of one's own home (the per-day flat rate), possessory rights,
  and the sale of a flat or property.
