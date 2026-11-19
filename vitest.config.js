import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.test.js'],
    environment: 'node',
    // Algunas pruebas de física integran muchos choques: en la máquina de
    // Windows de CI tardan más de los 5 s por defecto
    testTimeout: 30000,
    reporters: ['default'],
    benchmark: { include: ['pruebas/rendimiento/**/*.bench.js'] },
  },
});
