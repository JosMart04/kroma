import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker, ViewPreferencesProvider } from '@/core/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'KROMA — know your colours',
  description:
    'You cannot see the colour of your own face. KROMA measures it, says how sure it is, and refuses when it cannot know.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'KROMA' },
  /**
   * `.ico` for the browsers that still ask for it, `.svg` for the ones that
   * prefer it and get a crisp mark at any tab size, PNG as the middle ground.
   */
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  // Used phone-in-hand: limiting accidental zoom helps framing a shot, but
  // user-scalable is NOT disabled — that would be an accessibility failure.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {/*
          Assisted contrast is read once here and shared by every screen, so a
          garment thumbnail and the panel beside it can never disagree about
          which filter is on.
        */}
        <ViewPreferencesProvider>
          {children}
          <RegisterServiceWorker />
        </ViewPreferencesProvider>
      </body>
    </html>
  );
}
