import { defineConfig } from 'vitest/config';

// Las pruebas usan sh2do_test en MySQL y la DB 1 de Redis (la app usa la 0).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false, // todas comparten la misma BD
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      REDIS_URL: `${process.env.REDIS_URL}/1`,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Arranques de procesos: sin lógica propia que probar
      exclude: [
        'src/generated/**',
        'src/api/server.ts',
        'src/worker/index.ts',
        'src/shared/queue/queues.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});
