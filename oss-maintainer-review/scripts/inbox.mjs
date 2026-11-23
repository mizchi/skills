// Read-only preliminary triage. Run with Node 24+ and authenticated gh.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
async function api(...args) {
  const { stdout } = await exec('gh', ['api', ...args], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const owner = process.argv[2] ?? (await api('user')).login;
if (!/^[a-z0-9-]+$/i.test(owner)) throw Error('Expected a GitHub owner login');
const query = `user:${owner} is:pr is:open -author:${owner}`;
const items = new Map();
let total;
let incomplete = false;
for (let page = 1; page <= 10; page++) {
  const result = await api('-X', 'GET', 'search/issues', '-f', 'q=' + query,
    '-f', 'sort=created', '-f', 'order=asc', '-f', 'per_page=100', '-F', 'page=' + page);
  total = result.total_count;
  incomplete ||= result.incomplete_results;
  for (const issue of result.items) items.set(issue.html_url, issue);
  if (page * 100 >= total || result.items.length < 100) break;
}
const pathRules = [
  ['workflow', /^\.github\/(?:workflows|actions)\//i],
  ['agent or review policy', /(?:^|\/)(?:CODEOWNERS|AGENTS\.md|CLAUDE\.md|SKILL\.md|\.mcp\.json)$|^\.(?:agents|claude|codex)\//i],
  ['execution entry point', /(?:^|\/)(?:Dockerfile[^/]*|Makefile|justfile|build\.rs|\.githooks\/.*|scripts\/.*)$|\.(?:sh|ps1)$/i],
  ['dependency or packaging', /(?:^|\/)(?:package\.json|Cargo\.toml|Cargo\.lock|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|moon\.mod\.json|pyproject\.toml|go\.mod)$/i],
];
const lineRules = [
  ['privileged event', /\b(?:pull_request_target|workflow_run)\b/],
  ['write permission', /(?:id-token|contents|packages)\s*:\s*write\b|permissions:\s*write-all/],
  ['network retrieval', /\b(?:curl|wget|Invoke-WebRequest)\b/],
  ['environment or credential access', /\bsecrets\s*[.[]|\b(?:GH_TOKEN|GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY)\b/],
  ['install hook', /"(?:preinstall|postinstall|prepare)"\s*:/],
  ['process execution', /\b(?:execFileSync|spawnSync|child_process|Command::new|subprocess\.run)\b/],
];
async function inspect(issue) {
  const repo = issue.repository_url.split('/').slice(-2).join('/');
  const base = { repo, number: issue.number, author: issue.user?.login, url: issue.html_url, updated: issue.updated_at };
  try {
    const pages = await api('--paginate', '--slurp', `repos/${repo}/pulls/${issue.number}/files?per_page=100`);
    const files = pages.flat();
    const signals = [];
    const missing = [];
    for (const f of files) {
      for (const [kind, pattern] of pathRules)
        if ([f.filename, f.previous_filename].some(p => p && pattern.test(p))) signals.push({ kind, path: f.filename });
      if (typeof f.patch !== 'string') { missing.push(f.filename); continue; }
      let line = 0, additions = 0, deletions = 0;
      const seen = new Set();
      for (const s of f.patch.split('\n')) {
        const header = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(s);
        if (header) { line = Number(header[1]); continue; }
        if (s.startsWith('-')) { deletions++; continue; }
        if (s.startsWith('+')) {
          additions++;
          for (const [kind, pattern] of lineRules) if (!seen.has(kind) && pattern.test(s)) {
            signals.push({ kind, path: f.filename, line });
            seen.add(kind);
          }
        }
        if (/^[+ ]/.test(s)) line++;
      }
      if (additions !== f.additions || deletions !== f.deletions) missing.push(f.filename);
    }
    return { ...base, files: files.length, signals, missing, fileLimitReached: files.length >= 3000 };
  } catch (err) {
    return { ...base, error: String(err.message).split('\n')[0] };
  }
}
const queue = items.values();
let errors = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  for (const issue of queue) {
    const row = await inspect(issue);
    if (row.error) errors++;
    process.stdout.write(JSON.stringify(row) + '\n');
  }
}));
console.error(JSON.stringify({ query, total, listed: items.size, incomplete, errors }));
if (incomplete || items.size !== total || errors) process.exitCode = 1;
