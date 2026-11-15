import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillFiles } from './skill-lint.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Set(skillFiles(root));
const manifest = {
  schema: 'jev-lint-documents-manifest-1', roots: [], files: {}, comparisons: [],
};
for (const target of [...files].sort()) {
  if (!target.endsWith('/SKILL-ja.md')) continue;
  const reference = target.replace('/SKILL-ja.md', '/SKILL.md');
  if (!files.has(reference)) throw new Error(`Japanese companion has no canonical source: ${target}`);
  const skill = target.split('/')[0];
  const selectors = {};
  for (const [language, path, role] of [
    ['en', reference, 'reference'], ['ja', target, 'document'],
  ]) {
    const id = `${skill}-${language}`;
    manifest.files[id] = { path, role };
    manifest.roots.push(path);
    const name = readFileSync(join(root, path), 'utf8').split('\n').find((line) => /^name:/.test(line));
    if (!name) throw new Error(`Missing frontmatter name in ${path}`);
    selectors[language] = { source: id, contains: name };
  }
  manifest.comparisons.push({
    id: skill,
    topic: 'Skill workflow, authorization requirements, and declared tool behavior',
    mode: 'translation',
    reference: { source: `${skill}-en` }, target: { source: `${skill}-ja` },
  }, {
    id: `${skill}-activation`,
    topic: 'Advertised capabilities and activation conditions, including explicit-only versus automatic invocation',
    mode: 'translation', reference: selectors.en, target: selectors.ja,
    context: [{ source: `${skill}-en` }, { source: `${skill}-ja` }],
  });
}
if (!manifest.comparisons.length) throw new Error('No translation pairs found');
writeFileSync(join(root, '.jev-lint/documents.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const cli = fileURLToPath(new URL('./cli.js', import.meta.resolve('jev-lint')));
const result = spawnSync(process.execPath, [cli, 'docs', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 3);
