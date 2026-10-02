import { replaceAll } from './store';
import { defaultSettings } from './store';
import type { CostEntry, RentEntry } from './types';

/** Sample data used only by the single-file preview build, so the screens aren't empty. */
export function seedDemo() {
  const year = new Date().getFullYear();
  const rents: RentEntry[] = [];
  for (let m = 1; m <= 9; m++) {
    const mm = String(m).padStart(2, '0');
    const vacant = m === 4;
    rents.push({
      id: 'r' + m,
      month: `${year}-${mm}`,
      status: vacant ? 'vacant' : 'paid',
      amount: vacant ? 0 : 780,
      receivedDate: vacant ? '' : `${year}-${mm}-03`,
      note: vacant ? 'Between tenants' : '',
    });
  }
  const costs: CostEntry[] = [
    ...Array.from({ length: 9 }, (_, i) => ({
      id: 'v' + i,
      date: `${year}-${String(i + 1).padStart(2, '0')}-05`,
      category: 'maintenance_charge' as const,
      description: 'Hoitovastike',
      amount: 205,
      hasReceipt: false,
    })),
    { id: 'c1', date: `${year}-04-18`, category: 'repairs', description: 'Kitchen tap replacement', amount: 142.5, hasReceipt: false },
    { id: 'c2', date: `${year}-02-10`, category: 'insurance', description: 'Home insurance', amount: 96, hasReceipt: false },
    { id: 'c3', date: `${year}-05-02`, category: 'brokerage', description: 'Tenant search fee', amount: 450, hasReceipt: false },
    { id: 'c4', date: `${year}-03-01`, category: 'financing_charge', description: 'Rahoitusvastike', amount: 80, hasReceipt: false },
  ];
  replaceAll({
    settings: {
      ...defaultSettings,
      taxpayerName: 'Demo Owner',
      propertyName: 'Demo apartment',
      address: 'Esimerkkikatu 1 B 12, 65100 Vaasa',
      housingCompany: 'Demo Asunto Oy',
      purchaseDate: `${year - 1}-08-15`,
      purchasePrice: 95000,
      monthlyRent: 780,
      useDepreciation: true,
    },
    rents,
    costs,
  });
}
