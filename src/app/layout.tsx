import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SolvencyLoop — Money with a little memory',
  description: 'Wallet-owned profiles, USDC splits, and cooldown vaults on Sui Mainnet with Walrus memory.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
