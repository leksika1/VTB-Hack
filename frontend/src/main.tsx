import { StrictMode, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import {
  DARK_THEME, LIGHT_THEME, DropdownProvider, FontsVTBGroup,
  largeGroupBorderRadius, mediumGroupBorderRadius, smallGroupBorderRadius, type Theme,
} from '@admiral-ds/react-ui';
import './index.css';
import App from './App';
import { useUIStore } from './store/uiStore';
import { applyTheme, themeBackground, useMediaQuery } from './utils/theme';

const shape: Theme['shape'] = { borderRadiusKind: 'Border radius 10' };
const themes = {
  light: {
    ...LIGHT_THEME,
    shape,
    color: {
      ...LIGHT_THEME.color,
      'Neutral/Neutral 05': themeBackground.light,
      'Neutral/Neutral 10': '#edf0f4',
      'Neutral/Neutral 20': '#e2e6ed',
      'Neutral/Neutral 60': '#636b78',
      'Neutral/Neutral 70': '#545b67',
      'Neutral/Neutral 90': '#1e1e20',
      'Primary/Primary 60 Main': '#0663ef',
    },
  },
  dark: {
    ...DARK_THEME,
    shape,
    color: {
      ...DARK_THEME.color,
      'Neutral/Neutral 00': '#16191f',
      'Neutral/Neutral 05': themeBackground.dark,
      'Neutral/Neutral 10': '#20242d',
      'Neutral/Neutral 20': '#2b313c',
      'Neutral/Neutral 60': '#a2aab7',
      'Neutral/Neutral 70': '#b2bac7',
      'Neutral/Neutral 90': '#f3f4f6',
    },
  },
};

// Charts and page layouts consume the same tokens as the styled Admiral components.
function colorProperties(theme: Theme) {
  return Object.entries(theme.color).map(([name, value]) =>
    `--admiral-color-${name.replace('/', '_').replaceAll(' ', '')}: ${value};`
  ).join('\n');
}

const themeStyles = `
  :root {
    ${colorProperties(themes.light)}
    --admiral-border-radius-Small: ${smallGroupBorderRadius(shape)};
    --admiral-border-radius-Medium: ${mediumGroupBorderRadius(shape)};
    --admiral-border-radius-Large: ${largeGroupBorderRadius(shape)};
    --brand: ${LIGHT_THEME.color['Primary/Primary 80']};
    --brand-2: ${LIGHT_THEME.color['Primary/Primary 70']};
    --brand-ink-2: ${LIGHT_THEME.color['Primary/Primary 20']};
  }
  :root[data-theme="dark"] { ${colorProperties(themes.dark)} }
`;

applyTheme(useUIStore.getState().theme);

export function Root() {
  const preference = useUIStore((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useLayoutEffect(() => applyTheme(resolved), [resolved]);

  return (
    <ThemeProvider theme={themes[resolved]}>
      <FontsVTBGroup />
      <style>{themeStyles}</style>
      <DropdownProvider><App /></DropdownProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
