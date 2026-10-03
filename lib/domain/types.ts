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
   * (1–10, default 10) and for furniture over the 1 200 € limit, where 1 means
   * it lasts under three years and is deducted at once.
   */
  spreadYears?: number;
}

/**
 * A share in a housing company (osakehuoneisto, form 7H) or a property of one's
 * own (kiinteistö, form 7K). Only a property's building is depreciated.
 */
export type PropertyType = 'share' | 'property';

export const PROPERTY_TYPES: readonly PropertyType[] = ['share', 'property'];

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
  buildingSharePct: number; // % of purchase price that is depreciable (building part) — property only
  depreciationRate: number; // % per year of the remaining cost, at most 4 for a residential building
  depreciationPrior: number; // EUR already depreciated in earlier years
  useDepreciation: boolean; // building depreciation; never applies to a housing-company share
  monthlyRent: number;
}

/** Everything the tax calculation needs about one apartment. */
export interface Ledger {
  settings: ApartmentSettings;
  rents: RentEntry[];
  costs: CostEntry[];
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

/** One apartment as one of its owners sees it. */
export interface ApartmentView extends Ledger {
  id: string;
  owners: Owner[];
  invites: PendingInvite[];
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
  buildingSharePct: 100,
  depreciationRate: 4,
  depreciationPrior: 0,
  useDepreciation: false,
  monthlyRent: 0,
};

/**
 * How a cost is deducted:
 * - `expense`: in full, in the year it was paid;
 * - `financing`: like an expense, but only if the housing company books it as income;
 * - `improvement`: a basic improvement (perusparannus), in equal parts over up to ten years;
 * - `furniture`: up to 1 200 € at once, above that 25 % of the remaining value a year;
 * - `interest`: an expense, but declared with capital income deductions, not on the rental form.
 */
export type Treatment = 'expense' | 'financing' | 'improvement' | 'furniture' | 'interest';

export const CATEGORIES: Record<CostCategory, { label: string; fi: string; treatment: Treatment }> = {
  maintenance_charge: { label: 'Maintenance charge', fi: 'Hoitovastike', treatment: 'expense' },
  water_charge: { label: 'Water charge', fi: 'Vesimaksu', treatment: 'expense' },
  financing_charge: { label: 'Financing charge', fi: 'Rahoitusvastike', treatment: 'financing' },
  repairs: { label: 'Repairs & upkeep', fi: 'Vuosikorjaukset', treatment: 'expense' },
  improvement: { label: 'Basic improvement', fi: 'Perusparannus', treatment: 'improvement' },
  furniture: { label: 'Furniture & appliances', fi: 'Kalusteet ja kodinkoneet', treatment: 'furniture' },
  loan_interest: { label: 'Loan interest', fi: 'Lainan korot', treatment: 'interest' },
  insurance: { label: 'Insurance', fi: 'Vakuutukset', treatment: 'expense' },
  brokerage: { label: 'Letting agent fee', fi: 'Vuokranvälitys ja ilmoitukset', treatment: 'expense' },
  travel: { label: 'Travel', fi: 'Matkakulut', treatment: 'expense' },
  utilities: { label: 'Utilities paid by owner', fi: 'Sähkö, lämmitys, internet', treatment: 'expense' },
  property_tax: { label: 'Property tax', fi: 'Kiinteistövero', treatment: 'expense' },
  other: { label: 'Other deductible', fi: 'Muut vähennyskelpoiset menot', treatment: 'expense' },
};

export const COST_CATEGORIES = Object.keys(CATEGORIES) as CostCategory[];
