import { LoadingState } from '@/components/LoadingState';
import {Infinity as Loop} from 'lucide-react';
export default function Loading() {
  return <div className="workspace-experience llm-experience entry-experience"><header className="entry-route-header"><span className="agent-brand"><span><Loop size={22} aria-hidden="true"/></span>SOLVENCYLOOP</span><span className="eyebrow">Your financial workspace</span></header><main className="route-loading"><LoadingState title="Opening your workspace" description="Your wallet stays in control while the app loads."/></main></div>;
}
