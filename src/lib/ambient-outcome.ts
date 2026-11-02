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
  neutral: { highlightColor: 0xa5d6f6, midtoneColor: 0xd4eafc, lowlightColor: 0xb8d8f3, baseColor: 0xf0f7ff },
  success: { highlightColor: 0xb4dfd6, midtoneColor: 0xd8eced, lowlightColor: 0xb5d6e7, baseColor: 0xf1f8fd },
  pending: { highlightColor: 0xeadba7, midtoneColor: 0xe2eaf6, lowlightColor: 0xb6d5f0, baseColor: 0xf4f8fd },
  error: { highlightColor: 0xe4bfc9, midtoneColor: 0xe7e4f4, lowlightColor: 0xbdcee8, baseColor: 0xf7f8fd },
} satisfies Record<AmbientOutcome, Record<string, number>>;

export const ambientLabels: Record<AmbientOutcome, string> = {
  neutral: 'Ready when you are',
  success: 'Action completed',
  pending: 'Processing or awaiting confirmation',
  error: 'Needs your attention',
};
