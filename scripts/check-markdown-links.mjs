import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lycheeBinary, repository } from './install-lychee.mjs';

export function markdownFiles(root) {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8',
  }).split('\0').filter(path => /\.(md|markdown|mdx)$/i.test(path));
  return [...new Set(paths)].filter(path => {
    // These are quoted classifier inputs, not maintained documentation.
    if (path.startsWith('.jev-lint/rules/') && path.includes('/fixtures/')) return false;
    try { return statSync(join(root, path)).isFile(); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }).sort();
}

export async function checkLinks({ root = repository, online = false, quiet = false } = {}) {
  const files = markdownFiles(root);
  if (!files.length) throw new Error('No Markdown sources found');
  const output = join(root, '.cache', 'markdown-links', `${online ? 'online' : 'local'}.json`);
  mkdirSync(join(output, '..'), { recursive: true });
  rmSync(output, { force: true });
  const args = ['--config', join(root, 'lychee.toml'), '--no-progress',
    '--root-dir', root, '--format', 'json', '--output', output];
  if (online) {
    args.push('--scheme', 'http', '--scheme', 'https', '--include-fragments=none', '--cache');
  } else {
    args.push('--offline', '--include-fragments=anchor-only');
  }
  args.push('--', ...files);
  if (!quiet) console.error(`Checking ${files.length} Markdown files (${online ? 'HTTP(S)' : 'local files and fragments'})`);
  const child = spawn(lycheeBinary, args, { cwd: root, stdio: quiet ? 'ignore' : 'inherit' });
  const code = await new Promise((resolve, reject) => {
    child.on('error', error => reject(new Error(error.code === 'ENOENT'
      ? 'Run pnpm links:install before checking links.' : error.message)));
    child.on('exit', (code, signal) => signal ? reject(new Error(`lychee terminated: ${signal}`)) : resolve(code));
  });
  if (!existsSync(output)) throw new Error(`lychee exited ${code} without producing a report; check the command diagnostics.`);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  if (!quiet) {
    for (const [source, errors] of Object.entries(report.error_map)) {
      for (const error of errors) console.error(`${source}: ${error.url} — ${error.status.text}`);
    }
    console.error(`${report.errors} link error(s); report: ${output}`);
  }
  return { code, report, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--online', '--list'].includes(arg))) throw new Error('Usage: check-markdown-links.mjs [--online] [--list]');
    if (args.includes('--list')) console.log(markdownFiles(repository).join('\n'));
    else process.exitCode = (await checkLinks({ online: args.includes('--online') })).code;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
