'use client';

import { pct } from '@/lib/domain/tax';
import type { Scope } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
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
  const { t } = useI18n();
  return (
    <Segmented<Scope>
      label={t('scope.label')}
      value={scope}
      onChange={onScope}
      options={[
        { value: 'mine', label: t('scope.mine', { pct: pct(sharePct) }) },
        { value: 'whole', label: t('scope.whole') },
      ]}
    />
  );
}
