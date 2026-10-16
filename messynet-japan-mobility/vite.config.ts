import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standalone MessyNet Japan use-case dashboards. base './' for static hosting.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5179, strictPort: true },
  // ONLY=retail|tourism builds a standalone demo; the other report is removed from the bundle
  define: { __ONLY__: JSON.stringify(process.env.ONLY ?? '') },
})
