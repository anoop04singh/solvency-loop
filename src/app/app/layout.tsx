import type { Metadata } from 'next';
import { SolvencyProviders } from '../providers';

export const metadata: Metadata = {
  title: 'Your workspace — SolvencyLoop',
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <SolvencyProviders>{children}</SolvencyProviders>;
}
