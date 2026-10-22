import { useEffect, useState, type ReactNode } from 'react';
import { EXIT_MS } from '../../utils/motion';
import { ClosingContext } from './presenceContext';

/**
 * Keeps children mounted for EXIT_MS after `show` turns false, so they can animate out.
 * Children read the closing state with usePresenceClosing().
 */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const [closing, setClosing] = useState(false);

  // Adjust state during render (React-recommended pattern instead of an effect)
  if (show && (!mounted || closing)) {
    setMounted(true);
    setClosing(false);
  } else if (!show && mounted && !closing) {
    setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!mounted) return null;
  return <ClosingContext.Provider value={closing}>{children}</ClosingContext.Provider>;
}
