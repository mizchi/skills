import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['sqlite.test.js'], environment: 'node' } });
