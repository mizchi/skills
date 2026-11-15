import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('file order, shell values and overload follow the documented precedence', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotenvx precedence '));
  try {
    writeFileSync(join(root, '.env.first'), 'SKILL_PRECEDENCE=first\n');
    writeFileSync(join(root, '.env.second'), 'SKILL_PRECEDENCE=second\n');
    const cli = fileURLToPath(
      new URL(
        './node_modules/@dotenvx/dotenvx/src/cli/dotenvx.js',
        import.meta.url,
      ),
    );
    const env = { ...process.env };
    delete env.SKILL_PRECEDENCE;
    const read = (flags = [], extra = {}) => {
      const r = spawnSync(process.execPath, [
        cli,
        'run',
        '--quiet',
        ...flags,
        '-f',
        '.env.first',
        '-f',
        '.env.second',
        '--',
        process.execPath,
        '-p',
        'process.env.SKILL_PRECEDENCE',
      ], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    assert.equal(read(), 'first');
    assert.equal(read([], { SKILL_PRECEDENCE: 'shell' }), 'shell');
    assert.equal(read(['--overload']), 'second');
    assert.equal(read(['--overload'], { SKILL_PRECEDENCE: 'shell' }), 'second');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
