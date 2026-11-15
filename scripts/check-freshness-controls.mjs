import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { prepareDocuments, parseDocumentReport } = await import(new URL('./documents.js', import.meta.resolve('jev-lint')));
const base = new URL('../.jev-lint/freshness-fixtures/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('expect.json', base), 'utf8'));
const input = prepareDocuments(manifest, { cwd: root });
assert.equal(input.comparisons.length, 10);
assert.equal(input.issues.length, 0);
let prior;
for (let pass = 1; pass <= 3; pass++) {
  const report = parseDocumentReport(JSON.parse(readFileSync(new URL(`pass-${pass}.json`, base), 'utf8')), input);
  assert.equal(report.coverage.answered, 10);
  const choices = Object.fromEntries(report.candidates.map((c) => [c.id, c.judgment?.choice]));
  assert.deepEqual(choices, expected);
  if (prior) assert.deepEqual(choices, prior);
  prior = choices;
}
console.log('Freshness document controls: 4 defects, 5 clean cases, 1 unassessed case; 3 passes, no flips');
