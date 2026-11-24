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
import { applyTheme, useMediaQuery } from './utils/theme';

const shape: Theme['shape'] = { borderRadiusKind: 'Border radius 10' };
const themes = {
  light: { ...LIGHT_THEME, shape },
  dark: { ...DARK_THEME, shape },
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
