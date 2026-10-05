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
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'Rentals' },
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
