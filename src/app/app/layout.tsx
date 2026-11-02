import type { Metadata } from 'next';
import { SolvencyProviders } from '../providers';
import './product.css';
import './agent.css';

export const metadata: Metadata = {
  title: 'Your workspace — SolvencyLoop',
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <SolvencyProviders>{children}</SolvencyProviders>;
}
