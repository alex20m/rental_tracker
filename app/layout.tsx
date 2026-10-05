import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist } from 'next/font/google';
import { I18nProvider } from '@/components/I18nProvider';
import { INSTALL_PROMPT_SCRIPT } from '@/lib/pwa';
import { THEME_INIT_SCRIPT } from '@/lib/ui/theme';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
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
