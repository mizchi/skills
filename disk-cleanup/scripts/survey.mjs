#!/usr/bin/env node
// Read-only macOS/Linux survey. No recursive scan unless paths are supplied.
import { lstat, stat, statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const MAX_TARGETS = 8;

function validateTimeout(value) {
  if (!Number.isInteger(value) || value < 100 || value > 10000) {
    throw new Error('timeout must be an integer between 100 and 10000 ms');
  }
}

export function parseArgs(args) {
  const paths = [];
  let timeoutMs = 2000;
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!literal && arg === '--') literal = true;
    else if (!literal && arg === '--timeout-ms') timeoutMs = Number(args[++i]);
    else if (!literal && arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else paths.push(arg);
  }
  validateTimeout(timeoutMs);
  return { paths, timeoutMs };
}

export async function measureDirectory(input, { timeoutMs = 2000, execute = executeFile } = {}) {
  validateTimeout(timeoutMs);
  const path = resolve(input);
  const row = { path, status: 'error', allocated_bytes: null };
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) return { ...row, status: 'symlink' };
    if (!metadata.isDirectory()) return { ...row, status: 'not-directory' };
    const { stdout } = await execute('du', ['-s', '-k', '-x', path], {
      encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
    });
    const match = /^(\d+)\s/.exec(stdout);
    const bytes = match ? Number(match[1]) * 1024 : NaN;
    if (!Number.isSafeInteger(bytes)) throw new Error('Invalid du output');
    return { ...row, status: 'measured', allocated_bytes: bytes };
  } catch (error) {
    const timedOut = error.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
    const status = timedOut ? 'timeout' : error.code === 'ENOENT' && error.syscall === 'lstat' ? 'missing' : 'error';
    return { ...row, status, error: String(error.code ?? error.message) };
  }
}

async function volumes(paths) {
  const byDevice = new Map();
  const errors = [];
  for (const path of [...new Set(['/', homedir(), ...paths])]) {
    try {
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) continue;
      const [device, fs] = await Promise.all([stat(path), statfs(path, { bigint: true })]);
      if (byDevice.has(device.dev)) {
        byDevice.get(device.dev).paths.push(path);
        continue;
      }
      byDevice.set(device.dev, {
        device: device.dev, paths: [path],
        capacity_bytes: Number(fs.blocks * fs.bsize),
        available_bytes: Number(fs.bavail * fs.bsize),
      });
    } catch (error) { errors.push({ path, error: String(error.code ?? error.message) }); }
  }
  return { volumes: [...byDevice.values()], volume_errors: errors };
}

export async function survey(paths, { timeoutMs = 2000, execute = executeFile } = {}) {
  validateTimeout(timeoutMs);
  const targets = [...new Set(paths.map(path => resolve(path)))];
  if (targets.length > MAX_TARGETS) throw new Error(`Measure at most ${MAX_TARGETS} paths per pass`);
  const report = { schema_version: 1, ...(await volumes(targets)), directories: [] };
  // Two independent scans at a time. Default maximum: four pairs × 2 seconds.
  for (let i = 0; i < targets.length; i += 2) {
    report.directories.push(...await Promise.all(targets.slice(i, i + 2).map(path =>
      measureDirectory(path, { timeoutMs, execute }))));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') {
      console.log('Usage: node survey.mjs [--timeout-ms 100..10000] [--] [PATH ...]\nNo paths: volume metadata only. At most eight explicit paths; two du processes at a time.');
    } else {
      const { paths, timeoutMs } = parseArgs(process.argv.slice(2));
      const report = await survey(paths, { timeoutMs });
      console.log(JSON.stringify(report, null, 2));
      if (report.directories.some(row => row.status !== 'measured') || report.volume_errors.length) process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
