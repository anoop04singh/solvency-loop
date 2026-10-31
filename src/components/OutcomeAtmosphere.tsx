"use client";

import { animate, useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FogEffect } from 'vanta/dist/vanta.fog.min';
import { ambientLabels, ambientPalettes, type AmbientOutcome } from '@/lib/ambient-outcome';

type Palette = typeof ambientPalettes.neutral;
const mixColor = (a: number, b: number, progress: number) => [16, 8, 0].reduce((color, shift) =>
  color | Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * progress) << shift, 0);

/** A decorative subscriber to existing UI feedback. It never produces application outcomes. */
export function OutcomeAtmosphere({ outcome }: { outcome: AmbientOutcome }) {
  const host = useRef<HTMLDivElement>(null);
  const effect = useRef<FogEffect | null>(null);
  const palette = useRef<Palette>(ambientPalettes[outcome]);
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [mode, setMode] = useState<'static' | 'fog' | 'unavailable'>('static');

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    setSaveData(!!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    // Wait for the reduced-motion preference to be known before loading WebGL.
    if (reducedMotion !== false || paused || !visible || saveData || !host.current) return;
    const element = host.current;
    let disposed = false;
    let owned: FogEffect | null = null;
    let canvas: HTMLCanvasElement | undefined;
    const destroy = () => {
      canvas?.removeEventListener('webglcontextlost', contextLost);
      const renderer = owned?.renderer;
      try { owned?.destroy(); } catch { canvas?.remove(); }
      finally { renderer?.dispose(); renderer?.forceContextLoss(); }
      if (effect.current === owned) effect.current = null;
      owned = null;
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      destroy();
      if (!disposed) setMode('unavailable');
    };
    void (async () => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) { if (!disposed) setMode('unavailable'); return; }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        const [THREE, { default: FOG }] = await Promise.all([import('three'), import('vanta/dist/vanta.fog.min')]);
        if (disposed) return;
        owned = FOG({
          el: element, THREE, ...palette.current,
          mouseControls: false, touchControls: false, gyroControls: false,
          minHeight: 100, minWidth: 100, scale: 2.5, scaleMobile: 4,
          blurFactor: 0.62, speed: 0.55, zoom: 0.8,
        });
        canvas = owned.renderer?.domElement;
        if (!canvas || canvas.parentElement !== element) { destroy(); setMode('unavailable'); return; }
        canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', contextLost);
        effect.current = owned;
        setMode('fog');
      } catch {
        destroy();
        if (!disposed) { element.replaceChildren(); setMode('unavailable'); }
      }
    })();
    return () => { disposed = true; destroy(); };
  }, [reducedMotion, paused, visible, saveData]);

  useEffect(() => {
    const from = palette.current;
    const to = ambientPalettes[outcome];
    if (reducedMotion || paused || !visible || saveData) {
      palette.current = to;
      return;
    }
    const transition = animate(0, 1, {
      duration: 1.2, ease: 'easeInOut',
      onUpdate: progress => {
        const next = Object.fromEntries(Object.keys(to).map(key => [key,
          mixColor(from[key as keyof Palette], to[key as keyof Palette], progress),
        ])) as Palette;
        palette.current = next;
        effect.current?.setOptions(next);
      },
    });
    return () => transition.stop();
  }, [outcome, reducedMotion, paused, visible, saveData]);

  return <>
    <div className="app-atmosphere" data-outcome={outcome} data-renderer={reducedMotion || paused || !visible || saveData ? 'static' : mode} aria-hidden="true">
      <div ref={host} className="fog-canvas"/>
      <div className="fog-wash"/>
    </div>
    <div className="ambient-status" data-outcome={outcome}>
      <span className="ambient-dot" aria-hidden="true"/>
      <span>{ambientLabels[outcome]}</span>
      {reducedMotion || saveData ? <span className="ambient-motion-note">{reducedMotion ? 'Reduced motion' : 'Data saver'}</span>
        : mode === 'unavailable' ? <span className="ambient-motion-note">Static background</span>
          : <button aria-label={paused ? 'Animate background' : 'Pause background'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>
            {paused ? <Play size={12}/> : <Pause size={12}/>}
          </button>}
    </div>
  </>;
}
