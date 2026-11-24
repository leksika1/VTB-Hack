import { useMemo, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useUIStore, type Theme } from '../store/uiStore';

export const themeBackground = { light: '#f6f6f8', dark: '#0e1016' };

const darkMedia = () => window.matchMedia('(prefers-color-scheme: dark)');

export function useMediaQuery(query: string) {
  const media = useMemo(() => window.matchMedia(query), [query]);
  const subscribe = useMemo(() => (notify: () => void) => {
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [media]);
  return useSyncExternalStore(subscribe, () => media.matches);
}

/** Puts the resolved theme on <html>; the colour tokens in index.css follow data-theme */
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkMedia().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeBackground[dark ? 'dark' : 'light']);
  // The test bank page (/api/mock-idp) is rendered by the backend without scripts; it reads the theme from here
  document.cookie = `fb-theme=${dark ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Cross-fading needs the View Transitions API; without it (or with reduced motion) the theme swaps at once */
export const canCrossFadeTheme = () =>
  typeof document.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Switches the theme chosen by the user. The page cross-fades into the new colours
 * (duration: --dur-theme in index.css) instead of repainting in one frame.
 */
export function switchTheme(theme: Theme) {
  const { theme: current, setTheme } = useUIStore.getState();
  if (theme === current) return;
  const update = () => {
    flushSync(() => setTheme(theme));
  };
  if (canCrossFadeTheme()) document.startViewTransition(update);
  else update();
}
