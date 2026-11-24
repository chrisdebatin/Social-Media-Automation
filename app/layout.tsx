import type { Metadata } from 'next';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/800.css';
import './globals.css';
import { colors } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Pflegeunion Social Studio',
  description: 'Instagram-Karussells im Pflegeunion-Design erstellen und veröffentlichen',
  robots: { index: false, follow: false },
};

/** Brand colours from lib/brand.ts → CSS variables (no hard-coded colours in CSS). */
const cssVars = `:root{${Object.entries(colors).map(([k, v]) => `--${k}:${v};`).join('')}}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVars }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
