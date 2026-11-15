import { expect, test } from 'vitest';
import { nearest } from './database.mjs';
test('Vitest resolves node:sqlite and loads the same real extension', () => {
  expect(nearest()).toEqual({ id: 1, distance: 0, version: 'v0.1.9' });
});
