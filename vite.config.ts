import { defineConfig } from 'vitest/config';

// base './' keeps asset paths relative so the build works on GitHub Pages sub-paths.
export default defineConfig({
  base: './',
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
