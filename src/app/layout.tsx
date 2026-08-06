import type { Metadata } from 'next';
import './globals.css';
import '@aws-amplify/ui-react/styles.css';

export const metadata: Metadata = {
  title: 'Cagnotte',
  description: 'Shared budgets and expense splitting for people abroad together.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
