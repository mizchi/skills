import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  assessTextRecord,
  materializeReview,
  selectReview,
  translationManifest,
} from './skill-review.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'skill-review '));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  const write = (path, value = '# Skill\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = () => {
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  write('alpha/SKILL.md');
  write('alpha/SKILL-ja.md');
  write('beta/SKILL.md');
  return { root, git, write, commit, base: commit() };
}

test('a change selects the complete document and its translation, not unrelated skills', () => {
  const f = fixture();
  try {
    f.write('alpha/SKILL-ja.md', '# Updated Japanese\n');
    const head = f.commit();
    const review = selectReview(f.root, { base: f.base, head });
    assert.deepEqual(review.files, ['alpha/SKILL-ja.md', 'alpha/SKILL.md']);
    assert.deepEqual(review.skills, ['alpha']);
    const manifest = translationManifest(review.files);
    assert.equal(manifest.comparisons.length, 2);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('reference changes select their parent, while review-engine changes select every skill', () => {
  const f = fixture();
  try {
    f.write('alpha/references/api.md');
    let head = f.commit();
    assert.deepEqual(selectReview(f.root, { base: f.base, head }).skills, [
      'alpha',
    ]);
    f.write(
      'scripts/skill-review.mjs',
      'throw new Error("must never execute")',
    );
    head = f.commit();
    assert.deepEqual(selectReview(f.root, { base: f.base, head }).skills, [
      'alpha',
      'beta',
    ]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('deletions and unrelated changes are explicit, and new orphan translations fail', () => {
  const f = fixture();
  try {
    rmSync(join(f.root, 'beta/SKILL.md'));
    f.write('README.md');
    let head = f.commit();
    const review = selectReview(f.root, { base: f.base, head });
    assert.deepEqual(review.files, []);
    assert.deepEqual(review.deleted, ['beta/SKILL.md']);
    f.write('orphan/SKILL-ja.md');
    head = f.commit();
    assert.throws(
      () => selectReview(f.root, { base: f.base, head }),
      /canonical/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('proposal config/scripts are never materialized and SKILL symlinks are rejected', () => {
  const f = fixture();
  const out = mkdtempSync(join(tmpdir(), 'skill-data '));
  try {
    f.write('alpha/SKILL.md', '# Proposed content\n');
    f.write('.jev-lint.yaml', 'apiKey: untrusted');
    f.write('package.json', '{"scripts":{"postinstall":"untrusted"}}');
    const head = f.commit();
    const review = selectReview(f.root, { base: f.base, head });
    const copied = materializeReview(f.root, review, out);
    assert.deepEqual(copied, review.files);
    assert.equal(copied.includes('package.json'), false);
    rmSync(join(f.root, 'alpha/SKILL.md'));
    symlinkSync('/etc/passwd', join(f.root, 'alpha/SKILL.md'));
    assert.throws(
      () => selectReview(f.root, { base: f.base, head: f.commit() }),
      /regular/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('empty, missing, duplicated or unplanned text answers cannot pass', () => {
  const expected = [{
    file: 'alpha/SKILL.md',
    ruleKey: 'text/check',
    line: 1,
    endLine: 4,
  }];
  const answer = { ...expected[0], value: 0.1 };
  const report = { schema: 'jev-lint-run-1', answers: [answer] };
  assert.equal(assessTextRecord(report, expected), 0);
  for (
    const answers of [[], [{ ...answer, value: null }], [answer, answer], [{
      ...answer,
      file: 'beta/SKILL.md',
    }]]
  ) {
    assert.equal(assessTextRecord({ ...report, answers }, expected), 3);
  }
});

test('runner refuses an incomplete current record even when the process exits zero', async () => {
  const { cpSync, readFileSync } = await import('node:fs');
  const { runReview } = await import('./review-skills.mjs');
  const f = fixture();
  const key = process.env.TYPESAFE_API_KEY;
  try {
    f.write('beta/SKILL.md', '# Changed\n');
    const head = f.commit();
    cpSync('.jev-lint', join(f.root, '.jev-lint'), { recursive: true });
    cpSync('.jev-lint.yaml', join(f.root, '.jev-lint.yaml'));
    process.env.TYPESAFE_API_KEY = 'test-double';
    const result = await runReview({
      root: f.root,
      base: f.base,
      head,
      run(_command, args) {
        if (args.includes('--dry-run')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              subjects: 1,
              subjectList: [{
                file: 'beta/SKILL.md',
                rule: 'check',
                line: 1,
                endLine: 2,
              }],
            }),
          };
        }
        const path = args[args.indexOf('--record') + 1];
        writeFileSync(
          path,
          JSON.stringify({ schema: 'jev-lint-run-1', answers: [] }),
        );
        return { status: 0 };
      },
    });
    assert.equal(result.exitCode, 3);
    assert.equal(
      JSON.parse(
        readFileSync(join(f.root, '.cache/skill-review/current/report.json')),
      ).status,
      'failed',
    );
  } finally {
    if (key === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = key;
    rmSync(f.root, { recursive: true, force: true });
  }
});
