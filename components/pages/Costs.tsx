'use client';

import { useRef, useState } from 'react';
import type { ApartmentView, CostCategory, CostEntry } from '@/lib/domain/types';
import { CATEGORIES, COST_CATEGORIES } from '@/lib/domain/types';
import { api, compressImage } from '@/lib/client/api';
import { eur } from '@/lib/domain/tax';
import { shortDate } from '@/lib/ui/format';
import { ErrorNote, Icon, Info, Label, Money, Sheet } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

function Thumb({ apt, cost }: { apt: ApartmentView; cost: CostEntry }) {
  return cost.hasReceipt ? (
    // eslint-disable-next-line @next/next/no-img-element -- a private, per-user image; not for the image optimizer
    <img className="thumb" src={api.receiptUrl(apt.id, cost.id)} alt="Receipt" loading="lazy" />
  ) : (
    <span className="thumb missing" role="img" aria-label="No receipt photo" title="No receipt photo yet">
      {Icon.camera}
    </span>
  );
}

export default function Costs({ apt, year, onChanged }: Props) {
  const [editing, setEditing] = useState<CostEntry | 'new' | null>(null);
  const list = apt.costs.filter((c) => c.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.filter((c) => CATEGORIES[c.category].deductible).reduce((a, c) => a + c.amount, 0);
  const coOwned = apt.owners.length > 1 || apt.invites.length > 0;

  return (
    <>
      <section className="hero">
        <div className="label">
          Deductible costs · {year}
          <Info about="costs">
            {list.length} {list.length === 1 ? 'entry' : 'entries'} this year. Financing charges are listed but not
            counted — they aren’t deductible.
            {coOwned && ' Log costs for the whole apartment — each owner’s share is worked out for you.'}
          </Info>
        </div>
        <div className="big">
          <Money value={total} />
        </div>
      </section>

      <section>
        {list.length === 0 ? (
          <div className="empty">No costs logged for {year}. Tap + to add the first one.</div>
        ) : (
          <ul className="list">
            {list.map((c) => (
              <li key={c.id}>
                <button className="row-btn" onClick={() => setEditing(c)}>
                  <Thumb apt={apt} cost={c} />
                  <div className="main">
                    <div className="t">{c.description || CATEGORIES[c.category].label}</div>
                    <div className="s">
                      {shortDate(c.date)}
                      {c.description && ` · ${CATEGORIES[c.category].label}`}{' '}
                      {!CATEGORIES[c.category].deductible && <span className="chip warn">not deductible</span>}
                    </div>
                  </div>
                  <div className={'strong num ' + (CATEGORIES[c.category].deductible ? '' : 'dim')}>
                    {eur(c.amount)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn primary fab" aria-label="Add cost" onClick={() => setEditing('new')}>
        {Icon.plus}
      </button>
      {editing && (
        <CostForm
          apt={apt}
          cost={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function CostForm({
  apt,
  cost,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  cost?: CostEntry;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [date, setDate] = useState(cost?.date ?? todayIso());
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? 'maintenance_charge');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [amount, setAmount] = useState(cost ? String(cost.amount) : '');
  const [newImage, setNewImage] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = cost?.hasReceipt ? api.receiptUrl(apt.id, cost.id) : undefined;
  const preview = removeImage ? undefined : (newImage ?? existing);

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      setNewImage(await compressImage(f));
      setRemoveImage(false);
    } catch {
      setError('Could not read that image.');
    }
    setBusy(false);
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const entry = { date, category, description: description.trim(), amount: Number(amount) || 0 };
      const id = cost
        ? (await api.updateCost(apt.id, cost.id, entry), cost.id)
        : (await api.createCost(apt.id, entry)).id;
      if (newImage) await api.putReceipt(apt.id, id, newImage);
      else if (removeImage && cost?.hasReceipt) await api.deleteReceipt(apt.id, id);
    });

  const remove = () => run(() => api.deleteCost(apt.id, cost!.id));

  const cat = CATEGORIES[category];

  return (
    <Sheet title={cost ? 'Edit cost' : 'Add cost'} onClose={onClose}>
      <label htmlFor="cost-amount" style={{ marginTop: 6 }}>
        Amount (€)
      </label>
      <input
        id="cost-amount"
        className="amount-input"
        type="number"
        inputMode="decimal"
        step="0.01"
        autoFocus={!cost}
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <Label id="cost-category" info={<Info about="this category">On the Finnish form: {cat.fi}.</Info>}>
        Category
      </Label>
      <div className="chips" role="radiogroup" aria-labelledby="cost-category">
        {COST_CATEGORIES.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={category === k}
            className="choice"
            onClick={() => setCategory(k)}
          >
            {CATEGORIES[k].label}
          </button>
        ))}
      </div>
      {!cat.deductible && (
        <div style={{ marginTop: 8 }}>
          <span className="chip warn">Not deductible</span>
          <Info about="not deductible">{cat.hint}</Info>
        </div>
      )}

      <label htmlFor="cost-description">Description</label>
      <input
        id="cost-description"
        value={description}
        placeholder="Optional — e.g. Kitchen tap replacement"
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="cols">
        <div>
          <label htmlFor="cost-date">Date</label>
          <input id="cost-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cost-receipt">Receipt</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            id="cost-receipt"
            className="btn block"
            style={{ padding: '11px 8px' }}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {Icon.camera}
            {busy ? 'Processing…' : preview ? 'Replace photo' : 'Add photo'}
          </button>
        </div>
      </div>
      {preview && (
        <div className="receipt-box" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or a private, per-user image */}
          <img className="receipt-img" src={preview} alt="Receipt preview" />
          <div className="receipt-tools">
            <button
              className="btn danger"
              onClick={() => {
                setNewImage(undefined);
                setRemoveImage(true);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <ErrorNote message={error} />
      <div className="sheet-foot">
        {cost && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={!(Number(amount) > 0 && date) || busy}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
