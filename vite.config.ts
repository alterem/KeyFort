import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Deliberately points at a non-default (normally absent) directory so Vite never
  // reads the root .env, which holds server secrets like TOTP_ENCRYPTION_KEY.
  envDir: './client-env',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
