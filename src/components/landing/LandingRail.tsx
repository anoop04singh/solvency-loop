'use client';

import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLandingMotion } from './LandingMotion';

function nearest(offsets: number[], left: number) {
  return offsets.reduce((best, stop, index) =>
    Math.abs(stop - left) < Math.abs(offsets[best] - left) ? index : best, 0);
}

export function LandingRail({ children, count }: { children: ReactNode; count: number }) {
  const track = useRef<HTMLDivElement>(null);
  const stops = useRef<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [scrollable, setScrollable] = useState<boolean>();
  const moving = useLandingMotion();
  const { scrollX, scrollXProgress } = useScroll({ container: track, axis: 'x' });
  const fill = useTransform(scrollXProgress, [0, 1], [1 / count, 1]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      setScrollable(maxScroll > 1);
      const start = element.getBoundingClientRect().left + element.clientLeft;
      stops.current = Array.from(element.children, child =>
        Math.min(maxScroll, child.getBoundingClientRect().left - start + element.scrollLeft));
      setCurrent(nearest(stops.current, element.scrollLeft));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useMotionValueEvent(scrollX, 'change', left => setCurrent(nearest(stops.current, left)));

  function goTo(index: number) {
    const left = stops.current[index];
    if (left !== undefined) track.current?.scrollTo({ left, behavior: moving ? 'smooth' : 'instant' });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!scrollable || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const destination = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(count - 1, current + 1),
      Home: 0,
      End: count - 1,
    }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    goTo(destination);
  }

  return (
    <>
      <div className="landing-rail-toolbar">
        <span className="landing-kicker">Explore the workspace <ArrowRight size={14} aria-hidden="true" /></span>
        <div className="landing-rail-controls" hidden={!scrollable}>
          <span className="landing-rail-counter" aria-live="polite">
            <span className="sr-only">Chapter </span>{String(current + 1).padStart(2, '0')} <span aria-hidden="true">/</span><span className="sr-only"> of </span> {String(count).padStart(2, '0')}
          </span>
          <button type="button" aria-label="Previous chapter" aria-controls="landing-chapters" aria-disabled={current === 0} onClick={() => goTo(current - 1)}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Next chapter" aria-controls="landing-chapters" aria-disabled={current === count - 1} onClick={() => goTo(current + 1)}><ArrowRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div
        ref={track}
        className="landing-rail-track"
        id="landing-chapters"
        role="region"
        aria-label="SolvencyLoop feature chapters"
        tabIndex={scrollable === false ? undefined : 0}
        onKeyDown={onKeyDown}
      >{children}</div>
      <div className="landing-rail-progress" aria-hidden="true" hidden={!scrollable}>
        <motion.span style={{ scaleX: fill }} />
      </div>
    </>
  );
}
