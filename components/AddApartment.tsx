'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { ErrorNote } from '@/components/ui';

/** The whole of "add an apartment": a name. Everything else can be filled in later. */
export default function AddApartment({
  onCreated,
  autoFocus,
}: {
  onCreated: (id: string) => Promise<void>;
  autoFocus?: boolean;
}) {
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
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <label htmlFor="new-apartment" style={{ marginTop: 0 }}>
        Apartment name
      </label>
      <input
        id="new-apartment"
        autoFocus={autoFocus}
        value={name}
        placeholder="e.g. Kauppakatu 12 B 7"
        onChange={(e) => setName(e.target.value)}
      />
      <ErrorNote message={error} />
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !name.trim()}>
        {busy ? 'Adding…' : 'Add apartment'}
      </button>
    </form>
  );
}
