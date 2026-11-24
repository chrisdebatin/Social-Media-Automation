import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  // tsconfig uses jsx:"preserve" for Next – tests need a real JSX transform
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', testTimeout: 60_000, include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
