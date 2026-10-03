// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RentalApp from '@/components/RentalApp';
import { I18nProvider } from '@/components/I18nProvider';
import { defaultSettings, type ApartmentView } from '@/lib/domain/types';

const m = vi.hoisted(() => ({ me: vi.fn(), portfolio: vi.fn(), profile: vi.fn(), apartment: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/client/authClient', () => ({ authClient: () => ({ signOut: vi.fn() }) }));
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
    api: { me: m.me, portfolio: m.portfolio, profile: m.profile, apartment: m.apartment, receiptUrl: () => '/r' },
    compressImage: vi.fn(),
    download: vi.fn(),
  };
});

const flat: ApartmentView = {
  id: 'a1',
  settings: { ...defaultSettings, name: 'Alpha', purchasePrice: 100000 },
  rents: [],
  costs: [],
  owners: [{ userId: 'u1', email: 'me@example.test', sharePct: 100 }],
  invites: [],
  mySharePct: 100,
};

const app = () =>
  render(
    <I18nProvider>
      <RentalApp />
    </I18nProvider>,
  );

const setBrowserLanguages = (languages: string[]) =>
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  localStorage.clear();
  m.me.mockResolvedValue({ userId: 'u1', email: 'me@example.test', emailVerified: true });
  m.portfolio.mockResolvedValue({
    apartments: [{ id: 'a1', name: 'Alpha', address: '', mySharePct: 100, ownerCount: 1 }],
    emailVerified: true,
  });
  m.profile.mockResolvedValue({ taxpayerName: 'Maija' });
  m.apartment.mockResolvedValue(flat);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.documentElement.lang = '';
});

describe('choosing a language', () => {
  it('switches the whole screen to Swedish from the menu and remembers the choice', async () => {
    app();
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Svenska' }));

    // The open menu, the navigation behind it and the page all change language.
    expect(screen.getByRole('dialog', { name: 'Meny' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kostnader' })).toBeTruthy();
    expect(screen.getByText('Förbered deklarationen 2026')).toBeTruthy();
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(localStorage.getItem('rental-tracker:language')).toBe('sv');
    expect(document.documentElement.lang).toBe('sv');
  });

  it('switches to Finnish, including pluralised and dated text', async () => {
    app();
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Suomi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sulje' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vuokra' }));

    // The month grid is in Finnish.
    expect(screen.getAllByText('tammi').length).toBeGreaterThan(0);
    expect(screen.queryByText('Jan')).toBeNull();
  });

  it('starts in the language the person chose last time', async () => {
    localStorage.setItem('rental-tracker:language', 'fi');
    app();
    expect(await screen.findByRole('button', { name: 'Kulut' })).toBeTruthy();
  });

  it('starts in Swedish for a browser that prefers Swedish and has no saved choice', async () => {
    setBrowserLanguages(['sv-SE', 'en']);
    app();
    expect(await screen.findByRole('button', { name: 'Kostnader' })).toBeTruthy();
  });

  it('stays in English for a browser language we do not offer', async () => {
    setBrowserLanguages(['de-DE']);
    app();
    expect(await screen.findByRole('button', { name: 'Costs' })).toBeTruthy();
  });
});
