import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom')) return 'react-dom';
          if (id.includes('/react/') && !id.includes('react-dom')) return 'react';
          if (id.includes('framer-motion') || id.includes('motion-dom')) return 'vendor';
          if (id.includes('@tauri-apps/api')) return 'tauri-api';
          return 'vendor';
        }
      }
    }
  }
})
