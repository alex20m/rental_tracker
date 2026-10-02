export type RentStatus = 'paid' | 'vacant' | 'unpaid';

export interface RentEntry {
  id: string;
  month: string; // YYYY-MM — the month the rent is for
  status: RentStatus;
  amount: number; // EUR actually received (0 for vacant/unpaid)
  receivedDate: string; // YYYY-MM-DD — cash basis: tax year follows this date
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

export interface Settings {
  taxpayerName: string;
  propertyName: string;
  address: string;
  housingCompany: string;
  purchaseDate: string;
  purchasePrice: number;
  buildingSharePct: number; // % of purchase price that is depreciable (building part)
  depreciationRate: number; // % per year, 2.5 for apartments in housing companies
  depreciationPrior: number; // EUR already depreciated in earlier years
  useDepreciation: boolean;
  monthlyRent: number;
}

export interface DB {
  settings: Settings;
  rents: RentEntry[];
  costs: CostEntry[];
}

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
