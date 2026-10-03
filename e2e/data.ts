import type { ApartmentView } from '../lib/domain/types';
import { FakeApi, ME } from './fakeApi';

export const YEAR = new Date().getFullYear();
export const m = (n: number) => `${YEAR}-${String(n).padStart(2, '0')}`;

/** A year's ordinary ledger: rent paid Jan–Mar, April vacant, a repair, an insurance bill, a financing charge. */
export function ledger(): Pick<ApartmentView, 'rents' | 'costs'> {
  return {
    rents: [
      { month: m(1), status: 'paid', amount: 800, receivedDate: `${m(1)}-03`, note: '' },
      { month: m(2), status: 'paid', amount: 800, receivedDate: `${m(2)}-03`, note: '' },
      { month: m(3), status: 'paid', amount: 800, receivedDate: `${m(3)}-03`, note: '' },
      { month: m(4), status: 'vacant', amount: 0, receivedDate: '', note: 'Between tenants' },
    ],
    costs: [
      { id: 'c-repair', date: `${m(2)}-10`, category: 'repairs', description: 'Kitchen tap', amount: 120, hasReceipt: false },
      { id: 'c-insurance', date: `${m(3)}-01`, category: 'insurance', description: '', amount: 96, hasReceipt: false },
      { id: 'c-financing', date: `${m(3)}-05`, category: 'financing_charge', description: 'Rahoitusvastike', amount: 80, hasReceipt: false },
    ],
  };
}

/** Owned 60 % by the viewer, 25 % by Bob, and 15 % offered to Carol, who has not joined. */
export function coOwned(api: FakeApi, name = 'Kauppakatu 12') {
  return api.addApartment(
    { name, address: 'Kauppakatu 12 B 7, Vaasa', purchasePrice: 100000, useDepreciation: true, monthlyRent: 800 },
    {
      ...ledger(),
      owners: [
        { ...ME, sharePct: 60 },
        { userId: 'usr_bob', email: 'bob@example.test', sharePct: 25 },
      ],
      invites: [{ id: '99999999-0000-4000-8000-000000000001', email: 'carol@example.test', sharePct: 15 }],
      mySharePct: 60,
    },
  );
}
