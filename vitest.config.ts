import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.6.0'),
  },
});
