import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@admiral-ds/fonts/VTBGroupUI.css'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App'
import { useUIStore } from './store/uiStore'
import { applyTheme } from './utils/theme'
import { ThemeProvider } from 'styled-components'
import { LIGHT_THEME, DARK_THEME, DropdownProvider } from '@admiral-ds/react-ui'

// The saved theme goes on <html> before the first paint, otherwise a dark theme flashes light on every load
const initialTheme = useUIStore.getState().theme
applyTheme(initialTheme)

export function Root() {
  const theme = useUIStore((s) => s.theme)
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <ThemeProvider theme={isDark ? DARK_THEME : LIGHT_THEME}>
      <DropdownProvider>
        <App />
      </DropdownProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

