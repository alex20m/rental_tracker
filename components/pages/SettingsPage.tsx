'use client';

import { useState } from 'react';
import type { ApartmentSettings, ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeDepreciation, eur, pct } from '@/lib/domain/tax';
import { isWholeApartment, shareTotal } from '@/lib/domain/shares';
import { ErrorNote } from '@/components/ui';
import type { Account } from '@/components/RentalApp';

type Props = {
  apt: ApartmentView;
  account: Account;
  onChanged: () => Promise<void>;
  /** The apartment is no longer the viewer's: deleted, or they left it. */
  onGone: () => Promise<void>;
};

export default function SettingsPage({ apt, account, onChanged, onGone }: Props) {
  return (
    <>
      <Owners key={`owners-${apt.id}`} apt={apt} account={account} onChanged={onChanged} onGone={onGone} />
      <PropertyForm key={`settings-${apt.id}`} apt={apt} onChanged={onChanged} />
      <DangerZone apt={apt} account={account} onGone={onGone} />
    </>
  );
}

function useAction(onDone: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return { busy, error, run };
}

/**
 * Who owns how much of this one apartment. Sharing here shares this apartment
 * only; the rest of each owner's portfolio stays private to them.
 */
function Owners({ apt, account, onChanged, onGone }: Props) {
  const me = apt.owners.find((o) => o.userId === account.userId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [inviteShare, setInviteShare] = useState('');
  const { busy, error, run } = useAction(onChanged);

  const rows = [
    ...apt.owners.map((o) => ({ key: `owner:${o.userId}`, label: o.email, sharePct: o.sharePct, pending: false, owner: o, invite: undefined })),
    ...apt.invites.map((i) => ({ key: `invite:${i.id}`, label: i.email, sharePct: i.sharePct, pending: true, owner: undefined, invite: i })),
  ];
  const draftValues = rows.map((r) => Number(draft[r.key]));
  const total = shareTotal(draftValues);

  const startEditing = () => {
    setDraft(Object.fromEntries(rows.map((r) => [r.key, String(r.sharePct)])));
    setEditing(true);
  };

  const saveShares = () =>
    run(async () => {
      await api.setShares(apt.id, {
        owners: apt.owners.map((o) => ({ userId: o.userId, sharePct: Number(draft[`owner:${o.userId}`]) })),
        invites: apt.invites.map((i) => ({ id: i.id, sharePct: Number(draft[`invite:${i.id}`]) })),
      });
      setEditing(false);
    });

  const sendInvite = () =>
    run(async () => {
      await api.invite(apt.id, email.trim(), Number(inviteShare));
      setEmail('');
      setInviteShare('');
    });

  return (
    <div className="card">
      <h2>Owners &amp; shares</h2>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.key} style={{ cursor: 'default' }}>
            <div className="main">
              <div className="t">
                {r.label}
                {r.owner && r.owner === me && <span className="chip" style={{ marginLeft: 6 }}>you</span>}
              </div>
              {r.pending && (
                <div className="s">
                  <span className="chip warn">invited</span> Gets access when they sign in with this email.
                </div>
              )}
            </div>
            {editing ? (
              <input
                aria-label={`Share for ${r.label}`}
                className="pct-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={draft[r.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
              />
            ) : (
              <b>{pct(r.sharePct)}</b>
            )}
            {!editing && r.invite && (
              <button className="btn danger small" disabled={busy} onClick={() => run(() => api.revokeInvite(apt.id, r.invite!.id))}>
                Withdraw
              </button>
            )}
            {!editing && r.owner && r.owner !== me && r.owner.sharePct === 0 && (
              <button className="btn danger small" disabled={busy} onClick={() => run(() => api.removeOwner(apt.id, r.owner!.userId))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <>
          <div className={'note ' + (isWholeApartment(draftValues) ? '' : 'neg')} style={{ marginTop: 8 }}>
            Total {pct(total)} — must be exactly 100 %.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveShares} disabled={busy || !isWholeApartment(draftValues)}>
              Save shares
            </button>
          </div>
        </>
      ) : (
        rows.length > 1 && (
          <button className="btn" style={{ marginTop: 10 }} onClick={startEditing}>
            Change shares
          </button>
        )
      )}

      {!editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendInvite();
          }}
        >
          <label htmlFor="invite-email">Share this apartment with another owner</label>
          <input
            id="invite-email"
            type="email"
            placeholder="their@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
            <span className="note" style={{ flex: 'none' }}>
              Their share
            </span>
            <input
              aria-label="Their share in percent"
              className="pct-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={me?.sharePct ?? 100}
              placeholder="%"
              value={inviteShare}
              onChange={(e) => setInviteShare(e.target.value)}
            />
            <button className="btn primary" style={{ flex: 'none' }} disabled={busy || !email.trim() || !(Number(inviteShare) > 0)}>
              Share
            </button>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            Their share is taken from yours ({pct(me?.sharePct ?? 0)} now); adjust everyone afterwards with
            “Change shares”. Only this apartment is shared — your other apartments stay private.
          </div>
        </form>
      )}
      {me && apt.owners.length > 1 && !editing && (
        <button
          className="btn danger"
          style={{ marginTop: 12 }}
          disabled={busy || me.sharePct !== 0}
          title={me.sharePct !== 0 ? 'Give your share to the other owners first' : undefined}
          onClick={() => {
            if (confirm(`Leave ${apt.settings.name}? You will lose access to it.`)) {
              void run(async () => {
                await api.removeOwner(apt.id, me.userId);
                await onGone();
              });
            }
          }}
        >
          Leave this apartment{me.sharePct !== 0 ? ' (set your share to 0 % first)' : ''}
        </button>
      )}
      <ErrorNote message={error} />
    </div>
  );
}

function PropertyForm({ apt, onChanged }: { apt: ApartmentView; onChanged: () => Promise<void> }) {
  const [s, setS] = useState<ApartmentSettings>(apt.settings);
  const [saved, setSaved] = useState('');
  const { busy, error, run } = useAction(onChanged);
  const dirty = JSON.stringify(s) !== JSON.stringify(apt.settings);

  const set = <K extends keyof ApartmentSettings>(k: K, v: ApartmentSettings[K]) => {
    setSaved('');
    setS({ ...s, [k]: v });
  };
  const num = (k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (Number(e.target.value) || 0) as never);
  const text = (k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);

  const save = () =>
    run(async () => {
      await api.updateSettings(apt.id, s);
      setSaved('Saved.');
    });

  return (
    <>
      <div className="card">
        <h2>Property</h2>
        <label htmlFor="s-name">Name</label>
        <input id="s-name" value={s.name} onChange={text('name')} />
        <label htmlFor="s-address">Address</label>
        <input id="s-address" value={s.address} onChange={text('address')} />
        <label htmlFor="s-company">Housing company (asunto-osakeyhtiö)</label>
        <input id="s-company" value={s.housingCompany} onChange={text('housingCompany')} />
        <div className="row">
          <div>
            <label htmlFor="s-date">Purchase date</label>
            <input id="s-date" type="date" value={s.purchaseDate} onChange={text('purchaseDate')} />
          </div>
          <div>
            <label htmlFor="s-price">Purchase price, whole apartment (€)</label>
            <input id="s-price" type="number" inputMode="decimal" value={s.purchasePrice || ''} onChange={num('purchasePrice')} />
          </div>
        </div>
        <label htmlFor="s-rent">Usual monthly rent (€)</label>
        <input id="s-rent" type="number" inputMode="decimal" value={s.monthlyRent || ''} onChange={num('monthlyRent')} />
      </div>

      <div className="card">
        <h2>Depreciation (poisto)</h2>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text)' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={s.useDepreciation}
            onChange={(e) => set('useDepreciation', e.target.checked)}
          />
          Deduct depreciation in the declaration
        </label>
        {s.useDepreciation && (
          <>
            <div className="row">
              <div>
                <label htmlFor="s-share">Depreciable share (%)</label>
                <input id="s-share" type="number" inputMode="decimal" value={s.buildingSharePct} onChange={num('buildingSharePct')} />
              </div>
              <div>
                <label htmlFor="s-rate">Rate (% / year)</label>
                <input id="s-rate" type="number" inputMode="decimal" step="0.1" value={s.depreciationRate} onChange={num('depreciationRate')} />
              </div>
            </div>
            <label htmlFor="s-prior">Already depreciated in earlier years, whole apartment (€)</label>
            <input id="s-prior" type="number" inputMode="decimal" value={s.depreciationPrior || ''} onChange={num('depreciationPrior')} />
            <div className="note" style={{ marginTop: 8 }}>
              Yearly depreciation for the whole apartment: <b>{eur(computeDepreciation({ settings: s }))}</b>, split
              between the owners by their shares. 2.5% on the remaining cost is the usual rate for apartments; check
              vero.fi for your case.
            </div>
          </>
        )}
      </div>

      <ErrorNote message={error} />
      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button className="btn primary" onClick={save} disabled={busy || !dirty || !s.name.trim()}>
          {busy ? 'Saving…' : 'Save apartment details'}
        </button>
        {saved && !dirty && <span className="note">{saved}</span>}
      </div>
    </>
  );
}

function DangerZone({ apt, account, onGone }: { apt: ApartmentView; account: Account; onGone: () => Promise<void> }) {
  const { busy, error, run } = useAction(onGone);
  const alone = apt.owners.length === 1 && apt.owners[0]!.userId === account.userId;
  if (!alone) return null;
  return (
    <div className="card">
      <h2>Delete</h2>
      <div className="note" style={{ marginBottom: 10 }}>
        Deletes this apartment with its rent log, costs and receipt photos. Your other apartments are not affected.
      </div>
      <button
        className="btn danger"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete ${apt.settings.name} and everything in it? This cannot be undone.`)) {
            void run(() => api.deleteApartment(apt.id));
          }
        }}
      >
        Delete apartment
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
