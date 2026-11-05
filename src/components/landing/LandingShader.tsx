'use client';

import { useEffect, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';

const vertex = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0., 1.); }
`;

const fragment = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;


vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 mouse = u_mouse / u_resolution.xy;
    
    float t = u_time * 0.15;
    
    vec2 dist = uv - mouse;
    float mInfluence = exp(-dot(dist, dist) * 5.0) * 0.12;
    
    vec2 uvWarp = uv;
    uvWarp.x += 0.22 * snoise(uv * 1.6 + vec2(t * 0.5, -t * 0.35)) + mInfluence;
    uvWarp.y += 0.22 * snoise(uv * 2.0 - vec2(t * 0.45, t * 0.6));
    
    float n1 = snoise(uvWarp * 2.2 + vec2(t * 0.25, t * 0.18));
    float n2 = snoise(uvWarp * 3.8 - vec2(t * 0.35, -t * 0.25));
    float combined = (n1 + n2 * 0.5) * 0.5 + 0.5;
    
    vec3 bgBase = vec3(0.975, 0.973, 0.965); // Warm alabaster #F8F8F6
    
    vec3 colCyan = vec3(0.05, 0.58, 0.94);    // Klein Cyan #0ea5e9
    vec3 colEmerald = vec3(0.02, 0.72, 0.41); // Solvency Emerald #059669
    vec3 colAmber = vec3(0.95, 0.58, 0.08);   // Escrow Amber #d97706
    vec3 colRose = vec3(0.94, 0.25, 0.38);    // Cooldown Rose #e11d48
    
    vec3 aura = mix(colEmerald, colCyan, smoothstep(0.15, 0.82, uv.x + n1 * 0.25));
    aura = mix(aura, colAmber, smoothstep(0.25, 0.85, uv.y - n2 * 0.2));
    aura = mix(aura, colRose, smoothstep(0.55, 0.95, (1.0 - uv.x) * uv.y + n1 * 0.25));
    
    vec2 center = vec2(0.5, 0.65);
    float glow = 1.0 - length(uv - center);
    glow = smoothstep(0.12, 0.98, glow);
    
    float alpha = smoothstep(0.22, 0.88, combined) * glow * 0.32;
    vec3 finalColor = mix(bgBase, aura, alpha);
    
    float vig = (1.0 - smoothstep(0.25, 1.4, length(uv - 0.5)));
    finalColor *= (0.985 + 0.015 * vig);
    
    gl_FragColor = vec4(finalColor, 1.0);
}`;

/** A small render target under the hero artwork. The CSS surface stays visible on failure. */
export function LandingShader({ x, y }: { x: MotionValue<number>; y: MotionValue<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!canvas || !gl) return;

    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    let frame = 0;
    let observer: ResizeObserver | undefined;
    function dispose() {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (buffer) gl?.deleteBuffer(buffer);
      if (program) gl?.deleteProgram(program);
      shaders.forEach(shader => gl?.deleteShader(shader));
    }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    };

    try {
      if (!program || !buffer) throw new Error('WebGL resources unavailable');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const time = gl.getUniformLocation(program, 'u_time');
      const resolution = gl.getUniformLocation(program, 'u_resolution');
      const pointer = gl.getUniformLocation(program, 'u_mouse');
      const resize = () => {
        const scale = Math.min(1, 900 / canvas.clientWidth, 700 / canvas.clientHeight);
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(canvas);

      let lastFrame = -Infinity;
      const start = performance.now();
      const draw = (now: number) => {
        if (document.hidden) return;
        if (now - lastFrame >= 32) {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(resolution, canvas.width, canvas.height);
          gl.uniform2f(pointer, (x.get() + .5) * canvas.width, (.5 - y.get()) * canvas.height);
          gl.uniform1f(time, (now - start) / 1000);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          if (lastFrame === -Infinity) setReady(true);
          lastFrame = now;
        }
        frame = requestAnimationFrame(draw);
      };
      const lost = () => {
        setReady(false);
        dispose();
      };
      canvas.addEventListener('webglcontextlost', lost, { once: true });
      frame = requestAnimationFrame(draw);
      return () => {
        canvas.removeEventListener('webglcontextlost', lost);
        dispose();
      };
    } catch {
      dispose();
    }
  }, [x, y]);

  return <canvas className="landing-hero-shader" ref={ref} data-ready={ready} aria-hidden="true" />;
}
