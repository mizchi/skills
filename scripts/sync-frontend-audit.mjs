import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const collectors = {
  'frontend-review-triage': { 'audit-triage.sh': 'triage' },
  'frontend-review-ci': { 'audit-ci.sh': 'ci' },
  'frontend-review-deps': { 'audit-deps.sh': 'deps', 'audit-trend-watch.sh': 'trend-watch' },
  'frontend-review-hygiene': { 'audit-typescript.sh': 'typescript', 'audit-lint.sh': 'lint', 'audit-similarity.sh': 'similarity' },
  'frontend-review-security': { 'audit-security.sh': 'security' },
  'frontend-review-testing': { 'audit-coverage.sh': 'coverage' },
};
const check = process.argv.includes('--check');
const core = readFileSync(join(root, 'scripts/frontend-audit.mjs'), 'utf8')
  .replace("'../dep-lib-review/scripts/audit-report.mjs'", "'./audit-report.mjs'");
const parser = readFileSync(join(root, 'dep-lib-review/scripts/audit-report.mjs'), 'utf8');
const contract = readFileSync(join(root, 'frontend-review-triage/references/collection-contract.md'), 'utf8');
let files = 0;
for (const [skill, wrappers] of Object.entries(collectors)) {
  const entries = { 'frontend-audit.mjs': core, 'audit-report.mjs': parser };
  for (const [name, mode] of Object.entries(wrappers)) {
    entries[name] = `#!/bin/sh\nset -eu\nexec node "$(dirname "$0")/frontend-audit.mjs" ${mode} "$@"\n`;
  }
  for (const [name, content] of Object.entries(entries)) {
    const dest = join(root, skill, 'scripts', name);
    if (check) {
      if (readFileSync(dest, 'utf8') !== content) throw new Error(`Out-of-date collector: ${dest}`);
    } else {
      mkdirSync(join(root, skill, 'scripts'), { recursive: true });
      writeFileSync(dest, content);
      if (name.endsWith('.sh')) chmodSync(dest, 0o755);
    }
    files++;
  }
}
const readers = [...Object.keys(collectors), 'frontend-review-weekly', 'frontend-review-state',
  'frontend-review-performance', 'frontend-expert', 'frontend-ops-expert', 'react-expert',
  'performance-expert', 'security-expert'];
for (const skill of readers) {
  const dest = join(root, skill, 'references/collection-contract.md');
  if (check) {
    if (readFileSync(dest, 'utf8') !== contract) throw new Error(`Out-of-date collection contract: ${dest}`);
  } else {
    mkdirSync(join(root, skill, 'references'), { recursive: true });
    writeFileSync(dest, contract);
  }
  files++;
}
console.log(`${check ? 'Verified' : 'Generated'} ${files} standalone collector resources`);
