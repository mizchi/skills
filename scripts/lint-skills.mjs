import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { skillFiles } from './skill-lint.mjs';
import { checkJevRuleCases } from './check-jev-rule-cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
checkJevRuleCases(root);
const files = skillFiles(root);
if (!files.length) throw new Error('No maintained skill sources found');
console.error(`Checking ${files.length} maintained skill documents (including untracked additions and Japanese companions)`);
const cli = fileURLToPath(new URL('./cli.js', import.meta.resolve('jev-lint')));
const result = spawnSync(process.execPath, [
  cli, 'check', ...files, ...process.argv.slice(2),
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 3);
