'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { authClient } from '@/lib/client/authClient';
import { fromV1Backup } from '@/lib/domain/v1Backup';
import { computeTax, eur, ownerShare, pct, portfolioTotals } from '@/lib/domain/tax';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import { ErrorNote } from '@/components/ui';
import type { Account } from '@/components/RentalApp';

type Props = {
  items: PortfolioItem[];
  details: Record<string, ApartmentView>;
  year: number;
  account: Account;
  onOpen: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
  onAccountChanged: (a: Account) => void;
};

export default function Portfolio({ items, details, year, account, onOpen, onCreated, onChanged, onAccountChanged }: Props) {
  const shares = items.flatMap((i) => {
    const d = details[i.id];
    return d ? [{ item: i, share: ownerShare(computeTax(d, year), d.mySharePct) }] : [];
  });
  const total = portfolioTotals(shares.map((s) => s.share));

  return (
    <>
      {!account.emailVerified && (
        <div className="alert">
          Your email address isn&apos;t verified yet, so apartments other owners have shared with{' '}
          <b>{account.email}</b> can&apos;t be added to your portfolio yet.{' '}
          <a href={`/sign-in?verify=${encodeURIComponent(account.email)}`}>Verify it now →</a>
        </div>
      )}

      {items.length > 0 && (
        <div className="card">
          <h2>Your share of the portfolio in {year}</h2>
          <div className="grid2">
            <div className="stat">
              <div className="v">{eur(total.rentIncome)}</div>
              <div className="l">Rent received</div>
            </div>
            <div className="stat">
              <div className="v">{eur(total.deductibleCosts + total.depreciation)}</div>
              <div className="l">Deductions incl. depreciation</div>
            </div>
            <div className="stat">
              <div className={'v ' + (total.netIncome >= 0 ? 'pos' : 'neg')}>{eur(total.netIncome)}</div>
              <div className="l">Taxable net income</div>
            </div>
            <div className="stat">
              <div className="v">{eur(total.estimatedTax)}</div>
              <div className="l">Est. tax on the total</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Apartments</h2>
        {items.length === 0 ? (
          <div className="empty">No apartments yet. Add your first one below, or import a backup from the old version.</div>
        ) : (
          <ul className="list">
            {items.map((i) => {
              const s = shares.find((x) => x.item.id === i.id)?.share;
              return (
                <li key={i.id} onClick={() => onOpen(i.id)}>
                  <div className="main">
                    <div className="t">{i.name}</div>
                    <div className="s">
                      You own {pct(i.mySharePct)}
                      {i.ownerCount > 1 ? ` · ${i.ownerCount} owners` : ''}
                      {i.address ? ` · ${i.address}` : ''}
                    </div>
                  </div>
                  {s && (
                    <div className={s.netIncome >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 600 }} title={`Your net income ${year}`}>
                      {eur(s.netIncome)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <AddApartment onCreated={onCreated} />
      </div>

      <AccountCard account={account} onAccountChanged={onAccountChanged} onImported={onChanged} />
    </>
  );
}

function AddApartment({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      const { id } = await api.createApartment({ name: name.trim() });
      setName('');
      await onCreated(id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <form
      className="row"
      style={{ marginTop: 12, alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <div style={{ flex: 2 }}>
        <label htmlFor="new-apartment">New apartment</label>
        <input id="new-apartment" value={name} placeholder="e.g. Kauppakatu 12 B 7" onChange={(e) => setName(e.target.value)} />
      </div>
      <button className="btn primary" disabled={busy || !name.trim()} style={{ flex: 'none' }}>
        Add
      </button>
      {error && <ErrorNote message={error} />}
    </form>
  );
}

function AccountCard({
  account,
  onAccountChanged,
  onImported,
}: {
  account: Account;
  onAccountChanged: (a: Account) => void;
  onImported: () => Promise<void>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(account.taxpayerName);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setError('');
    try {
      await api.setProfile(name.trim());
      onAccountChanged({ ...account, taxpayerName: name.trim() });
      setMsg('Saved.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importBackup = async (file: File) => {
    setBusy(true);
    setError('');
    setMsg('Importing…');
    try {
      const converted = fromV1Backup(JSON.parse(await file.text()));
      const { id } = await api.importLedger(converted.payload);
      let failed = 0;
      for (const r of converted.receipts) {
        await api.putReceipt(id, r.costId, r.dataUrl).catch(() => failed++);
      }
      if (converted.taxpayerName && !account.taxpayerName) {
        await api.setProfile(converted.taxpayerName);
        onAccountChanged({ ...account, taxpayerName: converted.taxpayerName });
        setName(converted.taxpayerName);
      }
      await onImported();
      setMsg(
        `Imported “${converted.payload.settings.name}” as a new apartment` +
          (failed ? `, but ${failed} receipt photo(s) could not be uploaded.` : '.'),
      );
    } catch (e) {
      setMsg('');
      setError('Import failed: ' + (e as Error).message);
    }
    setBusy(false);
  };

  const signOut = async () => {
    await authClient()
      .signOut()
      .catch(() => {});
    router.replace('/sign-in');
  };

  return (
    <div className="card">
      <h2>Account</h2>
      <div className="note">Signed in as {account.email}</div>
      <label htmlFor="taxpayer">Your name on declarations</label>
      <div className="row">
        <input id="taxpayer" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" style={{ flex: 'none' }} onClick={saveName} disabled={name.trim() === account.taxpayerName}>
          Save
        </button>
      </div>
      <div className="note" style={{ marginTop: 6 }}>
        Don&apos;t enter your personal identity number — it isn&apos;t needed.
      </div>

      <label>Data from the old version</label>
      <div className="note" style={{ marginBottom: 8 }}>
        The first version kept everything in one browser. Export a backup there (Settings → Export backup) and
        import it here to bring that apartment, its rent log, costs and receipt photos over.
      </div>
      <div className="row">
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          Import backup (.json)
        </button>
        <button className="btn danger" onClick={signOut}>
          Sign out
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importBackup(f);
        }}
      />
      {msg && (
        <div className="note" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
