import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Local defaults to '/'; CI sets VITE_BASE=/vector-mobility-analytics/ for Pages.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
})
