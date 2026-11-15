import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dynamicRead, doubleAsync } from './_build/js/release/build/adapter_smoke.js';

test('Any property roundtrip and the JS Promise return contract survive the adapter migration', async () => {
  assert.equal(dynamicRead(), 42);
  const pending = doubleAsync(21);
  assert.ok(pending instanceof Promise);
  assert.equal(await pending, 42);
  assert.equal(await doubleAsync(0), 0);
});
