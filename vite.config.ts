import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/](three|three-stdlib|three-mesh-bvh)[\\/]/,
            },
            {
              name: 'react-three',
              test: /node_modules[\\/](@react-three|postprocessing|n8ao)[\\/]/,
            },
            {
              name: 'react-runtime',
              test: /node_modules[\\/](react|react-dom|scheduler|zustand|framer-motion|motion-dom|motion-utils)[\\/]/,
            },
            {
              name: 'translation-resilience',
              test:
                /node_modules[\\/]translation-resilience[\\/]|src[\\/]components[\\/]layout[\\/]RootErrorBoundary\.tsx/,
            },
          ],
        },
      },
    },
  },
})
