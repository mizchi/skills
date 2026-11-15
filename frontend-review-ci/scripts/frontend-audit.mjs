#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeAudit } from './audit-report.mjs';

const modes = new Set(['triage', 'ci', 'deps', 'trend-watch', 'typescript', 'lint', 'similarity', 'coverage', 'security']);
const ignored = new Set(['.git', 'node_modules', '.frontend-review', '.cache', 'dist', 'build', '_build', '.mooncakes']);
const codeFile = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;
const command = (name, args, root) => spawnSync(name, args, {
  cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
});

function inventory(root) {
  const git = command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], root);
  if (!git.status) return [...new Set(git.stdout.split('\0').filter(Boolean))].sort();
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.isFile()) files.push(path);
    }
  }
  walk(root);
  return files.sort();
}

export function analyze(mode, snapshot, commands = {}) {
  if (!modes.has(mode)) throw new Error(`Unknown audit mode: ${mode}`);
  const { files, pkg, sources } = snapshot;
  const issues = [...(snapshot.issues ?? [])];
  const data = {};
  const missing = (message) => issues.push(message);
  if (mode === 'triage') {
    const locks = files.filter((p) => ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'].includes(p));
    Object.assign(data, { lockfiles: locks, lockfile_count: locks.length,
      package_manager_field: pkg.packageManager ?? null, node_engine: pkg.engines?.node ?? null,
      dependencies: Object.keys(pkg.dependencies ?? {}).length,
      devDependencies: Object.keys(pkg.devDependencies ?? {}).length,
      readme: files.find((p) => /^readme(?:\.|$)/i.test(p)) ?? null,
      open_issues: null, scripts: Object.keys(pkg.scripts ?? {}) });
  } else if (mode === 'ci') {
    data.workflows = files.filter((p) => /^\.github\/workflows\/.*\.ya?ml$/.test(p));
    data.runs = null;
    if (commands.ci?.status === 0) {
      try { data.runs = JSON.parse(commands.ci.stdout); if (!Array.isArray(data.runs)) throw new Error(); }
      catch { data.runs = null; missing('GitHub run metadata has an unknown format'); }
    } else missing('GitHub runs not collected; use --run-checks with authenticated gh');
  } else if (mode === 'deps') {
    data.dependencies = pkg.dependencies ?? {};
    data.devDependencies = pkg.devDependencies ?? {};
    data.audit = null;
    if (commands.audit && [0, 1].includes(commands.audit.status)) {
      try { data.audit = normalizeAudit(JSON.parse(commands.audit.stdout)); }
      catch { missing('Dependency audit returned an unknown or failed report'); }
    } else missing('Dependency audit not completed; use --run-checks or collect it separately');
    data.outdated = null;
    if (commands.outdated && [0, 1].includes(commands.outdated.status)) {
      try {
        data.outdated = JSON.parse(commands.outdated.stdout);
        if (!data.outdated || typeof data.outdated !== 'object') throw new Error();
      } catch { data.outdated = null; missing('Outdated-package report unavailable or malformed'); }
    } else missing('Outdated-package command did not complete');
  } else if (mode === 'trend-watch') {
    data.packages = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .map(([name, declaredRange]) => ({ name, declaredRange }));
    data.deprecationVerdicts = null;
    missing('Package names alone do not establish deprecation; inspect current upstream notices');
  } else if (mode === 'typescript') {
    const text = sources.map((s) => s.text).join('\n');
    data.any_count = (text.match(/\bany\b/g) ?? []).length;
    data.ts_ignore_count = (text.match(/@ts-ignore\b/g) ?? []).length;
    data.config_files = files.filter((p) => /(^|\/)tsconfig[^/]*\.json$/.test(p));
    data.typecheck = null;
    if (commands.typescript && (commands.typescript.status === 0
      || [1, 2].includes(commands.typescript.status) && /error TS\d+:/.test(commands.typescript.stdout))) {
      data.typecheck = { exitCode: commands.typescript.status,
        diagnostics: (commands.typescript.stdout.match(/error TS\d+:/g) ?? []).length };
    } else missing('Type checker not executed; lexical counts include comments and strings');
  } else if (mode === 'lint') {
    data.config_files = files.filter((p) => /(?:eslint|biome|oxlint|oxfmt|prettier)/i.test(p) && !p.includes('/src/'));
    data.declared_script = pkg.scripts?.lint ?? null;
    data.errors = null; data.warnings = null;
    missing('Lint results not measured; run the project\'s configured read-only command separately');
  } else if (mode === 'similarity') {
    const seen = new Map(); const duplicates = [];
    for (const source of sources) {
      const lines = source.text.split('\n');
      for (let i = 0; i + 8 <= lines.length; i += 8) {
        const block = lines.slice(i, i + 8).join('\n').trim();
        if (block.length < 80) continue;
        const hash = createHash('sha256').update(block).digest('hex');
        if (seen.has(hash)) duplicates.push({ first: seen.get(hash), second: { path: source.path, line: i + 1 } });
        else seen.set(hash, { path: source.path, line: i + 1 });
      }
    }
    data.duplicate_blocks = duplicates;
    data.method = 'exact non-overlapping eight-line blocks; not semantic or token-level similarity';
  } else if (mode === 'coverage') {
    data.test_files = files.filter((p) => /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\/)/.test(p));
    data.config_files = files.filter((p) => /(?:vitest|playwright)\.config\./.test(p));
    const validCoverage = snapshot.coverage && ['lines', 'statements', 'functions', 'branches'].every((key) => {
      const metric = snapshot.coverage[key];
      return metric && ['total', 'covered', 'skipped'].every((field) => Number.isSafeInteger(metric[field]) && metric[field] >= 0)
        && metric.covered <= metric.total && metric.skipped <= metric.total
        && Number.isFinite(metric.pct) && metric.pct >= 0 && metric.pct <= 100;
    });
    data.coverage = validCoverage ? snapshot.coverage : null;
    data.report_mtime = snapshot.coverageMtime ?? null;
    if (!data.coverage) missing('No readable coverage-summary.json; tests were not run');
  } else if (mode === 'security') {
    const patterns = [ ['html-sink', /(?:innerHTML\s*=|dangerouslySetInnerHTML)/],
      ['dynamic-code', /\beval\s*\(|\bnew Function\s*\(/],
      ['browser-token-storage', /localStorage\.setItem\s*\(\s*['"](?:token|access_token)/] ];
    data.findings = [];
    for (const source of sources) source.text.split('\n').forEach((line, i) => {
      for (const [rule, pattern] of patterns) if (pattern.test(line)) {
        data.findings.push({ path: source.path, line: i + 1, rule });
      }
    });
    data.method = 'lexical screening; no data-flow, auth or penetration-test verdict';
  }
  return { schemaVersion: 1, category: mode, status: issues.length ? 'partial' : 'complete',
    coverage: { files: files.length, sourceFiles: sources.length }, issues, data };
}

export function collect(mode, root, { runChecks = false, run = command } = {}) {
  const files = inventory(root);
  const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : {};
  const sources = []; const issues = [];
  for (const path of files.filter((p) => codeFile.test(p) && !p.split('/').some((part) => ignored.has(part)))) {
    const full = join(root, path);
    if (!existsSync(full) || !lstatSync(full).isFile()) continue;
    if (lstatSync(full).size > 2 * 1024 * 1024) { issues.push(`Source exceeds scan size: ${path}`); continue; }
    sources.push({ path, text: readFileSync(full, 'utf8') });
  }
  let coverage = null, coverageMtime = null;
  const summary = join(root, 'coverage/coverage-summary.json');
  if (existsSync(summary)) {
    try { coverage = JSON.parse(readFileSync(summary, 'utf8')).total ?? null; coverageMtime = lstatSync(summary).mtime.toISOString(); }
    catch { issues.push('Existing coverage summary is malformed'); }
  }
  const commands = {};
  if (runChecks && mode === 'deps') {
    commands.audit = run('pnpm', ['audit', '--json'], root);
    commands.outdated = run('pnpm', ['outdated', '--json'], root);
  }
  if (runChecks && mode === 'ci') commands.ci = run('gh', ['run', 'list', '--limit', '30', '--json',
    'databaseId,workflowName,createdAt,updatedAt,status,conclusion,headBranch'], root);
  if (runChecks && mode === 'typescript') commands.typescript = run('pnpm', ['exec', 'tsc', '--noEmit', '--pretty', 'false'], root);
  return analyze(mode, { files, pkg, sources, issues, coverage, coverageMtime }, commands);
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), mode = args.shift();
    let root, runChecks = false;
    while (args.length) {
      const arg = args.shift();
      if (arg === '--repo') root = args.shift();
      else if (arg === '--run-checks') runChecks = true;
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!root || !modes.has(mode)) throw new Error('Usage: audit <mode> --repo <project> [--run-checks]');
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24+ is required');
    root = resolve(root);
    const report = collect(mode, root, { runChecks });
    const out = join(root, '.frontend-review/report/latest');
    mkdirSync(join(out, 'raw'), { recursive: true });
    mkdirSync(join(out, 'md'), { recursive: true });
    writeFileSync(join(out, 'raw', `${mode}.json`), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(out, 'md', `${mode}-collection.md`), `# ${mode} collection\n\nStatus: ${report.status}\n\n${report.issues.map((s) => `- ${s}`).join('\n')}\n`);
    console.log(JSON.stringify({ category: mode, status: report.status, report: join(out, 'raw', `${mode}.json`) }));
    process.exitCode = report.status === 'complete' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
