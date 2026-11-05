"use client";

import { motion } from 'framer-motion';
import { usePresentationMotion } from '@/lib/use-presentation-motion';

export function LoadingState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  const moving = usePresentationMotion();
  return <div className={'loading-state '+(compact ? 'loading-compact' : 'panel loading-panel')} role="status" aria-live="polite" data-motion={moving}>
    <svg className="loading-orbit" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="49" className="loading-ring"/>
      <motion.g animate={moving ? { rotate: [0, 360] } : undefined} style={{ transformOrigin: '60px 60px' }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}><circle cx="60" cy="60" r="40" className="loading-ring" strokeDasharray="2 7"/><circle cx="60" cy="20" r="4" className="loading-satellite"/><circle cx="60" cy="100" r="2.5" className="loading-satellite-secondary"/></motion.g>
      <motion.g animate={moving ? { rotate: [0, -360] } : undefined} style={{ transformOrigin: '60px 60px' }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}><circle cx="60" cy="60" r="49" className="loading-arc" strokeDasharray="50 258" strokeLinecap="round" strokeWidth="2"/></motion.g>
      <rect x="34" y="34" width="52" height="52" rx="15" className="loading-center"/><path d="M60 60c-7-13-20-13-20-2s13 12 20 2 20-12 20-2-13 11-20 2Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <div className="loading-copy">{!compact&&<span className="loading-kicker" aria-hidden="true">SolvencyLoop</span>}<p className="loading-title">{title}</p><p>{description}</p>{compact && <span className="loading-track" aria-hidden="true"><span/></span>}</div>
    {!compact && <div className="loading-skeleton" aria-hidden="true"><span/><span/><div><span/><span/></div></div>}
  </div>;
}
