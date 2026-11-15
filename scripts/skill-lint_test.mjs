import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { skillFiles } from './skill-lint.mjs';

test('includes new and translated skills while excluding ignored and nested copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-lint-'));
  try {
    const write = (path, text = 'skill') => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    execFileSync('git', ['init', '--quiet', root]);
    write('alpha/SKILL.md');
    execFileSync('git', ['-C', root, 'add', 'alpha/SKILL.md']);
    write('beta/SKILL.md');
    write('beta/SKILL-ja.md');
    write('beta/README.md');
    write('beta/examples/demo/SKILL.md');
    write('.agents/skills/upstream/SKILL.md');
    write('private/SKILL.md');
    write('.gitignore', 'private/\n.agents/\n');
    assert.deepEqual(skillFiles(root), [
      'alpha/SKILL.md', 'beta/SKILL-ja.md', 'beta/SKILL.md',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not silently omit a tracked skill missing from the working tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-lint-missing-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    mkdirSync(join(root, 'alpha'));
    writeFileSync(join(root, 'alpha/SKILL.md'), 'skill');
    execFileSync('git', ['-C', root, 'add', 'alpha/SKILL.md']);
    rmSync(join(root, 'alpha/SKILL.md'));
    assert.throws(() => skillFiles(root), /alpha\/SKILL\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
