import type { Metadata } from 'next';
import './globals.css';
import { SolvencyProviders } from "./providers";

export const metadata: Metadata = {
  title: 'SolvencyLoop | Behavioral Liquidity Engine',
  description: 'Wallet-owned profiles, USDC splits, and cooldown vaults on Sui Mainnet with Walrus memory.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-primary text-primary antialiased">
        <SolvencyProviders>{children}</SolvencyProviders>
      </body>
    </html>
  );
}
