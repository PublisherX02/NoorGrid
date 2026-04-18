import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      // Proxy all backend API paths to FastAPI on port 8000.
      // This makes the React dev server act as a single entry point —
      // ngrok http 3000 is all you need to share the full app remotely.
      '^/(health|weather|energy|grid|history|alerts|predict|rag|stats)': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
