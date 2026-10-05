/**
 * Installing the app to a home screen or a dock.
 *
 * The browsers disagree about this more than any other feature here. Chromium
 * fires `beforeinstallprompt`, which can be saved and replayed from a button of
 * our own. Safari fires nothing and exposes no API: on iOS the only route is
 * Share ▸ Add to Home Screen, a menu item almost nobody finds by accident.
 *
 * So the rule is that the offer is always visible somewhere, and only its
 * *form* changes — a one-tap button where the browser allows one, the actual
 * steps where it does not. The one case with nothing to offer is an app already
 * running installed, which is also the case a naive implementation gets wrong.
 */

import type { MessageKey } from '@/lib/i18n';

export type Platform = 'ios' | 'android' | 'desktop';

export type InstallState =
  /** Already launched from a home screen or dock: there is nothing to offer. */
  | { kind: 'installed' }
  /** The browser handed us a prompt to replay. */
  | { kind: 'ready' }
  /** No prompt API here — say how to do it by hand. */
  | { kind: 'manual'; platform: Platform };

export interface InstallEnvironment {
  standalone: boolean;
  promptAvailable: boolean;
  platform: Platform;
}

export function installState({ standalone, promptAvailable, platform }: InstallEnvironment): InstallState {
  if (standalone) return { kind: 'installed' };
  if (promptAvailable) return { kind: 'ready' };
  return { kind: 'manual', platform };
}

/** The picture beside a manual step: the very control the visitor has to find, drawn as the browser draws it. */
export type StepIcon = 'share' | 'addToHome' | 'dots' | 'installPhone' | 'installDesktop' | 'check' | 'window';

export interface ManualStep {
  text: MessageKey;
  icon: StepIcon;
}

/** The by-hand route: message keys (see lib/i18n) so it reads in the visitor's language, each with the icon to look for. */
export const MANUAL_STEPS = {
  ios: {
    title: 'install.ios.title',
    steps: [
      { text: 'install.ios.step1', icon: 'share' },
      { text: 'install.ios.step2', icon: 'addToHome' },
      { text: 'install.ios.step3', icon: 'check' },
    ],
  },
  android: {
    title: 'install.android.title',
    steps: [
      { text: 'install.android.step1', icon: 'dots' },
      { text: 'install.android.step2', icon: 'installPhone' },
      { text: 'install.android.step3', icon: 'check' },
    ],
  },
  desktop: {
    title: 'install.desktop.title',
    steps: [
      { text: 'install.desktop.step1', icon: 'installDesktop' },
      { text: 'install.desktop.step2', icon: 'dots' },
      { text: 'install.desktop.step3', icon: 'window' },
    ],
  },
} as const satisfies Record<Platform, { title: MessageKey; steps: readonly ManualStep[] }>;

/**
 * Which platform this is.
 *
 * iPadOS 13 and later report a desktop Mac user agent, deliberately and with no
 * override — the touch points are the only thing that gives them away. Reading
 * it wrong shows an iPad the advice for a browser chrome it does not have.
 */
export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

/**
 * Whether the app is already running installed.
 *
 * Two signals because the platforms report it in different places: Chromium
 * matches the `display-mode: standalone` media query, and iOS Safari — which
 * matches nothing — sets a non-standard `navigator.standalone` instead.
 */
export function standaloneFrom({
  displayModeStandalone,
  iosStandalone,
}: {
  displayModeStandalone: boolean;
  iosStandalone: boolean;
}): boolean {
  return displayModeStandalone || iosStandalone;
}

/**
 * The event Chromium fires, minus the parts nothing here uses.
 *
 * Typed locally because it is not in lib.dom: it is a Chromium extension, and
 * the whole point of the code around it is that other browsers never fire it.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Where the captured install event is parked, and how its arrival is announced. */
export const INSTALL_PROMPT_KEY = '__rentalTrackerInstallPrompt';
export const INSTALL_PROMPT_EVENT = 'rental-tracker:installprompt';
/**
 * Set once the browser reports `appinstalled`. The page that did the installing
 * is still a browser tab (not standalone) with no prompt left, which would
 * otherwise read as "no prompt API here — show the manual steps" to someone who
 * has just installed.
 */
export const INSTALLED_KEY = '__rentalTrackerInstalled';

/**
 * The script that catches Chromium's install prompt.
 *
 * `beforeinstallprompt` fires once, and it fires early — routinely before React
 * has mounted anything at all. A listener attached from a component therefore
 * misses it on most loads, and the result is an install button that never
 * appears on a browser that was perfectly willing to install the app. So the
 * event is caught here, in a blocking script in <head>, and parked on `window`
 * for whatever mounts later.
 *
 * `preventDefault` is not optional either: without it Chromium shows its own
 * mini-infobar, which is both easy to miss and impossible to bring back.
 */
export const INSTALL_PROMPT_SCRIPT = `(function(){try{var k=${JSON.stringify(INSTALL_PROMPT_KEY)},d=${JSON.stringify(INSTALLED_KEY)},n=${JSON.stringify(
  INSTALL_PROMPT_EVENT,
)};window[k]=window[k]||null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window[k]=e;window.dispatchEvent(new Event(n));});window.addEventListener("appinstalled",function(){window[k]=null;window[d]=true;window.dispatchEvent(new Event(n));});}catch(e){}})();`;

/**
 * The flag behind "Don't show again". "Not now" is deliberately *not* stored:
 * the popup is meant to come back next visit. Only this key survives a reload.
 */
export const INSTALL_POPUP_DISMISSED_KEY = 'rental-tracker:install-popup-dismissed';
