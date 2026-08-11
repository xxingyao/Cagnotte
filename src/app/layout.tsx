import type { Metadata } from 'next';
import Link from 'next/link';
import { StoreProvider } from '@/components/StoreProvider';
import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Image from 'next/image';

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
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="wordmark">
              <Image
                src="/logo.png"
                alt=""
                width={22}
                height={22}
                className="wordmark-dot"
                priority
              />
              Cagnotte
            </Link>
          </header>
            <StoreProvider>{children}</StoreProvider>
        </div>
      </body>
    </html>
  );
}
