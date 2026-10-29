import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Шрифт в бандле, а не с Google Fonts: без утечки IP пользователей и с работой в закрытом контуре
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App'
import { useUIStore } from './store/uiStore'
import { applyTheme } from './utils/theme'

// The saved theme goes on <html> before the first paint, otherwise a dark theme flashes light on every load
applyTheme(useUIStore.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
