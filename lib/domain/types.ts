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
  | 'financing_charge'
  | 'repairs'
  | 'loan_interest'
  | 'insurance'
  | 'brokerage'
  | 'utilities'
  | 'other';

export interface CostEntry {
  id: string;
  date: string; // YYYY-MM-DD
  category: CostCategory;
  description: string;
  amount: number; // EUR
  hasReceipt: boolean;
}

/** What describes one apartment. Shared by all of its owners. */
export interface ApartmentSettings {
  name: string;
  address: string;
  housingCompany: string;
  purchaseDate: string; // YYYY-MM-DD or ''
  purchasePrice: number; // the whole apartment's price, not one owner's part of it
  buildingSharePct: number; // % of purchase price that is depreciable (building part)
  depreciationRate: number; // % per year, 2.5 for apartments in housing companies
  depreciationPrior: number; // EUR already depreciated in earlier years
  useDepreciation: boolean;
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
  purchaseDate: '',
  purchasePrice: 0,
  buildingSharePct: 100,
  depreciationRate: 2.5,
  depreciationPrior: 0,
  useDepreciation: false,
  monthlyRent: 0,
};

export const CATEGORIES: Record<
  CostCategory,
  { label: string; fi: string; deductible: boolean; hint?: string }
> = {
  maintenance_charge: { label: 'Maintenance charge', fi: 'Hoitovastike', deductible: true },
  financing_charge: {
    label: 'Financing charge',
    fi: 'Rahoitusvastike',
    deductible: false,
    hint: 'Not deductible as an expense — it adds to the acquisition cost.',
  },
  repairs: { label: 'Repairs & upkeep', fi: 'Korjaukset ja kunnossapito', deductible: true },
  loan_interest: { label: 'Loan interest', fi: 'Lainan korot', deductible: true },
  insurance: { label: 'Insurance', fi: 'Vakuutukset', deductible: true },
  brokerage: { label: 'Letting agent fee', fi: 'Vuokranvälityspalkkio', deductible: true },
  utilities: { label: 'Utilities paid by owner', fi: 'Vesi, sähkö, internet', deductible: true },
  other: { label: 'Other deductible', fi: 'Muut vähennyskelpoiset menot', deductible: true },
};

export const COST_CATEGORIES = Object.keys(CATEGORIES) as CostCategory[];
