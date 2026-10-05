'use client';

import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Heading, Icon, Sheet } from '@/components/ui';
import {
  INSTALLED_KEY,
  INSTALL_POPUP_DISMISSED_KEY,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_KEY,
  MANUAL_STEPS,
  detectPlatform,
  installState,
  standaloneFrom,
  type BeforeInstallPromptEvent,
  type Platform,
} from '@/lib/pwa';

/** `''` is what the server sees: none of this is knowable without a browser, and guessing would flash the wrong thing. */
type Installability = '' | 'installed' | 'ready' | `manual:${Platform}`;

// The script in <head> sets this to null before anything else runs, so it is never undefined.
const parkedPrompt = () => (window as unknown as Record<string, BeforeInstallPromptEvent | null>)[INSTALL_PROMPT_KEY];

/** A string, not the state object: `useSyncExternalStore` compares snapshots by identity. */
function readInstallability(): Installability {
  if ((window as unknown as Record<string, boolean | undefined>)[INSTALLED_KEY]) return 'installed';
  const state = installState({
    standalone: standaloneFrom({
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      iosStandalone: (window.navigator as { standalone?: boolean }).standalone === true,
    }),
    promptAvailable: parkedPrompt() !== null,
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
  });
  return state.kind === 'manual' ? `manual:${state.platform}` : state.kind;
}

/**
 * Two things change what this shows: the prompt arriving or the app being
 * installed (both announced on one event by the script in <head>), and the
 * "Don't show again" flag (a `storage` event, see `storeDismissed`).
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener(INSTALL_PROMPT_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(INSTALL_PROMPT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

export function useInstallability(): Installability {
  return useSyncExternalStore(subscribe, readInstallability, () => '');
}

/** What "Don't show again" falls back to when storage cannot hold it: it still means the rest of this visit. */
let dismissedThisSession = false;

/**
 * Whether "Don't show again" was ever pressed. The server snapshot says
 * "dismissed": a popup that flashes open for someone who told it to stop is a
 * worse bug than one that takes a render longer to appear for everyone else.
 * `localStorage` throws in a browser with site data blocked; that reads as
 * "not dismissed", the safe direction to fail in.
 */
function readDismissed(): boolean {
  if (dismissedThisSession) return true;
  try {
    return localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A same-tab `setItem` fires no `storage` event (only other tabs hear it), so
 * one is dispatched by hand; without it the popup would stay open until
 * something unrelated re-rendered it.
 */
function storeDismissed() {
  dismissedThisSession = true;
  try {
    localStorage.setItem(INSTALL_POPUP_DISMISSED_KEY, '1');
  } catch {
    /* Not remembered across visits, but `dismissedThisSession` still holds for this one. */
  }
  window.dispatchEvent(new StorageEvent('storage', { key: INSTALL_POPUP_DISMISSED_KEY, newValue: '1' }));
}

/** Replay the parked Chromium prompt, then re-read: accepting makes the app standalone. */
async function replayPrompt() {
  // Only offered while a prompt is parked, so there is always one to replay.
  const event = parkedPrompt()!;
  await event.prompt();
  await event.userChoice;
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
}

/** The offer itself: one tap where the browser allows it, the steps for this device where it does not. */
export function InstallOffer({ state }: { state: Exclude<Installability, '' | 'installed'> }) {
  const { t } = useI18n();

  if (state === 'ready') {
    return (
      <button type="button" className="btn primary block" onClick={() => void replayPrompt()}>
        {Icon.install}
        {t('install.button')}
      </button>
    );
  }

  const guide = MANUAL_STEPS[state.slice('manual:'.length) as Platform];
  return (
    <>
      <h3 className="install-how">{t(guide.title)}</h3>
      <ol className="install-steps">
        {guide.steps.map(({ text, icon }) => (
          <li key={text}>
            <span className="install-icon" data-icon={icon}>
              {Icon[icon]}
            </span>
            <span>{t(text)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The same offer as a standing section of the account page, for anyone who silenced the popup — or closed it — and changed their mind. */
export function InstallSection() {
  const { t } = useI18n();
  const state = useInstallability();
  if (state === '' || state === 'installed') return null;
  return (
    <section>
      <Heading>{t('install.settings')}</Heading>
      <InstallOffer state={state} />
    </section>
  );
}

/**
 * Announces the install offer to anyone using the app in a browser, instead of
 * waiting for them to find it. It opens on its own, on every page and every
 * visit, until "Don't show again" — the only thing allowed to silence it for
 * good. "Not now", Escape, a tap outside, and even installing-then-leaving all
 * leave it free to return, because someone not yet installed is exactly who it
 * is for. Already installed (standalone) shows nothing at all.
 */
export default function InstallPopup() {
  const { t } = useI18n();
  const state = useInstallability();
  const dismissedForever = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [closedThisVisit, setClosedThisVisit] = useState(false);

  const open = state !== '' && state !== 'installed' && !dismissedForever && !closedThisVisit;

  if (!open) return null;

  return (
    <Sheet title={t('install.title')} onClose={() => setClosedThisVisit(true)}>
      <p className="install-lead">{t('install.lead')}</p>
      <InstallOffer state={state} />
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={() => setClosedThisVisit(true)}>
          {t('install.notNow')}
        </button>
        <button type="button" className="btn quiet" onClick={storeDismissed}>
          {t('install.never')}
        </button>
      </div>
    </Sheet>
  );
}
