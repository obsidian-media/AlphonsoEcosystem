import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-oxc'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    sourcemap: 'hidden',
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
