import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFreshness } from './lint-freshness.mjs';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'freshness-run-'));
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'sample'));
  writeFileSync(join(root, 'sample/SKILL.md'), '# Sample\nInstall sdk 1.\n');
  writeFileSync(join(root, 'docs/skill-upstream-watchlist.json'), JSON.stringify({ schemaVersion: 1, groups: [
    { id: 'sdk', skills: ['sample'], sources: [{ kind: 'npm-dist-tag', package: 'sdk', tag: 'latest' }] },
  ] }));
  return root;
}
const response = (version = '1') => async () => new Response(JSON.stringify({ name: 'sdk', version }),
  { headers: { 'content-type': 'application/json' } });
const { prepareDocuments, scanDocuments } = await import(new URL('./documents.js', import.meta.resolve('jev-lint')));
const judge = async ({ manifestPath, recordPath }) => {
  const root = manifestPath.split('/.cache/')[0];
  const input = prepareDocuments(JSON.parse(readFileSync(manifestPath, 'utf8')), { cwd: root });
  const client = { spent: { calls: 0, inputTokens: 0, usd: 0 }, servedModel: 'test-double',
    async askSplitting() {
      this.spent.calls++;
      return { answers: { q0000: { type: 'choice', choice: 'supports', confidence: 1,
        probabilities: { supports: 1, contradicts: 0, unrelated: 0, insufficient_context: 0 } } } };
    } };
  const report = await scanDocuments(input, { client });
  writeFileSync(recordPath, JSON.stringify(report));
  return { status: 0 };
};

test('acceptance is explicit, and a later upstream change fails even with clean semantic answers', async () => {
  const root = setup();
  try {
    const initial = await runFreshness({ root, fetch: response(), runJev: judge });
    assert.equal(initial.exitCode, 1);
    assert.equal(existsSync(join(root, '.jev-lint/freshness-baseline.json')), false);
    const accepted = await runFreshness({ root, fetch: response(), runJev: judge, accept: true });
    assert.equal(accepted.exitCode, 0);
    const current = await runFreshness({ root, fetch: response(), runJev: () => { throw new Error('Unchanged groups must not spend model requests'); } });
    assert.equal(current.exitCode, 0);
    assert.equal(current.groups[0].cached, true);
    const changed = await runFreshness({ root, fetch: response('2'), runJev: judge });
    assert.equal(changed.exitCode, 1);
    assert.equal(changed.drift.upstream.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid configuration and HTTP failure replace old successes with failed reports', async () => {
  const root = setup();
  try {
    await runFreshness({ root, fetch: response(), runJev: judge, accept: true });
    const failed = await runFreshness({ root, fetch: async () => new Response('offline', { status: 503 }), runJev: judge });
    assert.equal(failed.exitCode, 3);
    assert.equal(existsSync(join(root, '.cache/skill-freshness/current/sdk.jev.json')), false);
    writeFileSync(join(root, 'docs/skill-upstream-watchlist.json'), 'invalid');
    const invalid = await runFreshness({ root, fetch: response(), runJev: judge });
    assert.equal(invalid.status, 'failed');
    assert.equal(JSON.parse(readFileSync(join(root, '.cache/skill-freshness/current/report.json'))).exitCode, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a missing model record cannot reuse a successful prior verdict', async () => {
  const root = setup();
  try {
    await runFreshness({ root, fetch: response(), runJev: judge, accept: true });
    const failed = await runFreshness({ root, fetch: response(), runJev: async () => ({ status: 3 }), force: true });
    assert.equal(failed.exitCode, 3);
    assert.equal(failed.groups[0].status, 'failed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('fabricated coverage cannot be accepted without a bound current document record', async () => {
  const root = setup();
  try {
    const forged = async ({ recordPath }) => {
      writeFileSync(recordPath, JSON.stringify({ status: 'complete', snapshotChanged: false, candidates: [],
        coverage: { expected: 1, selected: 1, answered: 1, missing: 0, contradictions: 0,
          unassessed: 0, deferred: 0, issues: 0, unboundDocuments: 0 } }));
      return { status: 0 };
    };
    const result = await runFreshness({ root, fetch: response(), runJev: forged, accept: true });
    assert.equal(result.exitCode, 3);
    assert.equal(result.accepted, false);
    assert.equal(existsSync(join(root, '.jev-lint/freshness-baseline.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parallel upstream completion order does not invalidate an unchanged action verdict', async () => {
  const root = setup();
  try {
    const path = join(root, 'docs/skill-upstream-watchlist.json');
    const watch = JSON.parse(readFileSync(path));
    watch.groups[0].id = 'github-actions';
    watch.groups[0].sources = ['a', 'b'].map((name) => ({ kind: 'github-action', repository: `example/${name}`, ref: 'v1' }));
    writeFileSync(path, JSON.stringify(watch));
    const fetch = (slow) => async (url) => {
      const name = url.includes('/example/a/') ? 'a' : 'b';
      if (name === slow) await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ sha: name.repeat(40), encoding: 'base64',
        content: Buffer.from('runs:\n  using: node24\n').toString('base64') }),
        { headers: { 'content-type': 'application/json' } });
    };
    const accepted = await runFreshness({ root, fetch: fetch('a'), runJev: judge, accept: true });
    assert.equal(accepted.exitCode, 0);
    const current = await runFreshness({ root, fetch: fetch('b'), runJev: () => { throw new Error('Unexpected repeat request'); } });
    assert.equal(current.exitCode, 0);
    assert.equal(current.groups[0].cached, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
