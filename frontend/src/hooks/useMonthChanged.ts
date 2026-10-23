import { useState } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * True once the month was switched while this screen is open. Month animations play only then:
 * on opening a tab its own fade-in plays alone, otherwise the slower month fade stacks on top of it.
 */
export function useMonthChanged(): boolean {
  const monthKey = useUIStore((s) => s.monthKey);
  const [seen, setSeen] = useState({ monthKey, changed: false });
  if (seen.monthKey !== monthKey) setSeen({ monthKey, changed: true });
  return seen.changed;
}
