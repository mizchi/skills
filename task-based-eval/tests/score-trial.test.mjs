import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scoreTrial } from '../scripts/score-trial.mjs';

const rubric = () => ({
  schema_version: 1,
  criteria: [
    { id: 'public-api', critical: true, weight: 1, anchors: { 0: 'Bypasses the package', 1: 'Uses a private entrypoint', 2: 'Uses only supported entrypoints' } },
    { id: 'recovery', critical: false, weight: 3, anchors: { 0: 'Cannot recover', 1: 'Recovers with a workaround', 2: 'Recovers through the documented contract' } },
  ],
});
const trial = () => ({
  schema_version: 1,
  status: 'completed',
  oracle_passed: true,
  observations: [
    { id: 'public-api', score: 2, evidence: ['consumer.mjs imports the package export'] },
    { id: 'recovery', score: 2, evidence: ['commands.log: error code recognized and corrected'] },
  ],
});

test('computes the weighted score without turning a partial critical item into success', () => {
  const input = trial(); input.observations[0].score = 1;
  const result = scoreTrial(rubric(), input);
  assert.equal(result.score_percent, 87.5);
  assert.equal(result.success, false);
  assert.deepEqual(result.failed_critical, ['public-api']);
});

test('an execution failure overrides a perfect subjective rubric', () => {
  const input = trial(); input.oracle_passed = false;
  const result = scoreTrial(rubric(), input);
  assert.equal(result.score_percent, 100);
  assert.equal(result.success, false);
});

test('accepts a fully evidenced successful trial', () => {
  const result = scoreTrial(rubric(), trial());
  assert.equal(result.success, true);
  assert.equal(result.score_percent, 100);
  assert.equal(result.excluded_from_quality_rates, false);
});

test('preserves percentages for very large or small representable weights', () => {
  for (const weight of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const input = rubric(); input.criteria = [{ ...input.criteria[0], weight }];
    const attempt = trial(); attempt.observations = [attempt.observations[0]];
    assert.equal(scoreTrial(input, attempt).score_percent, 100);
    attempt.observations[0].score = 1;
    assert.equal(scoreTrial(input, attempt).score_percent, 50);
  }
});

test('blocked and contaminated trials remain unassessed instead of becoming zero-score failures', () => {
  for (const status of ['blocked', 'contaminated']) {
    const result = scoreTrial(rubric(), { schema_version: 1, status, reason: 'Recorded environmental limitation or exposure' });
    assert.equal(result.success, null);
    assert.equal(result.score_percent, null);
    assert.equal(result.excluded_from_quality_rates, true);
  }
});

test('rejects incomplete, duplicated, invented and unsupported scores', () => {
  const cases = [
    input => input.observations.pop(),
    input => input.observations.push(input.observations[0]),
    input => input.observations[0].id = 'invented',
    input => input.observations[0].score = 1.5,
    input => input.observations[0].score = '2',
    input => input.observations[0].evidence = [],
    input => input.observations[0].evidence = [' '],
    input => delete input.oracle_passed,
  ];
  for (const change of cases) {
    const input = trial(); change(input);
    assert.throws(() => scoreTrial(rubric(), input));
  }
});

test('requires a critical criterion, concrete anchors, finite positive weights and unique IDs', () => {
  const cases = [
    input => input.criteria[0].critical = false,
    input => input.criteria[0].weight = 0,
    input => input.criteria[0].weight = Infinity,
    input => input.criteria.forEach(item => item.weight = Number.MAX_VALUE),
    input => input.criteria[0].anchors[1] = '',
    input => input.criteria[0].id = input.criteria[1].id,
    input => input.criteria[0].critical = 'true',
  ];
  for (const change of cases) {
    const input = rubric(); change(input);
    assert.throws(() => scoreTrial(input, trial()));
  }
});

test('requires an explanation for excluded trials and explicit schema versions', () => {
  assert.throws(() => scoreTrial(rubric(), { schema_version: 1, status: 'blocked' }));
  assert.throws(() => scoreTrial(rubric(), { schema_version: 1, status: 'unknown' }));
  assert.throws(() => scoreTrial({ ...rubric(), schema_version: 2 }, trial()));
  assert.throws(() => scoreTrial(rubric(), { ...trial(), schema_version: 2 }));
});

test('CLI distinguishes successful, failed, excluded and malformed trials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blind-api-score-'));
  try {
    const rubricPath = join(directory, 'rubric.json');
    const trialPath = join(directory, 'trial.json');
    writeFileSync(rubricPath, JSON.stringify(rubric()));
    const cases = [
      { input: trial(), status: 0, success: true },
      { input: { ...trial(), oracle_passed: false }, status: 1, success: false },
      { input: { schema_version: 1, status: 'blocked', reason: 'Runner unavailable' }, status: 2, success: null },
      { input: { ...trial(), observations: [] }, status: 2 },
    ];
    for (const { input, status, success } of cases) {
      writeFileSync(trialPath, JSON.stringify(input));
      const result = spawnSync(process.execPath, [new URL('../scripts/score-trial.mjs', import.meta.url).pathname, rubricPath, trialPath], { encoding: 'utf8' });
      assert.equal(result.status, status, result.stderr);
      if (success !== undefined) assert.equal(JSON.parse(result.stdout).success, success);
      else assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
