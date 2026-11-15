import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { markdownFiles, checkLinks } from './check-markdown-links.mjs';

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'skills-links-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  function put(file, content) {
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  put('lychee.toml', 'max_retries = 0\ntimeout = 3\nindex_files = ["README.md", "."]\n');
  return { root, put };
}

test('selects tracked and new Markdown, excluding dependencies and semantic-lint fixtures', t => {
  const { root, put } = project(t);
  put('.gitignore', 'node_modules/\n.agents/\n');
  put('README.md', '# Root');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  put('skill/reference/new.md', '# New');
  put('docs/fixtures/real-doc.md', '# Keep ordinary fixture documentation');
  put('node_modules/dependency/README.md', '# Dependency');
  put('.agents/skills/installed/SKILL.md', '# Installed');
  put('.jev-lint/rules/text/example/fixtures/case.md', '[intentional](missing.md)');
  put('code.ts', '');
  assert.deepEqual(markdownFiles(root), [
    'README.md', 'docs/fixtures/real-doc.md', 'skill/reference/new.md',
  ]);
});

test('checks GFM fragments, reference links, images and encoded paths without reading code as links', async t => {
  const { root, put } = project(t);
  put('README.md', '# Intro\n[Japanese](docs/a%20b.md#こんにちは)\n[again](#intro-1)\n[reference][target]\n![image](figure.svg)\n\n[target]: docs/a%20b.md#detail\n\n# Intro\n`obj[name](...args)`\n\n```js\n[not a link](missing.md)\n```\n');
  put('docs/a b.md', '# こんにちは\n## Detail\n');
  put('figure.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const result = await checkLinks({ root, quiet: true });
  assert.equal(result.code, 0);
  assert.equal(result.report.errors, 0);
});

test('fails on a missing relative file', async t => {
  const { root, put } = project(t);
  put('README.md', '[missing](missing.md)');
  const result = await checkLinks({ root, quiet: true });
  assert.notEqual(result.code, 0);
  assert.equal(result.report.errors, 1);
});

test('fails on a missing fragment in an existing Markdown file', async t => {
  const { root, put } = project(t);
  put('README.md', '[missing](target.md#missing)');
  put('target.md', '# Present');
  const result = await checkLinks({ root, quiet: true });
  assert.notEqual(result.code, 0);
  assert.match(JSON.stringify(result.report.error_map), /Cannot find fragment/);
});

test('offline sends no requests; online reports HTTP 404 and accepts HTTP 200', async t => {
  const { root, put } = project(t);
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(req.url === '/good' ? 200 : 404);
    res.end('response');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  put('README.md', `[good](${base}/good)\n[bad](${base}/missing)\n`);
  const offline = await checkLinks({ root, quiet: true });
  assert.equal(offline.code, 0);
  assert.deepEqual(requests, []);
  const online = await checkLinks({ root, online: true, quiet: true });
  assert.notEqual(online.code, 0);
  assert.equal(online.report.errors, 1);
  assert.deepEqual(requests.sort(), ['/good', '/missing']);
});

test('refuses an empty scan instead of claiming that links passed', async t => {
  const { root } = project(t);
  await assert.rejects(checkLinks({ root, quiet: true }), /No Markdown sources/);
});

test('a configuration error cannot reuse an earlier successful report', async t => {
  const { root, put } = project(t);
  put('README.md', '# Document');
  assert.equal((await checkLinks({ root, quiet: true })).code, 0);
  put('lychee.toml', 'not valid TOML = [');
  await assert.rejects(checkLinks({ root, quiet: true }), /without producing a report/);
});
