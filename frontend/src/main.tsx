import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Шрифт в бандле, а не с Google Fonts: без утечки IP пользователей и с работой в закрытом контуре
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
