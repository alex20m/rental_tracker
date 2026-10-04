// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { render } from './support/render';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RentalApp from '@/components/RentalApp';
import {
  defaultSettings,
  type ApartmentView,
  type CostEntry,
  type PortfolioItem,
  type RentEntry,
} from '@/lib/domain/types';

const m = vi.hoisted(() => ({
  me: vi.fn(),
  portfolio: vi.fn(),
  apartment: vi.fn(),
  createApartment: vi.fn(),
  putRent: vi.fn(),
  createCost: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: m.replace, refresh: vi.fn() }) }));
vi.mock('@/lib/client/authClient', () => ({ authClient: () => ({ signOut: vi.fn().mockResolvedValue({}) }) }));
vi.mock('@/lib/client/declaration', () => ({ buildPackage: vi.fn(), buildPdf: vi.fn() }));
vi.mock('@/lib/client/api', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      me: m.me,
      portfolio: m.portfolio,
      apartment: m.apartment,
      createApartment: m.createApartment,
      putRent: m.putRent,
      createCost: m.createCost,
      receiptUrl: (id: string, c: string) => `/r/${id}/${c}`,
    },
    compressImage: vi.fn(),
    download: vi.fn(),
  };
});

const paid = (month: string, amount = 700): RentEntry => ({
  month,
  status: 'paid',
  amount,
  receivedDate: `${month}-03`,
  note: '',
});

function view(id: string, name: string, over: Partial<ApartmentView> = {}): ApartmentView {
  return {
    id,
    settings: { ...defaultSettings, name, address: `${name} street 1`, purchasePrice: 100000, monthlyRent: 700 },
    rents: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((mo) => paid(mo)),
    costs: [],
    owners: [{ userId: 'u1', email: 'me@example.test', sharePct: 100 }],
    invites: [],
    mySharePct: 100,
    ...over,
  };
}

const item = (v: ApartmentView): PortfolioItem => ({
  id: v.id,
  name: v.settings.name,
  address: v.settings.address,
  mySharePct: v.mySharePct,
  ownerCount: v.owners.length,
});

function serve(views: ApartmentView[], { name = 'Maija Meikäläinen', emailVerified = true } = {}) {
  m.me.mockResolvedValue({ userId: 'u1', name, email: 'me@example.test', emailVerified });
  m.portfolio.mockResolvedValue({ apartments: views.map(item), emailVerified });
  m.apartment.mockImplementation(async (id: string) => views.find((v) => v.id === id));
}

const user = () => userEvent.setup();

/** Rent and Costs share the "Rent & costs" tab: open it, then pick one with its switch. */
async function openLedger(which: 'Rent' | 'Costs') {
  await user().click(await screen.findByRole('button', { name: 'Rent & costs' }));
  await user().click(
    within(screen.getByRole('radiogroup', { name: 'Rent or costs' })).getByRole('radio', { name: which }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  localStorage.clear();
  Object.values(m).forEach((f) => f.mockReset());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('first run', () => {
  it('welcomes someone with no apartments and creates their first one from a single field', async () => {
    const created = view('a1', 'Flat 1');
    serve([]);
    m.createApartment.mockImplementation(async () => {
      serve([created]);
      return { id: 'a1' };
    });
    render(<RentalApp />);

    await screen.findByRole('heading', { name: 'Add your first apartment' });
    await user().type(screen.getByLabelText('Apartment name'), 'Flat 1');
    await user().click(screen.getByRole('button', { name: 'Add apartment' }));

    expect(m.createApartment).toHaveBeenCalledWith({ name: 'Flat 1' });
    expect(await screen.findByRole('heading', { name: 'Flat 1' })).toBeTruthy();
  });

  it('does not offer to add an apartment without a name', async () => {
    serve([]);
    render(<RentalApp />);
    await screen.findByRole('heading', { name: 'Add your first apartment' });
    expect((screen.getByRole('button', { name: 'Add apartment' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('moving between apartments', () => {
  const toPortfolio = async () => user().click(await screen.findByRole('button', { name: 'All apartments' }));

  it('names the apartment at the top and goes back to the portfolio from it', async () => {
    serve([view('a1', 'Alpha'), view('a2', 'Beta')]);
    render(<RentalApp />);
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeTruthy();

    await toPortfolio();
    expect(screen.queryByRole('heading', { name: 'Alpha' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Alpha/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Beta/ })).toBeTruthy();
    // The apartment's own tabs are not offered until one is opened.
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
  });

  it('opens another apartment at its Home from the portfolio', async () => {
    serve([view('a1', 'Alpha'), view('a2', 'Beta', { rents: [paid('2026-01', 1234)] })]);
    render(<RentalApp />);
    await openLedger('Costs');
    await toPortfolio();
    await user().click(screen.getByRole('button', { name: /^Beta/ }));

    expect(screen.getByRole('heading', { name: 'Beta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('net-income').textContent).toMatch(/1\s?234,00/);
  });

  it('adds an apartment only from the portfolio, and opens it', async () => {
    const created = view('a2', 'Beta');
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await screen.findByRole('heading', { name: 'Alpha' });
    expect(screen.queryByRole('button', { name: 'New apartment' })).toBeNull();

    await toPortfolio();
    m.createApartment.mockImplementation(async () => {
      serve([view('a1', 'Alpha'), created]);
      return { id: 'a2' };
    });
    await user().click(screen.getByRole('button', { name: 'New apartment' }));
    await user().type(screen.getByLabelText('Apartment name'), 'Beta');
    await user().click(screen.getByRole('button', { name: 'Add apartment' }));

    expect(m.createApartment).toHaveBeenCalledWith({ name: 'Beta' });
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeTruthy();
  });

  it('adds up your share of every apartment in the portfolio, with the account one tap away', async () => {
    serve([view('a1', 'Alpha'), view('a2', 'Beta', { rents: [paid('2026-01', 300)] })]);
    render(<RentalApp />);
    await toPortfolio();

    // 6 × 700 + 300 rent, nothing deducted
    expect(await screen.findByTestId('net-income')).toBeTruthy();
    expect(screen.getByTestId('net-income').textContent).toMatch(/4\s?500,00/);

    await user().click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('region', { name: 'Account' })).toBeTruthy();
  });

  it('steps the tax year with the arrows', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await screen.findByRole('heading', { name: 'Alpha' });
    expect(screen.getByLabelText('Tax year').textContent).toBe('2026');

    await user().click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByLabelText('Tax year').textContent).toBe('2025');
    expect(screen.getByTestId('net-income').textContent).toMatch(/0,00/);

    await user().click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByLabelText('Tax year').textContent).toBe('2026');
  });
});

describe('a co-owned apartment', () => {
  const shared = () =>
    view('a1', 'Alpha', {
      mySharePct: 50,
      owners: [
        { userId: 'u1', email: 'me@example.test', sharePct: 50 },
        { userId: 'u2', email: 'bob@example.test', sharePct: 50 },
      ],
    });

  it('shows your share first and the whole apartment on request', async () => {
    serve([shared()]);
    render(<RentalApp />);
    await screen.findByRole('heading', { name: 'Alpha' });
    // 6 × 700 = 4 200 for the apartment, half of it is mine
    expect(screen.getByTestId('net-income').textContent).toMatch(/2\s?100,00/);

    await user().click(screen.getByRole('radio', { name: 'Whole apartment' }));
    expect(screen.getByTestId('net-income').textContent).toMatch(/4\s?200,00/);

    await user().click(screen.getByRole('radio', { name: /Your share/ }));
    expect(screen.getByTestId('net-income').textContent).toMatch(/2\s?100,00/);
  });

  it('has no share toggle when you own all of it', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await screen.findByRole('heading', { name: 'Alpha' });
    expect(screen.queryByRole('radio', { name: 'Whole apartment' })).toBeNull();
  });
});

describe('the rent log', () => {
  it('logs a month in two taps using the usual rent and today’s date', async () => {
    serve([view('a1', 'Alpha', { rents: [] })]);
    m.putRent.mockResolvedValue({});
    render(<RentalApp />);
    await openLedger('Rent');

    await user().click(screen.getByRole('button', { name: /^Mar/ }));
    const sheet = screen.getByRole('dialog', { name: 'March 2026' });
    expect((within(sheet).getByLabelText('Amount received (€)') as HTMLInputElement).value).toBe('700');
    await user().click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(m.putRent).toHaveBeenCalledWith('a1', '2026-03', {
      status: 'paid',
      amount: 700,
      receivedDate: '2026-06-15',
      note: '',
    });
  });

  it('keeps the explanation behind an info icon instead of printing it', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await openLedger('Rent');

    expect(screen.queryByText(/taxed in the year/i)).toBeNull();
    await user().click(screen.getByRole('button', { name: 'About rent timing' }));
    expect(screen.getByRole('note').textContent).toMatch(/taxed in the year/i);
  });
});

describe('costs', () => {
  it('adds a cost by typing an amount and tapping a category', async () => {
    serve([view('a1', 'Alpha')]);
    m.createCost.mockResolvedValue({ id: 'c1' });
    render(<RentalApp />);
    await openLedger('Costs');
    await user().click(screen.getByRole('button', { name: 'Add cost' }));

    const sheet = screen.getByRole('dialog', { name: 'Add cost' });
    await user().type(within(sheet).getByLabelText('Amount (€)'), '45.5');
    await user().click(within(sheet).getByRole('radio', { name: 'Repairs & upkeep' }));
    await user().click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(m.createCost).toHaveBeenCalledWith('a1', {
      date: '2026-06-15',
      category: 'repairs',
      description: '',
      spreadYears: 10,
      amount: 45.5,
    });
  });

  it('cannot be saved without an amount', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await openLedger('Costs');
    await user().click(screen.getByRole('button', { name: 'Add cost' }));
    const sheet = screen.getByRole('dialog', { name: 'Add cost' });
    expect((within(sheet).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains through an info icon why the financing charge is not deductible', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await openLedger('Costs');
    await user().click(screen.getByRole('button', { name: 'Add cost' }));
    const sheet = screen.getByRole('dialog', { name: 'Add cost' });

    expect(within(sheet).queryByRole('button', { name: 'About not deductible' })).toBeNull();
    await user().click(within(sheet).getByRole('radio', { name: 'Financing charge' }));
    await user().click(within(sheet).getByRole('button', { name: 'About not deductible' }));
    expect(screen.getByRole('note').textContent).toMatch(/acquisition cost/);
  });

  it('shows a logged cost in the list with its date, category and amount', async () => {
    const cost: CostEntry = {
      id: 'c1',
      date: '2026-03-12',
      category: 'insurance',
      description: 'Home insurance',
      amount: 89,
      hasReceipt: false,
    };
    serve([view('a1', 'Alpha', { costs: [cost] })]);
    render(<RentalApp />);
    await openLedger('Costs');

    const row = screen.getByRole('button', { name: /Home insurance/ });
    expect(row.textContent).toContain('12 Mar');
    expect(row.textContent).toContain('Insurance');
    expect(row.textContent).toMatch(/89,00/);
  });
});

describe('the tax page', () => {
  it('has no declaration-name item to fix, because the name comes from the account', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));

    expect(screen.queryByText(/name (on|for) the declaration/i)).toBeNull();
  });

  it('shows every checklist item, ticked when fine', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));
    expect(screen.getByText('Every month logged')).toBeTruthy();
  });

  it('lists the Finnish form term behind an info icon on each expense line', async () => {
    const cost: CostEntry = {
      id: 'c1',
      date: '2026-03-12',
      category: 'maintenance_charge',
      description: '',
      amount: 200,
      hasReceipt: true,
    };
    serve([view('a1', 'Alpha', { costs: [cost] })]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));
    await user().click(screen.getByRole('button', { name: 'About Maintenance charge' }));
    expect(screen.getByRole('note').textContent).toMatch(/Hoitovastike/);
  });
});

describe('the home screen', () => {
  it('tells you what still needs doing and takes you there', async () => {
    serve([view('a1', 'Alpha', { rents: [paid('2026-01')] })]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: /5 months not logged yet/ }));
    // …and lands on the rent log, with the months still waiting to be logged
    expect(screen.getByRole('button', { name: /^Feb/ }).className).toContain('todo-m');
    expect(screen.getByRole('button', { name: 'Rent & costs' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('radio', { name: 'Rent' }).getAttribute('aria-checked')).toBe('true');
  });

  it('lists recent activity with readable months and no fake income for an unpaid month', async () => {
    const unpaid: RentEntry = { month: '2026-06', status: 'unpaid', amount: 0, receivedDate: '', note: '' };
    serve([view('a1', 'Alpha', { rents: [paid('2026-05'), unpaid] })]);
    render(<RentalApp />);

    const may = await screen.findByRole('button', { name: /Rent May 2026/ });
    expect(may.textContent).toMatch(/\+\s?700,00/);
    const jun = screen.getByRole('button', { name: /Unpaid June 2026/ });
    expect(jun.textContent).not.toMatch(/\+|0,00/);
  });

  it('offers four places in the bottom navigation, with history inside Tax rather than a tab of its own', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Home', 'Rent & costs', 'Tax', 'Settings']);
  });

  it('shows at most three to-do items and counts the rest, leading to the Tax checklist', async () => {
    const cost = (id: string): CostEntry => ({
      id,
      date: '2026-03-12',
      category: 'repairs',
      description: '',
      amount: 50,
      hasReceipt: false,
    });
    serve([
      view('a1', 'Alpha', {
        settings: { ...defaultSettings, name: 'Alpha', purchasePrice: 0 },
        rents: [paid('2026-01')],
        costs: [cost('c1')],
        invites: [{ id: 'i1', email: 'x@example.test', sharePct: 10 }],
      }),
    ]);
    render(<RentalApp />);

    // Four things are wrong (price, months, receipts, invite): three are listed.
    await screen.findByRole('button', { name: /5 months not logged yet/ });
    expect(document.querySelectorAll('.todo .dot')).toHaveLength(3);
    await user().click(screen.getByRole('button', { name: '1 more to check' }));
    expect(screen.getByRole('button', { name: 'Tax' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Before you file' })).toBeTruthy();
  });

  it('only offers the declaration from Home once nothing is left to fix', async () => {
    const months = Array.from({ length: 12 }, (_, i) => paid(`2026-${String(i + 1).padStart(2, '0')}`));
    serve([view('a1', 'Alpha', { rents: months })]);
    render(<RentalApp />);

    await user().click(await screen.findByRole('button', { name: 'Prepare the 2026 declaration' }));
    expect(screen.getByRole('heading', { name: 'Before you file' })).toBeTruthy();
  });

  it('keeps Home to a hero and a way to start while nothing is logged this year', async () => {
    serve([view('a1', 'Alpha', { rents: [] })]);
    render(<RentalApp />);

    await screen.findByText('Nothing logged yet.');
    expect(screen.queryByRole('img', { name: /by month/ })).toBeNull();
    expect(screen.queryByText('Occupancy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare the 2026 declaration' })).toBeNull();
  });

  it('marks the active section in the bottom navigation', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    await user().click(within(nav).getByRole('button', { name: 'Rent & costs' }));
    expect(within(nav).getByRole('button', { name: 'Rent & costs' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
  });

  it('nudges an unverified email address toward verification', async () => {
    serve([view('a1', 'Alpha')], { emailVerified: false });
    render(<RentalApp />);
    const link = await screen.findByRole('link', { name: /Verify your email/ });
    expect(link.getAttribute('href')).toBe('/sign-in?verify=me%40example.test');
  });
});

describe('settings', () => {
  it('opens from the bottom navigation and leaves through it', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');

    await user().click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
  });

  it('only offers to save once something has changed', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Settings' }));
    await user().click(await screen.findByRole('button', { name: /^Property details/ }));
    await screen.findByRole('heading', { name: 'Property details' });
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();

    await user().type(screen.getByLabelText('Address'), 'x');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });
});

describe('settings topics', () => {
  const coOwned = () =>
    view('a1', 'Alpha', {
      owners: [
        { userId: 'u1', email: 'me@example.test', sharePct: 60 },
        { userId: 'u2', email: 'bob@example.test', sharePct: 40 },
      ],
      mySharePct: 60,
      settings: {
        ...defaultSettings,
        name: 'Alpha',
        address: 'Alpha street 1',
        useDepreciation: true,
        depreciationRate: 2.5,
        propertyType: 'property',
      },
    });

  it('lists the topics with a one-line summary of each', async () => {
    serve([coOwned()]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('button', { name: /^Owners.*2 owners · you own 60 %/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Property details.*Alpha street 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Building depreciation.*On · 2.5 % a year/ })).toBeTruthy();
  });

  it('opens one topic at a time and goes back to the list', async () => {
    serve([coOwned()]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Settings' }));
    await user().click(screen.getByRole('button', { name: /^Owners/ }));

    expect(screen.getByRole('heading', { name: 'Owners' })).toBeTruthy();
    expect(screen.getByText('bob@example.test')).toBeTruthy();
    expect(screen.queryByLabelText('Address')).toBeNull();

    await user().click(screen.getByRole('button', { name: 'Back to settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByText('bob@example.test')).toBeNull();
  });

  it('keeps an unsaved change while moving between topics, and still offers to save it', async () => {
    serve([coOwned()]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Settings' }));
    await user().click(screen.getByRole('button', { name: /^Property details/ }));
    await user().type(screen.getByLabelText('Address'), ' B');
    await user().click(screen.getByRole('button', { name: 'Back to settings' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: /^Property details/ }));
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('Alpha street 1 B');
  });
});

describe('history', () => {
  it('lists this year and every earlier year with data, newest first, skipping years with nothing logged', async () => {
    serve([view('a1', 'Alpha', { rents: [paid('2024-03', 500), paid('2026-01', 700)] })]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));
    await user().click(await screen.findByRole('radio', { name: 'All years' }));

    const years = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(years).toHaveLength(2);
    expect(years[0]).toMatch(/^2026/);
    expect(years[0]).toMatch(/700,00/);
    expect(years[1]).toMatch(/^2024/);
    expect(years[1]).toMatch(/500,00/);
    expect(screen.getByTestId('history-total').textContent).toMatch(/1\s?200,00/);
  });

  it('opens a year’s tax summary when the year is tapped', async () => {
    serve([view('a1', 'Alpha', { rents: [paid('2024-03', 500)] })]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));
    await user().click(await screen.findByRole('radio', { name: 'All years' }));
    await user().click(screen.getByRole('button', { name: /^2024/ }));

    expect(screen.getByRole('button', { name: 'Tax' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByLabelText('Tax year').textContent).toBe('2024');
  });

  it('says earlier years will appear once there is data for them', async () => {
    serve([view('a1', 'Alpha')]);
    render(<RentalApp />);
    await user().click(await screen.findByRole('button', { name: 'Tax' }));
    await user().click(await screen.findByRole('radio', { name: 'All years' }));
    expect(screen.getByText(/Earlier years appear here/)).toBeTruthy();
  });
});
