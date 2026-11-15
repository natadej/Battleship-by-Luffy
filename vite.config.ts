import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from the GitHub Pages subpath (and survives repo renames).
  base: './',
  plugins: [react()],
})
