import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearest } from './database.mjs';
test('node:sqlite loads vec0 and finds the nearest vector', () => {
  assert.deepEqual(nearest(), { id: 1, distance: 0, version: 'v0.1.9' });
});
