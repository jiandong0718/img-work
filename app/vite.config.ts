import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5188,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5190',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5190',
        changeOrigin: true,
      },
    },
  },
})
