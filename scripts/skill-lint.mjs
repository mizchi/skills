import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';

export function skillFiles(root) {
  const paths = execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    ':(glob)*/SKILL.md', ':(glob)*/SKILL-ja.md',
  ], {
    cwd: root, encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const files = [...new Set(paths)].sort();
  for (const file of files) {
    if (!lstatSync(join(root, file)).isFile()) {
      throw new Error(`Skill source is not a regular file: ${file}`);
    }
  }
  return files;
}
