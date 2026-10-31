export type AmbientOutcome = 'neutral' | 'success' | 'pending' | 'error';

/** Presentation only. Never use this state to authorize or confirm a transaction. */
export function ambientOutcome(state: {
  busy: boolean; error: string; succeeded: boolean; pending: boolean; needsRefresh: boolean;
}): AmbientOutcome {
  if (state.error || state.needsRefresh) return 'error';
  if (state.busy || state.pending) return 'pending';
  if (state.succeeded) return 'success';
  return 'neutral';
}

export const ambientPalettes = {
  neutral: { highlightColor: 0xe3e9e2, midtoneColor: 0xf1f1df, lowlightColor: 0xe6e9ed, baseColor: 0xf8f8f6 },
  success: { highlightColor: 0xb5e6b1, midtoneColor: 0xd5edd7, lowlightColor: 0xa8d5c1, baseColor: 0xf4f8f1 },
  pending: { highlightColor: 0xf2d57b, midtoneColor: 0xf3e4b2, lowlightColor: 0xe4d39b, baseColor: 0xfaf8ee },
  error: { highlightColor: 0xeeb1a9, midtoneColor: 0xf4d4cb, lowlightColor: 0xe9b5b7, baseColor: 0xfcf5f2 },
} satisfies Record<AmbientOutcome, Record<string, number>>;

export const ambientLabels: Record<AmbientOutcome, string> = {
  neutral: 'Ready when you are',
  success: 'Action completed',
  pending: 'Processing or awaiting confirmation',
  error: 'Needs your attention',
};
