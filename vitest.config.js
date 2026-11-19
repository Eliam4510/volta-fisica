import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.test.js'],
    environment: 'node',
    reporters: ['default'],
  },
});
