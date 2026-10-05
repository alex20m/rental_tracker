'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ApartmentSettings, ApartmentView } from '@/lib/domain/types';
import { BUILDING_KINDS, FURNISHINGS, PROPERTY_TYPES, ROOM_CLASSES } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeDepreciation, depreciationStartYear, eur, pct } from '@/lib/domain/tax';
import { rulesFor } from '@/lib/domain/taxRules';
import { ruleParams } from '@/lib/ui/ruleParams';
import { isWholeApartment, shareTotal } from '@/lib/domain/shares';
import { advancedChoices } from '@/lib/ui/advancedChoices';
import Recurring from '@/components/pages/Recurring';
import { Avatar, ErrorNote, Heading, Icon, Info, Label, Sheet, Switch } from '@/components/ui';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';

type Props = {
  apt: ApartmentView;
  /** The tax year on screen: its rules decide the limits shown, and which year's depreciation is previewed. */
  year: number;
  account: Account;
  onChanged: () => Promise<void>;
  /** The apartment is no longer the viewer's: deleted, or they left it. */
  onGone: () => Promise<void>;
};

type View = 'owners' | 'details' | 'recurring' | 'advanced';

/**
 * Everything adjustable about this one apartment, as a short list: each row
 * opens one topic on its own, so nothing is a wall of fields. What only a few
 * landlords need — a property of one's own, part of the home let, building
 * depreciation — is behind "Advanced". Edits to the details and the advanced
 * settings are kept while moving between topics and saved together from one bar.
 */
export default function SettingsPage({ apt, year, account, onChanged, onGone }: Props) {
  const { t, tn } = useI18n();
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<ApartmentSettings>(apt.settings);
  // Functional, so two changes made in one handler (a kind of building and its rate) both stick.
  const set = <K extends keyof ApartmentSettings>(k: K, v: ApartmentSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const back = () => setView(null);
  const saved = apt.settings;
  const alone = apt.owners.length === 1;

  if (view === 'owners') {
    return (
      <>
        <SubPage
          title={t('settings.owners')}
          onBack={back}
          info={<Info about={t('settings.ownersAbout')}>{t('settings.ownersInfo')}</Info>}
        />
        <Owners key={`owners-${apt.id}`} apt={apt} account={account} onChanged={onChanged} onGone={onGone} />
      </>
    );
  }
  if (view === 'recurring') {
    return (
      <>
        <SubPage
          title={t('settings.recurring')}
          onBack={back}
          info={<Info about={t('settings.recurringAbout')}>{t('settings.recurringInfo')}</Info>}
        />
        <Recurring key={`recurring-${apt.id}`} apt={apt} onChanged={onChanged} />
      </>
    );
  }
  if (view === 'details' || view === 'advanced') {
    return (
      <>
        {view === 'details' ? (
          <SubPage title={t('settings.details')} onBack={back} />
        ) : (
          <SubPage
            title={t('settings.advanced')}
            onBack={back}
            info={<Info about={t('settings.advancedAbout')}>{t('settings.advancedInfo')}</Info>}
          />
        )}
        {view === 'details' ? (
          <DetailsFields s={draft} set={set} />
        ) : (
          <AdvancedFields s={draft} set={set} year={year} apt={apt} />
        )}
        <SaveBar apt={apt} draft={draft} onDiscard={() => setDraft(saved)} onChanged={onChanged} />
      </>
    );
  }

  const owners = alone
    ? t('settings.ownersSolo')
    : t('settings.ownersShared', {
        n: apt.owners.length + apt.invites.length,
        pct: pct(apt.mySharePct),
      });
  const choices = advancedChoices(saved);
  const advanced = choices.length ? choices.map(([key, params]) => t(key, params)).join(' · ') : t('settings.advancedStandard');

  return (
    <>
      <div className="pagehead">
        <h1>{t('settings.title')}</h1>
      </div>
      <div className="card">
        <ul className="list">
          {(
            [
              ['owners', Icon.users, t('settings.owners'), owners],
              [
                'details',
                Icon.building,
                t('settings.details'),
                saved.address || t(`settings.type.${saved.propertyType}`),
              ],
              [
                'recurring',
                Icon.rent,
                t('settings.recurring'),
                apt.recurring.length ? tn('settings.recurringCount', apt.recurring.length) : t('settings.recurringNone'),
              ],
              ['advanced', Icon.stack, t('settings.advanced'), advanced],
            ] as const
          ).map(([id, icon, title, summary]) => (
            <li key={id}>
              <button className="row-btn" onClick={() => setView(id)}>
                {icon}
                <div className="main">
                  <div className="t">{title}</div>
                  <div className="s">{summary}</div>
                </div>
                {Icon.right}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <DangerZone apt={apt} account={account} onGone={onGone} />
      <SaveBar apt={apt} draft={draft} onDiscard={() => setDraft(saved)} onChanged={onChanged} />
    </>
  );
}

/** A topic's header: a way back to the list, its title, and optionally an explanation. */
function SubPage({ title, onBack, info }: { title: string; onBack: () => void; info?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="pagehead">
      <button className="iconbtn" aria-label={t('settings.back')} onClick={onBack}>
        {Icon.left}
      </button>
      <h1>{title}</h1>
      {info}
    </div>
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
function Owners({ apt, account, onChanged, onGone }: Omit<Props, 'year'>) {
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
        owners: apt.owners.map((o) => ({
          userId: o.userId,
          sharePct: Number(draft[`owner:${o.userId}`]),
        })),
        invites: apt.invites.map((i) => ({
          id: i.id,
          sharePct: Number(draft[`invite:${i.id}`]),
        })),
      });
      setEditing(false);
    });

  return (
    <section>
      {!editing && rows.length > 1 && (
        <div className="heading end">
          <button className="link" onClick={startEditing}>
            {t('settings.editShares')}
          </button>
        </div>
      )}
      <ul className="list card">
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
          {me.sharePct !== 0 && <Info about={t('settings.leavingAbout')}>{t('settings.leavingInfo')}</Info>}
        </div>
      )}
      <ErrorNote message={error} />

      {inviting && <InviteSheet apt={apt} me={me.sharePct} onClose={() => setInviting(false)} onChanged={onChanged} />}
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
          info={<Info about={t('settings.theirShareAbout')}>{t('settings.theirShareInfo', { pct: pct(me) })}</Info>}
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

type FieldsProps = {
  s: ApartmentSettings;
  set: <K extends keyof ApartmentSettings>(k: K, v: ApartmentSettings[K]) => void;
  year: number;
};

const numberField = (set: FieldsProps['set'], k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
  set(k, (Number(e.target.value) || 0) as never);
const textField = (set: FieldsProps['set'], k: keyof ApartmentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
  set(k, e.target.value as never);

function DetailsFields({ s, set }: Omit<FieldsProps, 'year'>) {
  const { t } = useI18n();
  const num = (k: keyof ApartmentSettings) => numberField(set, k);
  const text = (k: keyof ApartmentSettings) => textField(set, k);
  return (
    <>
      <section>
        <label htmlFor="s-name" style={{ marginTop: 6 }}>
          {t('settings.name')}
        </label>
        <input id="s-name" value={s.name} onChange={text('name')} />
        <label htmlFor="s-address">{t('settings.address')}</label>
        <input id="s-address" value={s.address} onChange={text('address')} />
        <Label htmlFor="s-company" info={<Info about={t('settings.companyAbout')}>{t('settings.companyInfo')}</Info>}>
          {t('settings.company')}
        </Label>
        <input id="s-company" value={s.housingCompany} onChange={text('housingCompany')} />
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

    </>
  );
}

function AdvancedFields({ s, set, year, apt }: FieldsProps & { apt: ApartmentView }) {
  const { t, lang } = useI18n();
  const num = (k: keyof ApartmentSettings) => numberField(set, k);
  const text = (k: keyof ApartmentSettings) => textField(set, k);
  const params = ruleParams(year, lang);
  return (
    <>
      <section>
        <Label id="s-type" info={<Info about={t('settings.propertyTypeAbout')}>{t('settings.propertyTypeInfo')}</Info>}>
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
      </section>

      <section>
        <div className="cols" style={{ marginTop: 0 }}>
          <div>
            <label htmlFor="s-date">{t('settings.purchaseDate')}</label>
            <input id="s-date" type="date" value={s.purchaseDate} onChange={text('purchaseDate')} />
          </div>
          <div>
            <Label
              htmlFor="s-price"
              info={<Info about={t('settings.purchasePriceAbout')}>{t('settings.purchasePriceInfo')}</Info>}
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
      </section>

      <section>
        <Heading info={<Info about={t('settings.lettingAbout')}>{t('settings.lettingInfo')}</Info>}>
          {t('settings.letting')}
        </Heading>
        <Label
          htmlFor="s-let-share"
          info={<Info about={t('settings.letShareAbout')}>{t('settings.letShareInfo')}</Info>}
        >
          {t('settings.letShare')}
        </Label>
        <input
          id="s-let-share"
          type="number"
          inputMode="decimal"
          min="1"
          max="100"
          value={s.letSharePct || ''}
          onChange={num('letSharePct')}
        />
        <div style={{ marginTop: 12 }}>
          <Switch checked={s.belowMarketRent} onChange={(v) => set('belowMarketRent', v)}>
            {t('settings.belowMarket')}
          </Switch>
          <Info about={t('settings.belowMarketAbout')}>{t('settings.belowMarketInfo')}</Info>
        </div>
        <Label
          id="s-furnishing"
          info={<Info about={t('settings.furnishingAbout')}>{t('settings.furnishingInfo', params)}</Info>}
        >
          {t('settings.furnishing')}
        </Label>
        <div className="chips" role="radiogroup" aria-labelledby="s-furnishing">
          {FURNISHINGS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={s.furnishing === k}
              className="choice"
              onClick={() => set('furnishing', k)}
            >
              {t(`settings.furnishing.${k}`)}
            </button>
          ))}
        </div>
        {s.furnishing === 'flat' && (
          <>
            <Label id="s-room-class">{t('settings.roomClass')}</Label>
            <div className="chips" role="radiogroup" aria-labelledby="s-room-class">
              {ROOM_CLASSES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={s.roomClass === k}
                  className="choice"
                  onClick={() => set('roomClass', k)}
                >
                  {t(`settings.roomClass.${k}`)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <DepreciationFields s={s} set={set} year={year} apt={apt} />
    </>
  );
}

function DepreciationFields({ s, set, year, apt }: FieldsProps & { apt: ApartmentView }) {
  const { t, lang } = useI18n();
  const num = (k: keyof ApartmentSettings) => numberField(set, k);
  const rules = rulesFor(year);
  const params = ruleParams(year, lang);
  return (
    <section>
      <Heading info={<Info about={t('settings.depreciationAbout')}>{t('settings.depreciationInfo', params)}</Info>}>
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
          <Label
            id="s-kind"
            info={<Info about={t('settings.buildingKindAbout')}>{t('settings.buildingKindInfo', params)}</Info>}
          >
            {t('settings.buildingKind')}
          </Label>
          <div className="chips" role="radiogroup" aria-labelledby="s-kind">
            {BUILDING_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={s.buildingKind === k}
                className="choice"
                onClick={() => {
                  set('buildingKind', k);
                  set('depreciationRate', rules.buildingRate[k]);
                }}
              >
                {t(`settings.buildingKind.${k}`)}
              </button>
            ))}
          </div>
          <div className="cols">
            <div>
              <Label
                htmlFor="s-share"
                info={<Info about={t('settings.buildingShareAbout')}>{t('settings.buildingShareInfo')}</Info>}
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
              <Label
                htmlFor="s-rate"
                info={
                  <Info about={t('settings.rateAbout')}>
                    {t('settings.rateInfo', {
                      max: rules.buildingRate[s.buildingKind],
                    })}
                  </Info>
                }
              >
                {t('settings.rate')}
              </Label>
              <input
                id="s-rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                max={rules.buildingRate[s.buildingKind]}
                value={s.depreciationRate}
                onChange={num('depreciationRate')}
              />
            </div>
          </div>
          <Label
            htmlFor="s-costs"
            info={<Info about={t('settings.purchaseCostsAbout')}>{t('settings.purchaseCostsInfo')}</Info>}
          >
            {t('settings.purchaseCosts')}
          </Label>
          <input
            id="s-costs"
            type="number"
            inputMode="decimal"
            value={s.purchaseCosts || ''}
            onChange={num('purchaseCosts')}
          />
          <div className="cols">
            <div>
              <Label
                htmlFor="s-from"
                info={<Info about={t('settings.fromYearAbout')}>{t('settings.fromYearInfo')}</Info>}
              >
                {t('settings.fromYear')}
              </Label>
              <input
                id="s-from"
                type="number"
                inputMode="numeric"
                step="1"
                placeholder={String(
                  depreciationStartYear({ ...apt, settings: { ...s, depreciationFromYear: 0 } }, year),
                )}
                value={s.depreciationFromYear || ''}
                onChange={num('depreciationFromYear')}
              />
            </div>
            <div>
              <Label htmlFor="s-prior" info={<Info about={t('settings.priorAbout')}>{t('settings.priorInfo')}</Info>}>
                {t('settings.prior')}
              </Label>
              <input
                id="s-prior"
                type="number"
                inputMode="decimal"
                value={s.depreciationPrior || ''}
                onChange={num('depreciationPrior')}
              />
            </div>
          </div>
          <div className="kv" style={{ marginTop: 8, borderBottom: 0 }}>
            <span>
              {t('settings.thisYear')}
              <Info about={t('settings.thisYearAbout')}>{t('settings.thisYearInfo')}</Info>
            </span>
            <b className="num">{eur(computeDepreciation({ ...apt, settings: s }, year))}</b>
          </div>
        </>
      )}
    </section>
  );
}

/** Appears the moment something differs from what is saved, wherever in Settings you are. */
function SaveBar({
  apt,
  draft,
  onDiscard,
  onChanged,
}: {
  apt: ApartmentView;
  draft: ApartmentSettings;
  onDiscard: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { busy, error, run } = useAction(onChanged);
  const dirty = JSON.stringify(draft) !== JSON.stringify(apt.settings);
  return (
    <>
      <ErrorNote message={error} />
      {dirty && <div style={{ height: 64 }} />}
      {dirty && (
        <div className="savebar">
          <div>
            <button className="btn" onClick={onDiscard} disabled={busy}>
              {t('settings.discard')}
            </button>
            <button
              className="btn primary"
              onClick={() => run(() => api.updateSettings(apt.id, draft))}
              disabled={busy || !draft.name.trim()}
            >
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
