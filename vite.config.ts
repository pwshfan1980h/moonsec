import { defineConfig } from 'vite';

export default defineConfig({
  base: '/moonsec/',
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
