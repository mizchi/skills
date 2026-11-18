import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const expected = new Map([
  ['ordinary', { route: 'support', rule: 'R4' }],
  ['overlap', { route: 'security', rule: 'R1' }],
  ['outage', { route: 'incident', rule: 'R2' }],
  ['lockout', { route: 'identity', rule: 'R3' }],
  ['workaround', { route: 'support', rule: 'R4' }],
]);

export function verifyDecisions(decisions) {
  if (!Array.isArray(decisions)) return { passed: false, failures: ['Expected a JSON array'] };
  const failures = [];
  const seen = new Set();
  for (const decision of decisions) {
    const answer = expected.get(decision?.id);
    if (!answer || seen.has(decision.id)) {
      failures.push('Unknown or duplicated decision ID');
      continue;
    }
    seen.add(decision.id);
    if (decision.route !== answer.route || decision.rule !== answer.rule)
      failures.push(`${decision.id}: route or rule does not match the routing policy`);
  }
  if (seen.size !== expected.size) failures.push('Missing request decisions');
  return { passed: failures.length === 0, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node verify.mjs <decisions.json>');
    const result = verifyDecisions(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
