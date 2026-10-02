import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { loadReceipt } from './store';

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function YearPicker({ year, years, onChange }: { year: number; years: number[]; onChange: (y: number) => void }) {
  return (
    <select className="year" value={year} onChange={(e) => onChange(Number(e.target.value))} aria-label="Tax year">
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

export function useReceipt(id: string, enabled: boolean) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    if (enabled) loadReceipt(id).then((r) => live && setSrc(r));
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return src;
}

export const Icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  rent: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18M8 15l2.5 2.5L16 13" />
    </svg>
  ),
  cost: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />
    </svg>
  ),
  tax: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};
