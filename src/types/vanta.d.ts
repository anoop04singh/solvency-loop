declare module 'vanta/dist/vanta.fog.min' {
  export interface FogEffect {
    setOptions(options: Record<string, unknown>): void;
    destroy(): void;
    resize(): void;
    renderer?: { domElement: HTMLCanvasElement; dispose(): void; forceContextLoss(): void };
  }
  export default function FOG(options: Record<string, unknown> & { el: HTMLElement }): FogEffect;
}
