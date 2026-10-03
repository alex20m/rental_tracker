'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { authClient } from '@/lib/client/authClient';
import { fromV1Backup } from '@/lib/domain/v1Backup';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import { Avatar, ErrorNote, Icon, Info, Label, Sheet } from '@/components/ui';

type Props = {
  account: Account;
  /** The apartment being looked at, if any — its settings are one tap away. */
  apartmentName?: string;
  onSettings: () => void;
  onClose: () => void;
  onAccountChanged: (a: Account) => void;
  onImported: () => Promise<void>;
};

/** Everything about you rather than about an apartment. */
export default function MenuSheet({
  account,
  apartmentName,
  onSettings,
  onClose,
  onAccountChanged,
  onImported,
}: Props) {
  const router = useRouter();
  const { t } = useI18n();
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
      setMsg(t('menu.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importBackup = async (file: File) => {
    setBusy(true);
    setError('');
    setMsg(t('menu.importing'));
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
      const name = converted.payload.settings.name;
      setMsg(failed ? t('menu.importedPartial', { name, failed }) : t('menu.imported', { name }));
    } catch (e) {
      setMsg('');
      setError(t('menu.importFailed', { message: (e as Error).message }));
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
    <Sheet title={t('menu.title')} onClose={onClose}>
      <div className="row" style={{ borderBottom: 0, paddingTop: 4 }}>
        <Avatar text={account.taxpayerName || account.email} />
        <div className="main">
          <div className="t">{account.taxpayerName || t('menu.signedIn')}</div>
          <div className="s">{account.email}</div>
        </div>
      </div>

      {apartmentName && (
        <button className="row-btn" onClick={onSettings}>
          {Icon.gear}
          <div className="main">
            <div className="t">{t('menu.apartmentSettings')}</div>
            <div className="s">{apartmentName}</div>
          </div>
          {Icon.right}
        </button>
      )}

      <Label
        htmlFor="taxpayer"
        info={
          <Info about={t('menu.nameAbout')}>{t('menu.nameInfo')}</Info>
        }
      >
        {t('menu.nameLabel')}
      </Label>
      <div className="cols" style={{ alignItems: 'center' }}>
        <input id="taxpayer" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn"
          style={{ flex: 'none' }}
          onClick={saveName}
          disabled={name.trim() === account.taxpayerName}
        >
          {t('menu.saveName')}
        </button>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="row-btn"
          style={{ flex: 1, padding: 0, border: 0, width: 'auto' }}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {Icon.upload}
          <div className="main">
            <div className="t">{t('menu.import')}</div>
          </div>
        </button>
        <Info about={t('menu.importAbout')}>{t('menu.importInfo')}</Info>
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
        <p className="msg" style={{ marginTop: 8 }}>
          {msg}
        </p>
      )}
      <ErrorNote message={error} />

      <div style={{ marginTop: 14 }}>
        <LanguagePicker />
      </div>

      <button className="row-btn" style={{ borderBottom: 0, color: 'var(--bad)' }} onClick={signOut}>
        {Icon.signout}
        <div className="main">
          <div className="t">{t('menu.signOut')}</div>
        </div>
      </button>
    </Sheet>
  );
}
