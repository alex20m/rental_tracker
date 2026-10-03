'use client';

import { pct } from '@/lib/domain/tax';
import type { Scope } from '@/components/RentalApp';
import { Segmented } from '@/components/ui';

/** Co-owned apartments only: your share (what you declare) or the whole apartment. */
export default function ScopeToggle({
  sharePct,
  scope,
  onScope,
}: {
  sharePct: number;
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  return (
    <Segmented<Scope>
      label="Figures for"
      value={scope}
      onChange={onScope}
      options={[
        { value: 'mine', label: `Your share · ${pct(sharePct)}` },
        { value: 'whole', label: 'Whole apartment' },
      ]}
    />
  );
}
