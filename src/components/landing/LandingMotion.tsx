'use client';

import { motion, MotionConfig, useInView, useScroll, useSpring } from 'framer-motion';
import { createContext, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { OutcomeAtmosphere } from '@/components/OutcomeAtmosphere';
import { LandingShader } from './LandingShader';

const MotionEnabled = createContext(false);
const motionQuery = '(prefers-reduced-motion: reduce)';
const revealEase = [.22, 1, .36, 1] as const;
type Connection = EventTarget & { saveData?: boolean };

function connection() {
  return (navigator as Navigator & { connection?: Connection }).connection;
}

function subscribe(listener: () => void) {
  const preference = matchMedia(motionQuery);
  const network = connection();
  preference.addEventListener('change', listener);
  network?.addEventListener('change', listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    preference.removeEventListener('change', listener);
    network?.removeEventListener('change', listener);
    document.removeEventListener('visibilitychange', listener);
  };
}

export function useLandingMotion() {
  return useContext(MotionEnabled);
}

export function LandingMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const allowsMotion = useSyncExternalStore(
    subscribe,
    () => !document.hidden && !matchMedia(motionQuery).matches && !connection()?.saveData,
    () => false,
  );
  const moving = allowsMotion && !paused;
  const { scrollYProgress } = useScroll();

  return (
    <MotionEnabled.Provider value={moving}>
      <MotionConfig reducedMotion="user">
        <div className="landing" data-motion={moving ? 'on' : 'off'}>
          <OutcomeAtmosphere outcome="neutral" context="landing" motionControl={{ paused: paused || !allowsMotion, onChange: setPaused }} />
          {moving && <motion.div className="landing-page-progress" aria-hidden="true" style={{ scaleX: scrollYProgress }} />}
          {children}
        </div>
      </MotionConfig>
    </MotionEnabled.Provider>
  );
}

export function LandingHero({ children }: { children: ReactNode }) {
  const hero = useRef<HTMLElement>(null);
  const inView = useInView(hero);
  const moving = useLandingMotion() && inView;
  const x = useSpring(0, { stiffness: 110, damping: 24 });
  const y = useSpring(0, { stiffness: 110, damping: 24 });
  return (
    <section id="overview" aria-labelledby="hero-title" className="landing-hero" ref={hero}
      onPointerMove={event => {
        if (!moving || event.pointerType !== 'mouse') return;
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left) / box.width - .5);
        y.set((event.clientY - box.top) / box.height - .5);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {moving && <LandingShader x={x} y={y} />}
      {children}
    </section>
  );
}

export function LandingReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const moving = useLandingMotion();
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      whileInView={moving ? { opacity: [.45, 1], y: [18, 0] } : undefined}
      viewport={{ once: true, amount: .18 }}
      transition={moving ? { duration: .72, delay, ease: revealEase } : { duration: 0 }}
    >{children}</motion.div>
  );
}
