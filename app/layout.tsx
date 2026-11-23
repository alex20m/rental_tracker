import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { I18nProvider } from '@/components/I18nProvider';
import { INSTALL_PROMPT_SCRIPT } from '@/lib/pwa';
import { THEME_INIT_SCRIPT } from '@/lib/ui/theme';
import './globals.css';

// The app's one face, Plus Jakarta Sans, self-hosted from @fontsource-variable: a build that fetched it from Google
// Fonts failed whenever that download did. One variable file covers every weight used (400 to 700).
const jakarta = localFont({
  src: '../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rental Tracker',
  description: 'Track rent, costs and co-owners of your rental apartments, and prepare your Finnish rental income tax declaration.',
  manifest: '/manifest.webmanifest',
  // iOS ignores SVG icons and caches home-screen icons by URL, so the Apple icon is an opaque 180px PNG under
  // its own filename (iOS fills transparent corners with black), and Safari tabs get a PNG favicon.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
  },
  appleWebApp: { capable: true, title: 'Rental Tracker' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Marks a page whose scripts run: only then is the phone drawer hidden until it is opened. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Catches Chromium's install prompt, which can fire long before React mounts. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
