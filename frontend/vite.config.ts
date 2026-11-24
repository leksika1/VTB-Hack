import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Backend from backend/ (uvicorn on :8000); override with VITE_API_PROXY
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://127.0.0.1:18080',
    },
  },
})
