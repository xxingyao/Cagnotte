import type { Metadata } from 'next';
import Link from 'next/link';
// import './globals.css';

export const metadata: Metadata = {
  title: 'Cagnotte',
  description: 'Shared budgets and expense splitting for people abroad together.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="wordmark">
              <span className="wordmark-dot" aria-hidden="true">
                C
              </span>
              Cagnotte
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
