#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function normalizeAudit(raw) {
  if (!object(raw) || raw.error) throw new Error('Audit failed or returned an unknown report');
  const counts = raw.metadata?.vulnerabilities;
  if (!object(counts) || severities.some((s) => !Number.isSafeInteger(counts[s]) || counts[s] < 0)) {
    throw new Error('Audit report has no complete, numeric vulnerability counts');
  }
  const advisories = [];
  let source;
  if (object(raw.advisories)) {
    source = 'pnpm-advisories';
    for (const entry of Object.values(raw.advisories)) {
      if (!object(entry) || typeof entry.module_name !== 'string' || !severities.includes(entry.severity)) {
        throw new Error('Malformed pnpm advisory');
      }
      advisories.push({ name: entry.module_name, severity: entry.severity,
        title: entry.title ?? null, url: entry.url ?? null, range: entry.vulnerable_versions ?? null });
    }
  } else if (object(raw.vulnerabilities)) {
    source = 'npm-vulnerabilities';
    for (const [name, entry] of Object.entries(raw.vulnerabilities)) {
      if (!object(entry) || !severities.includes(entry.severity) || !Array.isArray(entry.via)) {
        throw new Error('Malformed npm vulnerability');
      }
      for (const via of entry.via.length ? entry.via : [name]) {
        if (typeof via !== 'string' && !object(via)) throw new Error('Malformed advisory dependency');
        advisories.push({ name, severity: entry.severity, isDirect: entry.isDirect ?? null,
          title: typeof via === 'string' ? null : via.title ?? null,
          url: typeof via === 'string' ? null : via.url ?? null,
          range: entry.range ?? null, via: typeof via === 'string' ? via : via.name ?? name });
      }
    }
  } else {
    throw new Error('Unknown audit schema; expected advisories or vulnerabilities');
  }
  return { schemaVersion: 1, source,
    counts: Object.fromEntries(severities.map((s) => [s, counts[s]])), advisories };
}

export function collectAudit(root, { prod = false, run = spawnSync } = {}) {
  const result = run('pnpm', ['audit', '--json', ...(prod ? ['--prod'] : [])], {
    cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('pnpm audit could not complete; no clean result is available');
  }
  return normalizeAudit(JSON.parse(result.stdout));
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    let root = process.cwd(), input, prod = false;
    while (args.length) {
      const arg = args.shift();
      if (arg === '--repo') root = args.shift();
      else if (arg === '--input') input = args.shift();
      else if (arg === '--prod') prod = true;
      else throw new Error(`Unknown argument: ${arg}`);
      if (!root || (arg === '--input' && !input)) throw new Error('Missing argument value');
    }
    const result = input ? normalizeAudit(JSON.parse(readFileSync(input, 'utf8'))) : collectAudit(root, { prod });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = Object.values(result.counts).some((n) => n > 0) ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 3;
  }
}
