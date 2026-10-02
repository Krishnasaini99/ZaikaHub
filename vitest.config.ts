import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom rather than the default node env: several suites touch
    // `localStorage`, which the CartService relies on.
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // AngularFire's injected classes are shipped as partially-compiled
    // declarations, so instantiating one needs the JIT compiler present. It is
    // a runtime import rather than a build-time transform, hence a setup file.
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/app/core/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/models/**'],
    },
  },
});
