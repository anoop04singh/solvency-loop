import { LoadingState } from '@/components/LoadingState';
export default function Loading() {
  return <main className="route-loading"><LoadingState title="Opening your workspace" description="Your wallet stays in control while the app loads."/></main>;
}
