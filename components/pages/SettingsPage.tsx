'use client';

import { useState } from 'react';
import type { ApartmentSettings, ApartmentView } from '@/lib/domain/types';
import { PROPERTY_TYPES } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeDepreciation, eur, pct } from '@/lib/domain/tax';
import { isWholeApartment, shareTotal } from '@/lib/domain/shares';
import { Avatar, ErrorNote, Heading, Icon, Info, Label, Sheet, Switch } from '@/components/ui';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';

type Props = {
  apt: ApartmentView;
  account: Account;
  onChanged: () => Promise<void>;
  /** The apartment is no longer the viewer's: deleted, or they left it. */
  onGone: () => Promise<void>;
};

/** Everything adjustable about this one apartment: its owners, details and depreciation. */
export default function SettingsPage({ apt, account, onChanged, onGone }: Props) {
  const { t } = useI18n();
  return (
    <>
      <div className="pagehead">
        <h1>{t('settings.title')}</h1>
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
function Owners({ apt, account, onChanged, onGone }: Props) {
  const { t } = useI18n();
  // The viewer reaches an apartment only as one of its owners.
  const me = apt.owners.find((o) => o.userId === account.userId)!;
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
          <Info about={t('settings.ownersAbout')}>{t('settings.ownersInfo')}</Info>
        }
        action={
          !editing &&
          rows.length > 1 && (
            <button className="link" onClick={startEditing}>
              {t('settings.editShares')}
            </button>
          )
        }
      >
        {t('settings.owners')}
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
                    {t('settings.you')}
                  </span>
                )}
                {r.invite && (
                  <>
                    <span className="chip warn" style={{ marginLeft: 6 }}>
                      {t('settings.invited')}
                    </span>
                    <Info about={t('settings.invitesAbout')}>{t('settings.invitesInfo')}</Info>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <input
                aria-label={t('settings.shareFor', { who: r.label })}
                className="pct-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={draft[r.key]!}
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
                {t('settings.withdraw')}
              </button>
            )}
            {!editing && r.owner && r.owner !== me && r.owner.sharePct === 0 && (
              <button
                className="btn danger small"
                disabled={busy}
                onClick={() => run(() => api.removeOwner(apt.id, r.owner!.userId))}
              >
                {t('common.remove')}
              </button>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <>
          <p className={'msg ' + (isWholeApartment(draftValues) ? '' : 'neg')} style={{ marginTop: 10 }}>
            {t('settings.total', { pct: pct(total) })}
            {isWholeApartment(draftValues) ? '' : t('settings.mustBe100')}
          </p>
          <div className="sheet-foot">
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={saveShares} disabled={busy || !isWholeApartment(draftValues)}>
              {t('settings.saveShares')}
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
          <div className="main">{t('settings.invite')}</div>
        </button>
      )}

      {apt.owners.length > 1 && !editing && (
        <div className="row" style={{ borderBottom: 0, paddingTop: 0 }}>
          <button
            className="link danger"
            disabled={busy || me.sharePct !== 0}
            style={me.sharePct !== 0 ? { opacity: 0.5 } : undefined}
            onClick={() => {
              if (confirm(t('settings.leaveConfirm', { name: apt.settings.name }))) {
                void run(async () => {
                  await api.removeOwner(apt.id, me.userId);
                  await onGone();
                });
              }
            }}
          >
            {t('settings.leave')}
          </button>
          {me.sharePct !== 0 && (
            <Info about={t('settings.leavingAbout')}>{t('settings.leavingInfo')}</Info>
          )}
        </div>
      )}
      <ErrorNote message={error} />

      {inviting && (
        <InviteSheet apt={apt} me={me.sharePct} onClose={() => setInviting(false)} onChanged={onChanged} />
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
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [share, setShare] = useState('');
  const { busy, error, run } = useAction(onChanged);

  const send = () =>
    run(async () => {
      await api.invite(apt.id, email.trim(), Number(share));
      onClose();
    });

  return (
    <Sheet title={t('settings.invite')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="invite-email" style={{ marginTop: 6 }}>
          {t('settings.theirEmail')}
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
            <Info about={t('settings.theirShareAbout')}>{t('settings.theirShareInfo', { pct: pct(me) })}</Info>
          }
        >
          {t('settings.theirShare')}
        </Label>
        <input
          id="invite-share"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={me}
          placeholder={t('settings.sharePlaceholder')}
          value={share}
          onChange={(e) => setShare(e.target.value)}
        />
        <ErrorNote message={error} />
        <div className="sheet-foot">
          <button className="btn primary" disabled={busy || !email.trim() || !(Number(share) > 0)}>
            {busy ? t('settings.sharing') : t('settings.shareApartment')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PropertyForm({ apt, onChanged }: { apt: ApartmentView; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
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
        <Heading>{t('settings.details')}</Heading>
        <label htmlFor="s-name" style={{ marginTop: 6 }}>
          {t('settings.name')}
        </label>
        <input id="s-name" value={s.name} onChange={text('name')} />
        <label htmlFor="s-address">{t('settings.address')}</label>
        <input id="s-address" value={s.address} onChange={text('address')} />
        <Label
          htmlFor="s-company"
          info={<Info about={t('settings.companyAbout')}>{t('settings.companyInfo')}</Info>}
        >
          {t('settings.company')}
        </Label>
        <input id="s-company" value={s.housingCompany} onChange={text('housingCompany')} />
        <Label
          id="s-type"
          info={<Info about={t('settings.propertyTypeAbout')}>{t('settings.propertyTypeInfo')}</Info>}
        >
          {t('settings.propertyType')}
        </Label>
        <div className="chips" role="radiogroup" aria-labelledby="s-type">
          {PROPERTY_TYPES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={s.propertyType === k}
              className="choice"
              onClick={() => set('propertyType', k)}
            >
              {t(`settings.type.${k}`)}
            </button>
          ))}
        </div>
        {s.propertyType === 'share' && (
          <>
            <Label info={<Info about={t('settings.financingAbout')}>{t('settings.financingInfo')}</Info>}>
              {t('cat.financing_charge.label')}
            </Label>
            <Switch checked={s.financingChargeDeductible} onChange={(v) => set('financingChargeDeductible', v)}>
              {t('settings.financingDeductible')}
            </Switch>
          </>
        )}
        <div className="cols">
          <div>
            <label htmlFor="s-date">{t('settings.purchaseDate')}</label>
            <input id="s-date" type="date" value={s.purchaseDate} onChange={text('purchaseDate')} />
          </div>
          <div>
            <Label
              htmlFor="s-price"
              info={
                <Info about={t('settings.purchasePriceAbout')}>{t('settings.purchasePriceInfo')}</Info>
              }
            >
              {t('settings.purchasePrice')}
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
          info={<Info about={t('settings.monthlyRentAbout')}>{t('settings.monthlyRentInfo')}</Info>}
        >
          {t('settings.monthlyRent')}
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
            <Info about={t('settings.depreciationAbout')}>{t('settings.depreciationInfo')}</Info>
          }
        >
          {t('settings.depreciation')}
        </Heading>
        {s.propertyType === 'share' ? (
          <p className="msg">{t('settings.noBuildingDepreciation')}</p>
        ) : (
          <Switch checked={s.useDepreciation} onChange={(v) => set('useDepreciation', v)}>
            {t('settings.useDepreciation')}
          </Switch>
        )}
        {s.propertyType === 'property' && s.useDepreciation && (
          <>
            <div className="cols">
              <div>
                <Label
                  htmlFor="s-share"
                  info={
                    <Info about={t('settings.buildingShareAbout')}>{t('settings.buildingShareInfo')}</Info>
                  }
                >
                  {t('settings.buildingShare')}
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
                <label htmlFor="s-rate">{t('settings.rate')}</label>
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
                <Info about={t('settings.priorAbout')}>{t('settings.priorInfo')}</Info>
              }
            >
              {t('settings.prior')}
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
                {t('settings.thisYear')}
                <Info about={t('settings.thisYearAbout')}>{t('settings.thisYearInfo')}</Info>
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
              {t('settings.discard')}
            </button>
            <button className="btn primary" onClick={save} disabled={busy || !s.name.trim()}>
              {busy ? t('common.saving') : t('settings.saveChanges')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DangerZone({ apt, account, onGone }: { apt: ApartmentView; account: Account; onGone: () => Promise<void> }) {
  const { t } = useI18n();
  const { busy, error, run } = useAction(onGone);
  const alone = apt.owners.length === 1 && apt.owners[0]!.userId === account.userId;
  if (!alone) return null;
  return (
    <section>
      <button
        className="link danger"
        disabled={busy}
        onClick={() => {
          if (confirm(t('settings.deleteConfirm', { name: apt.settings.name }))) {
            void run(() => api.deleteApartment(apt.id));
          }
        }}
      >
        {t('settings.delete')}
      </button>
      <Info about={t('settings.deleteAbout')}>{t('settings.deleteInfo')}</Info>
      <ErrorNote message={error} />
    </section>
  );
}
