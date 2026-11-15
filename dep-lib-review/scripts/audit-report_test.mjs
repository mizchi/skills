import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAudit, collectAudit } from './audit-report.mjs';

const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };

test('pnpm advisories retain real vulnerabilities even when the command exits 1', () => {
  const raw = { advisories: { 7: { module_name: 'parser', severity: 'high',
    title: 'Untrusted input exhaustion', url: 'https://example.com/advisory',
    vulnerable_versions: '<2' } }, metadata: { vulnerabilities: { ...counts, high: 1 } } };
  const result = collectAudit('/project', { run: () => ({ status: 1, stdout: JSON.stringify(raw) }) });
  assert.equal(result.advisories[0].name, 'parser');
  assert.equal(result.counts.high, 1);
  assert.equal(result.source, 'pnpm-advisories');
});

test('clean pnpm output has explicit zero counts', () => {
  assert.deepEqual(normalizeAudit({ advisories: {}, metadata: { vulnerabilities: counts } }).counts, counts);
});

test('npm-style vulnerable packages and transitive strings remain visible', () => {
  const result = normalizeAudit({ vulnerabilities: {
    direct: { severity: 'high', isDirect: true, range: '<2', via: [
      { name: 'direct', title: 'Bad parser', url: 'https://example.com/a' }, 'transitive',
    ] },
  }, metadata: { vulnerabilities: { ...counts, high: 1 } } });
  assert.equal(result.source, 'npm-vulnerabilities');
  assert.equal(result.advisories.length, 2);
  assert.equal(result.advisories[1].via, 'transitive');
});

test('unknown schemas, missing counts, and malformed advisory entries fail closed', () => {
  for (const raw of [{}, { error: 'network failed' }, { advisories: {} },
    { advisories: {}, metadata: { vulnerabilities: { ...counts, high: '0' } } },
    { advisories: { x: {} }, metadata: { vulnerabilities: counts } }]) {
    assert.throws(() => normalizeAudit(raw));
  }
});

test('a registry failure cannot be normalized into a clean audit', () => {
  assert.throws(() => collectAudit('/project', { run: () => ({ status: 2, stdout: '{}', stderr: 'unavailable' }) }));
  assert.throws(() => collectAudit('/project', { run: () => ({ status: 1, stdout: 'not JSON' }) }));
});
