import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Локально запросы /api уходят в Python-калькулятор: python3 dev_api.py
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
