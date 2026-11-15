import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sourceId, fetchSource, compareSnapshots, validateWatchlist,
  evidenceExcerpt, buildManifest, assessSemantic, inspectAction } from './skill-freshness.mjs';

const source = { kind: 'npm-dist-tag', package: '@example/sdk', tag: 'latest' };
const reply = (body, status = 200, type = 'application/json') => new Response(
  typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });

test('npm evidence includes package, engines, bin and deprecation, with no install scripts', async () => {
  const result = await fetchSource(source, { fetch: async () => reply({ name: '@example/sdk', version: '2.0.0',
    engines: { node: '>=24' }, bin: { sdk: 'cli.js' }, deprecated: 'Use next-sdk' }) });
  assert.equal(result.revision, '2.0.0');
  assert.match(result.text, /Use next-sdk/);
  assert.match(result.text, /cli.js/);
});

test('source identity ignores the observed baseline but includes channel and path', () => {
  assert.equal(sourceId(source), sourceId({ ...source, observed: '1.0.0' }));
  assert.notEqual(sourceId(source), sourceId({ ...source, tag: 'beta' }));
});

test('HTTP failures and malformed registry responses never produce current evidence', async () => {
  await assert.rejects(fetchSource(source, { fetch: async () => reply({}, 404) }));
  await assert.rejects(fetchSource(source, { fetch: async () => reply({ name: '@example/sdk' }) }));
});

test('GitHub credentials go only to the GitHub API', async () => {
  const calls = [];
  const run = async (url, options) => { calls.push({ url, options }); return reply({ version: '1', name: '@example/sdk' }); };
  await fetchSource(source, { fetch: run, token: 'private-test-token' });
  assert.ok(!JSON.stringify(calls).includes('private-test-token'));
});

test('a new release or changed document requires review even if a model finds no contradiction', () => {
  const base = { sources: { a: { revision: '1', digest: 'aaa' } }, targets: { 'a/SKILL.md': 'old' } };
  const current = { sources: { a: { revision: '2', digest: 'bbb' } }, targets: { 'a/SKILL.md': 'old' } };
  const result = compareSnapshots(base, current);
  assert.equal(result.upstream.length, 1);
  assert.equal(result.needsReview, true);
  assert.equal(compareSnapshots(current, current).needsReview, false);
});

test('new targets and deleted/added monitoring sources cannot silently inherit an old baseline', () => {
  const result = compareSnapshots({ sources: { a: { revision: '1', digest: 'x' } }, targets: {} },
    { sources: { b: { revision: '1', digest: 'x' } }, targets: { 'new/SKILL.md': 'h' } });
  assert.equal(result.upstream.length, 2);
  assert.deepEqual(result.targets, ['new/SKILL.md']);
});

test('bounded evidence preserves relevant API paragraphs and declares excerpting', () => {
  const text = '# Guide\n' + ('ordinary content\n'.repeat(300)) + '\n## Migration\nResource was removed; use resourceFromAttributes.\n';
  const result = evidenceExcerpt(text, 'new Resource({})', 1000);
  assert.match(result.text, /resourceFromAttributes/);
  assert.equal(result.excerpted, true);
  assert.ok(result.text.length <= 1000);
});

test('a missing skill or duplicate group is a configuration error', () => {
  const root = mkdtempSync(join(tmpdir(), 'freshness-config-'));
  try {
    assert.throws(() => validateWatchlist({ schemaVersion: 1, groups: [
      { id: 'a', skills: ['missing'], sources: [source] },
    ] }, root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('jev-lint manifests bind real targets to fetched evidence, not model memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'freshness-manifest-'));
  try {
    mkdirSync(join(root, 'sample')); writeFileSync(join(root, 'sample/SKILL.md'), '# Sample\nUse sdk 2.\n');
    const manifest = buildManifest({ id: 'sdk', skills: ['sample'], topic: 'Package and runtime compatibility' },
      root, '.cache/freshness/sdk.md', ['sample/SKILL.md']);
    assert.equal(manifest.schema, 'jev-lint-documents-manifest-1');
    assert.equal(manifest.comparisons.length, 1);
    assert.equal(manifest.files.upstream.role, 'reference');
    assert.equal(manifest.files.target0.path, 'sample/SKILL.md');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('semantic coverage is incomplete when any comparison is missing or unassessed', () => {
  const report = { status: 'complete', coverage: { expected: 2, selected: 2, answered: 2,
    missing: 0, contradictions: 0, unassessed: 0, deferred: 0, issues: 0, unboundDocuments: 0 } };
  assert.equal(assessSemantic(report), 0);
  assert.equal(assessSemantic({ ...report, coverage: { ...report.coverage, contradictions: 1 } }), 1);
  assert.equal(assessSemantic({ ...report, coverage: { ...report.coverage, unassessed: 1 } }), 3);
  assert.equal(assessSemantic({ ...report, coverage: { ...report.coverage, answered: 1 } }), 3);
});

test('action metadata follows composite dependencies and action.yaml fallback', async () => {
  const result = await inspectAction({ kind: 'github-action', repository: 'example/setup', ref: 'v1' }, {
    fetch: async (url) => {
      if (url.includes('/example/setup/') && url.includes('action.yml?')) return reply({}, 404);
      const text = url.includes('/example/setup/')
        ? 'runs:\n  using: composite\n  steps:\n    - uses: example/old@v1\n'
        : 'runs:\n  using: node20\n';
      return reply({ sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from(text).toString('base64') });
    },
  });
  assert.deepEqual(result.map((s) => s.runtime), ['composite', 'node20']);
});

test('two topics can select distinct sections of the same registered target', () => {
  const root = mkdtempSync(join(tmpdir(), 'freshness-sections-'));
  try {
    writeFileSync(join(root, 'guide.md'), '# Guide\n## One\nA\n## Two\nB\n');
    const manifest = buildManifest({ id: 'sections', comparisons: [
      { path: 'guide.md', heading: 'One' }, { path: 'guide.md', heading: 'Two' },
    ] }, root, 'evidence.md', ['guide.md']);
    assert.equal(Object.values(manifest.files).filter((s) => s.path === 'guide.md').length, 1);
    assert.equal(manifest.comparisons.length, 2);
    assert.equal(manifest.comparisons[0].target.source, manifest.comparisons[1].target.source);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('pnpm schema evidence probes readonly commands and excludes advisory content', async () => {
  const calls = [];
  const result = await fetchSource({ kind: 'pnpm-audit-schema' }, { root: '/test', run(command, args) {
    calls.push([command, args]);
    return args[0] === '--version' ? { status: 0, stdout: '10.28.2\n' }
      : { status: 1, stdout: JSON.stringify({ advisories: { '1': { severity: 'high', module_name: 'secret-project-package' } },
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } }) };
  } });
  assert.equal(result.revision, '10.28.2');
  assert.match(result.text, /metadata.vulnerabilities/);
  assert.ok(!result.text.includes('secret-project-package'));
  assert.deepEqual(calls, [['pnpm', ['--version']], ['pnpm', ['audit', '--json']]]);
});
