import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Sora } from 'next/font/google';

import '../globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'StockMind Scanner',
  description: 'RFID scanner for StockMind inventory',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StockMind',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} bg-white text-[#1f2937] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
