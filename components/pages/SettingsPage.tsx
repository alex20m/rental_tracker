'use client';

import { useState } from 'react';
import type { ApartmentSettings, ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeDepreciation, eur, pct } from '@/lib/domain/tax';
import { isWholeApartment, shareTotal } from '@/lib/domain/shares';
import { Avatar, ErrorNote, Heading, Icon, Info, Label, Sheet, Switch } from '@/components/ui';
import type { Account } from '@/components/RentalApp';

type Props = {
  apt: ApartmentView;
  account: Account;
  onBack: () => void;
  onChanged: () => Promise<void>;
  /** The apartment is no longer the viewer's: deleted, or they left it. */
  onGone: () => Promise<void>;
};

export default function SettingsPage({ apt, account, onBack, onChanged, onGone }: Props) {
  return (
    <>
      <div className="pagehead">
        <button className="iconbtn" aria-label="Back" onClick={onBack}>
          {Icon.left}
        </button>
        <h1>Apartment settings</h1>
      </div>
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
function Owners({ apt, account, onChanged, onGone }: Omit<Props, 'onBack'>) {
  const me = apt.owners.find((o) => o.userId === account.userId);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction(onChanged);

  const rows = [
    ...apt.owners.map((o) => ({
      key: `owner:${o.userId}`,
      label: o.email,
      sharePct: o.sharePct,
      owner: o,
      invite: undefined,
    })),
    ...apt.invites.map((i) => ({
      key: `invite:${i.id}`,
      label: i.email,
      sharePct: i.sharePct,
      owner: undefined,
      invite: i,
    })),
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

  return (
    <section>
      <Heading
        info={
          <Info about="owners and shares">
            Sharing gives another owner access to this apartment only — your other apartments stay private. Shares must
            add up to exactly 100 %. An owner with 0 % can be removed or can leave.
          </Info>
        }
        action={
          !editing &&
          rows.length > 1 && (
            <button className="link" onClick={startEditing}>
              Edit shares
            </button>
          )
        }
      >
        Owners
      </Heading>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.key} className="row owner">
            <Avatar text={r.label} />
            <div className="main">
              <div className="t">
                {r.label}
                {r.owner && r.owner === me && (
                  <span className="chip" style={{ marginLeft: 6 }}>
                    you
                  </span>
                )}
                {r.invite && (
                  <>
                    <span className="chip warn" style={{ marginLeft: 6 }}>
                      invited
                    </span>
                    <Info about="invites">They get access when they sign in with this email address.</Info>
                  </>
                )}
              </div>
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
              <span className="pct">{pct(r.sharePct)}</span>
            )}
            {!editing && r.invite && (
              <button
                className="btn danger small"
                disabled={busy}
                onClick={() => run(() => api.revokeInvite(apt.id, r.invite!.id))}
              >
                Withdraw
              </button>
            )}
            {!editing && r.owner && r.owner !== me && r.owner.sharePct === 0 && (
              <button
                className="btn danger small"
                disabled={busy}
                onClick={() => run(() => api.removeOwner(apt.id, r.owner!.userId))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <>
          <p className={'msg ' + (isWholeApartment(draftValues) ? '' : 'neg')} style={{ marginTop: 10 }}>
            Total {pct(total)}
            {isWholeApartment(draftValues) ? '' : ' — must be exactly 100 %'}
          </p>
          <div className="sheet-foot">
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveShares} disabled={busy || !isWholeApartment(draftValues)}>
              Save shares
            </button>
          </div>
        </>
      ) : (
        <button
          className="row-btn"
          style={{ borderBottom: 0, color: 'var(--brand)', fontWeight: 600 }}
          onClick={() => setInviting(true)}
        >
          {Icon.plus}
          <div className="main">Invite a co-owner</div>
        </button>
      )}

      {me && apt.owners.length > 1 && !editing && (
        <div className="row" style={{ borderBottom: 0, paddingTop: 0 }}>
          <button
            className="link danger"
            disabled={busy || me.sharePct !== 0}
            style={me.sharePct !== 0 ? { opacity: 0.5 } : undefined}
            onClick={() => {
              if (confirm(`Leave ${apt.settings.name}? You will lose access to it.`)) {
                void run(async () => {
                  await api.removeOwner(apt.id, me.userId);
                  await onGone();
                });
              }
            }}
          >
            Leave this apartment
          </button>
          {me.sharePct !== 0 && (
            <Info about="leaving">Give your share to the other owners first (set it to 0 %), then you can leave.</Info>
          )}
        </div>
      )}
      <ErrorNote message={error} />

      {inviting && (
        <InviteSheet apt={apt} me={me?.sharePct ?? 0} onClose={() => setInviting(false)} onChanged={onChanged} />
      )}
    </section>
  );
}

function InviteSheet({
  apt,
  me,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  me: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [share, setShare] = useState('');
  const { busy, error, run } = useAction(onChanged);

  const send = () =>
    run(async () => {
      await api.invite(apt.id, email.trim(), Number(share));
      onClose();
    });

  return (
    <Sheet title="Invite a co-owner" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="invite-email" style={{ marginTop: 6 }}>
          Their email
        </label>
        <input
          id="invite-email"
          type="email"
          autoFocus
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Label
          htmlFor="invite-share"
          info={
            <Info about="their share">
              Their share is taken from yours ({pct(me)} now). You can rebalance everyone afterwards with “Edit shares”.
              Only this apartment is shared.
            </Info>
          }
        >
          Their share (%)
        </Label>
        <input
          id="invite-share"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={me || 100}
          placeholder="e.g. 50"
          value={share}
          onChange={(e) => setShare(e.target.value)}
        />
        <ErrorNote message={error} />
        <div className="sheet-foot">
          <button className="btn primary" disabled={busy || !email.trim() || !(Number(share) > 0)}>
            {busy ? 'Sharing…' : 'Share apartment'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PropertyForm({ apt, onChanged }: { apt: ApartmentView; onChanged: () => Promise<void> }) {
  const [s, setS] = useState<ApartmentSettings>(apt.settings);
  const { busy, error, run } = useAction(onChanged);
  const dirty = JSON.stringify(s) !== JSON.stringify(apt.settings);

  const set = <K extends keyof ApartmentSettings>(k: K, v: ApartmentSettings[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (Number(e.target.value) || 0) as never);
  const text = (k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.value as never);

  const save = () => run(() => api.updateSettings(apt.id, s));

  return (
    <>
      <section>
        <Heading>Details</Heading>
        <label htmlFor="s-name" style={{ marginTop: 6 }}>
          Name
        </label>
        <input id="s-name" value={s.name} onChange={text('name')} />
        <label htmlFor="s-address">Address</label>
        <input id="s-address" value={s.address} onChange={text('address')} />
        <Label
          htmlFor="s-company"
          info={<Info about="the housing company">Asunto-osakeyhtiö — the company that owns the building.</Info>}
        >
          Housing company
        </Label>
        <input id="s-company" value={s.housingCompany} onChange={text('housingCompany')} />
        <div className="cols">
          <div>
            <label htmlFor="s-date">Purchase date</label>
            <input id="s-date" type="date" value={s.purchaseDate} onChange={text('purchaseDate')} />
          </div>
          <div>
            <Label
              htmlFor="s-price"
              info={<Info about="the purchase price">The price of the whole apartment, not just your share.</Info>}
            >
              Purchase price (€)
            </Label>
            <input
              id="s-price"
              type="number"
              inputMode="decimal"
              value={s.purchasePrice || ''}
              onChange={num('purchasePrice')}
            />
          </div>
        </div>
        <Label
          htmlFor="s-rent"
          info={<Info about="the usual rent">Pre-fills the amount when you log a month in the rent log.</Info>}
        >
          Usual monthly rent (€)
        </Label>
        <input
          id="s-rent"
          type="number"
          inputMode="decimal"
          value={s.monthlyRent || ''}
          onChange={num('monthlyRent')}
        />
      </section>

      <section>
        <Heading
          info={
            <Info about="depreciation">
              Poisto — a yearly deduction for the building’s wear, calculated on its remaining cost. 2.5 % a year is the
              usual rate for apartments; check vero.fi for your case.
            </Info>
          }
        >
          Depreciation
        </Heading>
        <Switch checked={s.useDepreciation} onChange={(v) => set('useDepreciation', v)}>
          Deduct depreciation in the declaration
        </Switch>
        {s.useDepreciation && (
          <>
            <div className="cols">
              <div>
                <Label
                  htmlFor="s-share"
                  info={
                    <Info about="the depreciable share">
                      The part of the purchase price that is the building, not the land — only the building depreciates.
                    </Info>
                  }
                >
                  Building share (%)
                </Label>
                <input
                  id="s-share"
                  type="number"
                  inputMode="decimal"
                  value={s.buildingSharePct}
                  onChange={num('buildingSharePct')}
                />
              </div>
              <div>
                <label htmlFor="s-rate">Rate (% / year)</label>
                <input
                  id="s-rate"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={s.depreciationRate}
                  onChange={num('depreciationRate')}
                />
              </div>
            </div>
            <Label
              htmlFor="s-prior"
              info={
                <Info about="earlier depreciation">
                  Total already deducted in earlier years, for the whole apartment.
                </Info>
              }
            >
              Depreciated in earlier years (€)
            </Label>
            <input
              id="s-prior"
              type="number"
              inputMode="decimal"
              value={s.depreciationPrior || ''}
              onChange={num('depreciationPrior')}
            />
            <div className="kv" style={{ marginTop: 8, borderBottom: 0 }}>
              <span>
                This year
                <Info about="this year’s depreciation">
                  For the whole apartment; it is split between the owners by their shares.
                </Info>
              </span>
              <b className="num">{eur(computeDepreciation({ settings: s }))}</b>
            </div>
          </>
        )}
      </section>

      <ErrorNote message={error} />
      {dirty && <div style={{ height: 64 }} />}
      {dirty && (
        <div className="savebar">
          <div>
            <button className="btn" onClick={() => setS(apt.settings)} disabled={busy}>
              Discard
            </button>
            <button className="btn primary" onClick={save} disabled={busy || !s.name.trim()}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DangerZone({ apt, account, onGone }: { apt: ApartmentView; account: Account; onGone: () => Promise<void> }) {
  const { busy, error, run } = useAction(onGone);
  const alone = apt.owners.length === 1 && apt.owners[0]!.userId === account.userId;
  if (!alone) return null;
  return (
    <section>
      <button
        className="link danger"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete ${apt.settings.name} and everything in it? This cannot be undone.`)) {
            void run(() => api.deleteApartment(apt.id));
          }
        }}
      >
        Delete this apartment
      </button>
      <Info about="deleting">
        Deletes the apartment with its rent log, costs and receipt photos. Your other apartments aren’t affected.
      </Info>
      <ErrorNote message={error} />
    </section>
  );
}
