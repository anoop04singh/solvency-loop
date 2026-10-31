import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing/LandingPage';
import './landing.css';

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { split } = await searchParams;
  // Preserve bill links shared before the workspace moved to /app.
  if (typeof split === 'string' && split) redirect('/app?split=' + encodeURIComponent(split));
  return <LandingPage/>;
}
