import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { StoreProvider } from '@/components/StoreProvider';
import { AppShell } from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cagnotte',
  description: 'Shared budgets and expense splitting for people abroad together.',
  icons: {
    icon: '/logo.png',
  },
};

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}