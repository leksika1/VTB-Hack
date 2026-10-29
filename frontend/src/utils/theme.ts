import { flushSync } from 'react-dom';
import { useUIStore, type Theme } from '../store/uiStore';

const darkMedia = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Puts the resolved theme on <html>; the colour tokens in index.css follow data-theme */
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkMedia().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1424' : '#f2f4f7');
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
    applyTheme(theme);
  };
  if (canCrossFadeTheme()) document.startViewTransition(update);
  else update();
}

/** Keeps <html> in sync with the stored theme and, for «Как в системе», with the OS setting */
export function watchSystemTheme(theme: Theme) {
  applyTheme(theme);
  const media = darkMedia();
  const onChange = () => applyTheme(theme);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
