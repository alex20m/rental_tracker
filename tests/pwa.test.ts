import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { fi } from '@/lib/i18n/fi';
import { sv } from '@/lib/i18n/sv';
import {
  INSTALLED_KEY,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_KEY,
  INSTALL_PROMPT_SCRIPT,
  MANUAL_STEPS,
  detectPlatform,
  installState,
  standaloneFrom,
} from '@/lib/pwa';

describe('installState', () => {
  it('offers nothing to an app that is already running installed, even if a prompt is parked', () => {
    expect(installState({ standalone: true, promptAvailable: true, platform: 'android' })).toEqual({ kind: 'installed' });
  });

  it('offers one-tap install when the browser handed over a prompt', () => {
    expect(installState({ standalone: false, promptAvailable: true, platform: 'desktop' })).toEqual({ kind: 'ready' });
  });

  it('falls back to by-hand steps for the platform when there is no prompt', () => {
    expect(installState({ standalone: false, promptAvailable: false, platform: 'ios' })).toEqual({
      kind: 'manual',
      platform: 'ios',
    });
  });
});

describe('detectPlatform', () => {
  it('knows an iPhone', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe('ios');
  });

  it('knows an iPad that claims to be a Mac, by its touch screen', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop');
  });

  it('knows Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5)).toBe('android');
  });

  it('treats everything else as a desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop');
  });
});

describe('standaloneFrom', () => {
  it.each([
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])('display-mode %s, iOS standalone %s → %s', (displayModeStandalone, iosStandalone, expected) => {
    expect(standaloneFrom({ displayModeStandalone, iosStandalone })).toBe(expected);
  });
});

describe('manual install steps', () => {
  it.each(['en', 'sv', 'fi'] as const)('are written out for every platform in %s', (lang) => {
    const messages = { en, sv, fi }[lang] as Record<string, string>;
    for (const guide of Object.values(MANUAL_STEPS)) {
      expect(guide.steps).toHaveLength(3);
      for (const key of [guide.title, ...guide.steps.map((step) => step.text)]) expect(messages[key]).toBeTruthy();
    }
  });
});

describe('manual install icons', () => {
  it('shows the Share button first on iOS, where the whole route starts from it', () => {
    expect(MANUAL_STEPS.ios.steps[0]).toEqual({ text: 'install.ios.step1', icon: 'share' });
  });

  it('shows the ⋮ menu on Android and the address-bar install icon on a desktop', () => {
    expect(MANUAL_STEPS.android.steps[0]?.icon).toBe('dots');
    expect(MANUAL_STEPS.desktop.steps[0]?.icon).toBe('installDesktop');
  });
});

describe('the script that catches the install prompt', () => {
  const run = () => {
    const events = new EventTarget();
    const win = events as EventTarget & Record<string, unknown>;
    new Function('window', 'Event', INSTALL_PROMPT_SCRIPT)(win, Event);
    return win;
  };

  it('parks the prompt, stops the browser’s own infobar, and announces it', () => {
    const win = run();
    expect(win[INSTALL_PROMPT_KEY]).toBeNull();
    let announced = 0;
    win.addEventListener(INSTALL_PROMPT_EVENT, () => announced++);
    const prompt = new Event('beforeinstallprompt', { cancelable: true });

    win.dispatchEvent(prompt);

    expect(win[INSTALL_PROMPT_KEY]).toBe(prompt);
    expect(prompt.defaultPrevented).toBe(true);
    expect(announced).toBe(1);
  });

  it('lets go of the prompt once the app is installed', () => {
    const win = run();
    win.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));

    win.dispatchEvent(new Event('appinstalled'));

    expect(win[INSTALL_PROMPT_KEY]).toBeNull();
    expect(win[INSTALLED_KEY]).toBe(true);
  });
});
