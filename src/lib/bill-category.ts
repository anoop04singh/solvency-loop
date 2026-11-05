export const BILL_CATEGORIES = ['dining', 'groceries', 'travel', 'housing', 'entertainment', 'shopping', 'utilities', 'other'] as const;
export type BillCategory = typeof BILL_CATEGORIES[number];
export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
  dining: 'Food & dining', groceries: 'Groceries', travel: 'Travel & transport',
  housing: 'Housing', entertainment: 'Entertainment', shopping: 'Shopping',
  utilities: 'Utilities & subscriptions', other: 'Other',
};

export function isBillCategory(value: unknown): value is BillCategory {
  return typeof value === 'string' && BILL_CATEGORIES.some(category => category === value);
}

const marker = /^\[sl1:([a-z]+)\] /;

/** Preserve the deployed Move layout. A categorized bill carries a public versioned title prefix. */
export function encodeBillTitle(title: string, category?: BillCategory): string {
  if (category !== undefined && !isBillCategory(category)) throw new Error('Choose a supported bill category.');
  const clean = title.trim();
  if (!clean) throw new Error('Enter a bill title.');
  const stored = (category ? '[sl1:' + category + '] ' : marker.test(clean) ? '[sl1:plain] ' : '') + clean;
  if (new TextEncoder().encode(stored).length > 120) throw new Error('Shorten the bill title to fit its category and the 120-byte chain limit.');
  return stored;
}

export function decodeBillTitle(stored: string): {title: string; category?: BillCategory} {
  const match = marker.exec(stored);
  if (!match) return {title: stored};
  const category = match[1];
  if (category === 'plain') return {title: stored.slice(match[0].length)};
  return isBillCategory(category) ? {title: stored.slice(match[0].length), category} : {title: stored};
}

export function inferBillCategory(title: string): BillCategory | undefined {
  const clues: [BillCategory, RegExp][] = [
    ['groceries', /\b(grocer(?:y|ies)|supermarket)\b/i],
    ['dining', /\b(dinner|lunch|breakfast|brunch|pizza|restaurant|cafe|coffee|drinks|dining|takeout)\b/i],
    ['travel', /\b(taxi|flight|hotel|train|fuel|parking|uber|travel|bus|airbnb)\b/i],
    ['housing', /\b(rent|housing|mortgage)\b/i],
    ['entertainment', /\b(movie|cinema|concert|game|festival|tickets)\b/i],
    ['shopping', /\b(shopping|clothes|gifts?|furniture)\b/i],
    ['utilities', /\b(electricity|water bill|internet|subscription|utilities|wifi)\b/i],
  ];
  return clues.find(([, pattern]) => pattern.test(title))?.[0];
}

export function recentBillCategories(bills: readonly {title: string; category?: BillCategory; createdAtMs: number; isCancelled: boolean}[]): BillCategory[] {
  const counts = new Map<BillCategory, number>();
  const recent = bills.filter(bill => !bill.isCancelled).sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 30);
  for (const bill of recent) {
    const category = bill.category ?? inferBillCategory(bill.title);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category]) => category);
}
