import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: './client-env',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
