"use client";

import { motion } from 'framer-motion';
import { usePresentationMotion } from '@/lib/use-presentation-motion';

export function LoadingState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  const moving = usePresentationMotion();
  return <div className={'loading-state '+(compact ? 'loading-compact' : 'panel loading-panel')} role="status" aria-live="polite">
    <svg className="loading-orbit" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="49" stroke="#dcebf8"/>
      <motion.g animate={moving ? { rotate: [0, 360] } : undefined} style={{ transformOrigin: '60px 60px' }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}><circle cx="60" cy="60" r="40" stroke="#bdd8ef" strokeDasharray="3 7"/><circle cx="60" cy="20" r="5" fill="#75a9d5"/><circle cx="60" cy="100" r="3" fill="#a9cbe7"/></motion.g>
      <motion.g animate={moving ? { rotate: [0, -360] } : undefined} style={{ transformOrigin: '60px 60px' }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}><circle cx="60" cy="60" r="49" stroke="#b9d5eb" strokeDasharray="60 248" strokeLinecap="round" strokeWidth="2"/></motion.g>
      <circle cx="60" cy="60" r="25" fill="#f6fbff" stroke="#ccdfef"/><path d="M67 47C53 41 44 54 55 59L65 65C75 71 62 81 53 74" stroke="#447eae" strokeWidth="5" strokeLinecap="round"/>
    </svg>
    <div className="loading-copy"><p className="loading-title">{title}</p><p>{description}</p>{compact && <span className="loading-track" aria-hidden="true"><span/></span>}</div>
    {!compact && <div className="loading-skeleton" aria-hidden="true"><span/><span/><div><span/><span/></div></div>}
  </div>;
}
