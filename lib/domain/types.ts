export type RentStatus = 'paid' | 'vacant' | 'unpaid';

export const RENT_STATUSES: readonly RentStatus[] = ['paid', 'vacant', 'unpaid'];

export interface RentEntry {
  month: string; // YYYY-MM — the month the rent is for; one entry per month per apartment
  status: RentStatus;
  amount: number; // EUR actually received (0 for vacant/unpaid)
  receivedDate: string; // YYYY-MM-DD, '' unless paid — cash basis: tax year follows this date
  note: string;
}

export type CostCategory =
  | 'maintenance_charge'
  | 'water_charge'
  | 'financing_charge'
  | 'repairs'
  | 'improvement'
  | 'furniture'
  | 'loan_interest'
  | 'insurance'
  | 'brokerage'
  | 'travel'
  | 'utilities'
  | 'property_tax'
  | 'other';

export interface CostEntry {
  id: string;
  date: string; // YYYY-MM-DD
  category: CostCategory;
  description: string;
  amount: number; // EUR
  hasReceipt: boolean;
  /**
   * Over how many years the cost is deducted. Read only for a basic improvement
   * of a housing-company flat (the law's range, see `taxRules.improvement`,
   * default the longest) and for furniture over the at-once limit, where 1
   * means it lasts under three years and is deducted at once.
   */
  spreadYears?: number;
}

/**
 * A share in a housing company (osakehuoneisto, form 7H) or a property of one's
 * own (kiinteistö, form 7K). Only a property's building is depreciated.
 */
export type PropertyType = 'share' | 'property';

export const PROPERTY_TYPES: readonly PropertyType[] = ['share', 'property'];

/** The building decides the highest depreciation rate: residential and office, or shop, warehouse, factory, workshop and the like. */
export type BuildingKind = 'residential' | 'commercial';

export const BUILDING_KINDS: readonly BuildingKind[] = ['residential', 'commercial'];

/**
 * How a furnished flat's furniture is deducted: the actual costs logged (the
 * default), or the Tax Administration's flat rate per month, which covers all
 * furniture and loose appliances.
 */
export type Furnishing = 'actual' | 'flat';

export const FURNISHINGS: readonly Furnishing[] = ['actual', 'flat'];

/** The flat-rate deduction depends on the size: a studio or one room, or something larger. */
export type RoomClass = 'studio' | 'larger';

export const ROOM_CLASSES: readonly RoomClass[] = ['studio', 'larger'];

/** What describes one apartment. Shared by all of its owners. */
export interface ApartmentSettings {
  name: string;
  address: string;
  housingCompany: string;
  propertyType: PropertyType;
  /**
   * Whether the housing company books the financing charge as income
   * (tuloutus). Only then is it deductible; a funded (rahastoitu) charge adds
   * to the acquisition cost instead.
   */
  financingChargeDeductible: boolean;
  purchaseDate: string; // YYYY-MM-DD or ''
  purchasePrice: number; // the whole apartment's price, not one owner's part of it
  /** Costs of the purchase (transfer tax, registration, agent, lawyer) — the building's part adds to its cost. Property only. */
  purchaseCosts: number;
  buildingSharePct: number; // % of purchase price that is depreciable (building part) — property only
  buildingKind: BuildingKind; // sets the highest depreciation rate — property only
  depreciationRate: number; // % per year of the remaining cost, at most the highest rate of the building kind
  depreciationPrior: number; // EUR depreciated before `depreciationFromYear`
  /** The first tax year the app calculates depreciation for; 0 = the year of the first rent logged. */
  depreciationFromYear: number;
  useDepreciation: boolean; // building depreciation; never applies to a housing-company share
  monthlyRent: number;
  furnishing: Furnishing;
  roomClass: RoomClass;
  /** The rent is below what is usual for the flat: costs may not exceed the rent, and loan interest is not deductible. */
  belowMarketRent: boolean;
  /** The share of the home that is let, in percent; the costs of the whole home count only by this much. */
  letSharePct: number;
  /** The day the sale was agreed (the deed or other binding contract), YYYY-MM-DD, or '' while nothing is being sold. */
  saleDate: string;
  salePrice: number; // the whole apartment's selling price, not one owner's part of it
  /** What selling cost (agent, delivery, listing, registration) — the whole apartment's. */
  saleCosts: number;
}

/**
 * What else counts towards the cost of acquiring the apartment when it is
 * sold, besides the price and `purchaseCosts`: the transfer tax, the agent's
 * and other fees of the purchase, an inspection, a basic improvement made
 * during ownership, and a financing charge the housing company booked as an
 * investment (rahastoitu) instead of income.
 */
export type AcquisitionKind = 'transfer_tax' | 'purchase_fees' | 'inspection' | 'improvement' | 'funded_charge' | 'other';

export const ACQUISITION_KINDS: readonly AcquisitionKind[] = [
  'transfer_tax',
  'purchase_fees',
  'inspection',
  'improvement',
  'funded_charge',
  'other',
];

export interface AcquisitionCost {
  id: string;
  date: string; // YYYY-MM-DD
  kind: AcquisitionKind;
  description: string;
  amount: number; // EUR, the whole apartment's
}

/** Everything the tax calculation needs about one apartment. */
export interface Ledger {
  settings: ApartmentSettings;
  rents: RentEntry[];
  costs: CostEntry[];
}

/** A ledger with what the sale of the apartment is worked out from. */
export interface SaleLedger extends Ledger {
  acquisitionCosts: AcquisitionCost[];
}

export interface Owner {
  userId: string;
  email: string;
  sharePct: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  sharePct: number;
}

/**
 * A cost or the rent that books itself on one day of every month, from
 * `nextMonth` on. What it has already booked are ordinary cost and rent
 * entries; changing or deleting it leaves those as they are.
 */
export interface RecurringEntry {
  id: string;
  kind: 'cost' | 'rent';
  category?: CostCategory; // costs only
  description: string;
  amount: number; // EUR a month
  dayOfMonth: number; // 1–28
  nextMonth: string; // YYYY-MM — the next month it will book
}

/** One apartment as one of its owners sees it. */
export interface ApartmentView extends Ledger {
  id: string;
  owners: Owner[];
  invites: PendingInvite[];
  recurring: RecurringEntry[];
  acquisitionCosts: AcquisitionCost[];
  /** The viewer's own ownership share, in percent. */
  mySharePct: number;
}

/** A row in the viewer's portfolio. */
export interface PortfolioItem {
  id: string;
  name: string;
  address: string;
  mySharePct: number;
  ownerCount: number;
}

export const defaultSettings: ApartmentSettings = {
  name: 'My rental apartment',
  address: '',
  housingCompany: '',
  propertyType: 'share',
  financingChargeDeductible: false,
  purchaseDate: '',
  purchasePrice: 0,
  purchaseCosts: 0,
  buildingSharePct: 100,
  buildingKind: 'residential',
  depreciationRate: 4,
  depreciationPrior: 0,
  depreciationFromYear: 0,
  useDepreciation: false,
  monthlyRent: 0,
  furnishing: 'actual',
  roomClass: 'larger',
  belowMarketRent: false,
  letSharePct: 100,
  saleDate: '',
  salePrice: 0,
  saleCosts: 0,
};

/**
 * How a cost is deducted:
 * - `expense`: in full, in the year it was paid;
 * - `financing`: like an expense, but only if the housing company books it as income;
 * - `improvement`: a basic improvement (perusparannus) — of a flat in equal parts over up to ten years,
 *   of a property's building added to its cost and depreciated with it;
 * - `furniture`: up to 1 200 € at once, above that 25 % of the remaining value a year;
 * - `interest`: an expense, but declared with capital income deductions, not on the rental form.
 */
export type Treatment = 'expense' | 'financing' | 'improvement' | 'furniture' | 'interest';

/**
 * `shared`: a cost of the whole home, of which only the let part is deductible
 * (the `letSharePct` setting). The others — repairs, furniture, agent fees,
 * travel, anything else — are taken in full: log only what belongs to the let part.
 */
export const CATEGORIES: Record<CostCategory, { label: string; fi: string; treatment: Treatment; shared: boolean }> = {
  maintenance_charge: { label: 'Maintenance charge', fi: 'Hoitovastike', treatment: 'expense', shared: true },
  water_charge: { label: 'Water charge', fi: 'Vesimaksu', treatment: 'expense', shared: true },
  financing_charge: { label: 'Financing charge', fi: 'Rahoitusvastike', treatment: 'financing', shared: true },
  repairs: { label: 'Repairs & upkeep', fi: 'Vuosikorjaukset', treatment: 'expense', shared: false },
  improvement: { label: 'Basic improvement', fi: 'Perusparannus', treatment: 'improvement', shared: false },
  furniture: { label: 'Furniture & appliances', fi: 'Kalusteet ja kodinkoneet', treatment: 'furniture', shared: false },
  loan_interest: { label: 'Loan interest', fi: 'Lainan korot', treatment: 'interest', shared: true },
  insurance: { label: 'Insurance', fi: 'Vakuutukset', treatment: 'expense', shared: true },
  brokerage: { label: 'Letting agent fee', fi: 'Vuokranvälitys ja ilmoitukset', treatment: 'expense', shared: false },
  travel: { label: 'Travel', fi: 'Matkakulut', treatment: 'expense', shared: false },
  utilities: { label: 'Utilities paid by owner', fi: 'Sähkö, lämmitys, internet', treatment: 'expense', shared: true },
  property_tax: { label: 'Property tax', fi: 'Kiinteistövero', treatment: 'expense', shared: true },
  other: { label: 'Other deductible', fi: 'Muut vähennyskelpoiset menot', treatment: 'expense', shared: false },
};

export const COST_CATEGORIES = Object.keys(CATEGORIES) as CostCategory[];
