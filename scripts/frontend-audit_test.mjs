import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, cpSync } from 'node:fs';
import { analyze, collect } from './frontend-audit.mjs';

test('triage distinguishes absent information from a measured zero', () => {
  const result = analyze('triage', { files: ['package.json', 'pnpm-lock.yaml', 'yarn.lock'],
    pkg: { packageManager: 'pnpm@10.28.2', engines: { node: '>=24' }, dependencies: { react: '19' } }, sources: [] });
  assert.equal(result.data.lockfile_count, 2);
  assert.equal(result.data.dependencies, 1);
  assert.equal(result.data.open_issues, null);
});

test('an installed collector invoked through a filesystem alias writes its report', () => {
  const root = mkdtempSync(join(tmpdir(), 'installed frontend '));
  try {
    const client = join(root, 'client'); mkdirSync(client);
    writeFileSync(join(client, 'package.json'), '{}');
    cpSync('frontend-review-triage/scripts', join(root, 'skill'), { recursive: true });
    const result = spawnSync(join(root, 'skill/audit-triage.sh'), ['--repo', client], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(client, '.frontend-review/report/latest/raw/triage.json'), 'utf8'));
    assert.equal(report.data.dependencies, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing coverage is partial rather than zero percent or success', () => {
  const result = analyze('coverage', { files: [], pkg: {}, sources: [] });
  assert.equal(result.status, 'partial');
  assert.equal(result.data.coverage, null);
});

test('security findings expose locations and rule names, not secret-containing lines', () => {
  const result = analyze('security', { files: ['src/a.ts'], pkg: {}, sources: [
    { path: 'src/a.ts', text: 'element.innerHTML = input; // private-token-value' },
  ] });
  assert.equal(result.data.findings[0].path, 'src/a.ts');
  assert.equal(result.data.findings[0].line, 1);
  assert.ok(!JSON.stringify(result).includes('private-token-value'));
});

test('dependency audit keeps findings from exit 1 and flags transport failures', () => {
  const snapshot = { files: [], pkg: { dependencies: { parser: '^1' } }, sources: [] };
  const raw = { advisories: { 1: { module_name: 'parser', severity: 'high', title: 'Bad parser' } },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } };
  const result = analyze('deps', snapshot, { audit: { status: 1, stdout: JSON.stringify(raw) },
    outdated: { status: 0, stdout: '{}' } });
  assert.equal(result.status, 'complete');
  assert.equal(result.data.audit.counts.high, 1);
  const failed = analyze('deps', snapshot, { audit: { status: 2, stdout: '{}' } });
  assert.equal(failed.status, 'partial');
  assert.equal(failed.data.audit, null);
});

test('an unavailable outdated report keeps dependency coverage partial', () => {
  const raw = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
  const result = analyze('deps', { files: [], pkg: {}, sources: [] }, {
    audit: { status: 0, stdout: JSON.stringify(raw) }, outdated: { status: 2, stdout: '' },
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.data.outdated, null);
});

test('unknown modes fail rather than silently collecting another report', () => {
  assert.throws(() => analyze('not-a-mode', { files: [], pkg: {}, sources: [] }));
});

test('collector works without installed audit tools and excludes dependency trees', () => {
  const root = mkdtempSync(join(tmpdir(), 'frontend-skill-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'a.ts'), 'const count: any = 1;');
    mkdirSync(join(root, 'node_modules')); writeFileSync(join(root, 'node_modules', 'secret.ts'), 'eval(value)');
    const result = collect('typescript', root);
    assert.equal(result.data.any_count, 1);
    assert.ok(!JSON.stringify(result).includes('secret.ts'));
    assert.equal(result.data.typecheck, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an unavailable type checker is not recorded as zero diagnostics', () => {
  const result = analyze('typescript', { files: [], pkg: {}, sources: [] }, {
    typescript: { status: 1, stdout: 'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsc" not found' },
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.data.typecheck, null);
});

test('an incomplete or impossible coverage summary is unmeasured', () => {
  for (const coverage of [{}, { lines: { total: 2, covered: 9, skipped: 0, pct: 450 } }]) {
    const result = analyze('coverage', { files: [], pkg: {}, sources: [], coverage });
    assert.equal(result.status, 'partial');
    assert.equal(result.data.coverage, null);
  }
});
