import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('the published package provides vlmkit and compares local HTML', () => {
  const binary = resolve('node_modules/@mizchi/vlmkit/dist/vlmkit.mjs');
  const help = spawnSync(process.execPath, [binary, 'diff', 'html', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--output-dir/);
  const dir = mkdtempSync(join(tmpdir(), 'vlmkit-skill-'));
  try {
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Test</title><body><h1>Hello</h1></body></html>';
    writeFileSync(join(dir, 'before.html'), html);
    writeFileSync(join(dir, 'after.html'), html);
    const result = spawnSync(process.execPath, [binary, 'diff', 'html',
      join(dir, 'before.html'), join(dir, 'after.html'), '--output-dir', join(dir, 'report'), '--no-discover'],
    { encoding: 'utf8', timeout: 90_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const files = readdirSync(join(dir, 'report'), { recursive: true });
    const jsonFiles = files.filter((f) => String(f).endsWith('.json'));
    assert.ok(jsonFiles.length, `No JSON report: ${files}`);
    const reports = jsonFiles.map((f) => JSON.parse(readFileSync(join(dir, 'report', String(f)), 'utf8')));
    const comparisons = reports.flatMap((r) => r.results ?? []);
    assert.equal(comparisons.length, 3, 'All three standard viewports must be compared');
    assert.ok(comparisons.every((r) => r.diffPixels === 0 && r.diffRatio === 0),
      'Identical HTML must have no changed pixels');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
