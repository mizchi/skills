import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyDecisions } from '../evals/route-support-request/private/verify.mjs';

const correct = () => [
  { id: 'ordinary', route: 'support', rule: 'R4' },
  { id: 'overlap', route: 'security', rule: 'R1' },
  { id: 'outage', route: 'incident', rule: 'R2' },
  { id: 'lockout', route: 'identity', rule: 'R3' },
  { id: 'workaround', route: 'support', rule: 'R4' },
];

test('accepts all policy decisions in any order', () => {
  assert.equal(verifyDecisions(correct().reverse()).passed, true);
});

test('rejects a plausible answer that violates rule precedence', () => {
  const input = correct(); input[1] = { id: 'overlap', route: 'identity', rule: 'R3' };
  assert.equal(verifyDecisions(input).passed, false);
});

test('rejects missing, duplicate, invented or unsupported decision evidence', () => {
  const cases = [
    input => input.pop(),
    input => input.push(input[0]),
    input => input[0].id = 'unknown',
    input => input[0].rule = 'R1',
    input => input[0].route = 'guessed',
  ];
  for (const change of cases) {
    const input = correct(); change(input);
    assert.equal(verifyDecisions(input).passed, false);
  }
  assert.equal(verifyDecisions({ decisions: correct() }).passed, false);
});
