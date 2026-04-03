import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'src/server'),
      '@client': path.resolve(__dirname, 'src/client'),
      '@lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          include: ['tests/server/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/server/setup.ts'],
          fileParallelism: false,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          include: ['tests/client/**/*.test.ts', 'tests/client/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/client/setup.ts'],
        },
      },
    ],
  },
});
