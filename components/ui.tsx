'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { moneyParts } from '@/lib/ui/format';
import { placePopover, type Placement } from '@/lib/ui/popover';
import { stepYear } from '@/lib/ui/years';

/* ───────────────────────── Sheet ───────────────────────── */

/** A bottom sheet (a centred card on wide screens). Escape, the backdrop and × all close it. */
export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus in, unless a field inside already took it with autoFocus.
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3 id={titleId}>{title}</h3>
          <button className="iconbtn" aria-label={t('common.close')} onClick={onClose}>
            {Icon.close}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Info ───────────────────────── */

/**
 * The quiet replacement for grey help text: a small "i" that reveals its
 * explanation when clicked or tapped. The popover keeps itself on screen, closes
 * on Escape, on an outside click and on scroll, and only ever closes itself —
 * not a sheet it happens to sit in.
 */
export function Info({ about, children }: { about?: string; children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Placement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !button.current || !bubble.current) return;
    const height = bubble.current.getBoundingClientRect().height;
    setPos(
      placePopover(
        button.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        { width: 280, height },
      ),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setPos(null);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !bubble.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture phase + stopPropagation: the first Escape belongs to the popover.
      e.stopPropagation();
      close();
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info"
        aria-label={about ? t('common.aboutInfo', { about }) : t('common.moreInfo')}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((o) => !o);
          setPos(null);
        }}
      >
        {Icon.info}
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="note"
            className={'popover ' + (pos?.placement ?? 'below')}
            style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ───────────────────────── Small controls ───────────────────────── */

/** `‹ 2026 ›` — steps through the years that have data. */
export function YearStepper({
  year,
  years,
  onChange,
}: {
  year: number;
  years: number[];
  onChange: (y: number) => void;
}) {
  const { t } = useI18n();
  const prev = stepYear(years, year, -1);
  const next = stepYear(years, year, 1);
  return (
    <div className="stepper">
      <button className="iconbtn" aria-label={t('common.previousYear')} disabled={prev === year} onClick={() => onChange(prev)}>
        {Icon.left}
      </button>
      <span aria-label={t('common.taxYear')} aria-live="polite">
        {year}
      </span>
      <button className="iconbtn" aria-label={t('common.nextYear')} disabled={next === year} onClick={() => onChange(next)}>
        {Icon.right}
      </button>
    </div>
  );
}

/** One choice out of a few, all visible at once. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
      <span className="track">
        <span className="knob" />
      </span>
      <span>{children}</span>
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="alert bad" role="alert">
      {message}
    </div>
  );
}

/** A large amount: the euros at full size, the cents beside them smaller. */
export function Money({ value }: { value: number }) {
  const { main, rest } = moneyParts(value);
  return (
    <>
      {main}
      <span className="cents">{rest}</span>
    </>
  );
}

/** A form label with an optional info icon beside it (never inside the label itself). */
export function Label({
  htmlFor,
  id,
  info,
  children,
}: {
  htmlFor?: string;
  id?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="label-row">
      <label htmlFor={htmlFor} id={id}>
        {children}
      </label>
      {info}
    </div>
  );
}

/** A section heading, optionally with an info icon and an action on the right. */
export function Heading({ children, info, action }: { children: ReactNode; info?: ReactNode; action?: ReactNode }) {
  return (
    <div className="heading">
      <h2>
        {children}
        {info}
      </h2>
      {action}
    </div>
  );
}

export function Avatar({ text }: { text: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {(text.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/* ───────────────────────── Icons ───────────────────────── */

const svg = (children: ReactNode) => (
  <svg
    className="i"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icon = {
  home: svg(<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  rent: svg(
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </>,
  ),
  cost: svg(<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />),
  tax: svg(<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />),
  gear: svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>,
  ),
  down: svg(<path d="m6 9 6 6 6-6" />),
  left: svg(<path d="m15 18-6-6 6-6" />),
  right: svg(<path d="m9 18 6-6-6-6" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  close: svg(<path d="M6 6l12 12M18 6 6 18" />),
  check: svg(<path d="m5 12 5 5 9-10" />),
  alert: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16v.01" />
    </>,
  ),
  info: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </>,
  ),
  camera: svg(
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>,
  ),
  building: svg(
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 10h2a2 2 0 0 1 2 2v9M2 21h20M8 7h4M8 11h4M8 15h4" />,
  ),
  stack: svg(<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" />),
  download: svg(<path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16" />),
  upload: svg(<path d="M12 15V3m0 0L8 7m4-4 4 4M4 20h16" />),
  signout: svg(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />),
  users: svg(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>,
  ),
};
