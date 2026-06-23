import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/priority-handoff': 'http://127.0.0.1:5176',
      '/responsible-handoff': 'http://127.0.0.1:5176',
      '/responsible-review-response': 'http://127.0.0.1:5176',
      '/vworld-data': 'http://127.0.0.1:5176',
    },
    watch: {
      ignored: [
        '**/riskmap-core-main/.svelte-kit/**',
        '**/riskmap-core-main/build/**',
        '**/riskmap-core-main/dist/**',
        '**/Survey platform for collaboration/dist/**',
        '**/dist/**',
      ],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
