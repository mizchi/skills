import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { measureDirectory, survey, parseArgs } from './survey.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./survey.mjs', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'disk-cleanup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('the first pass reports volume availability without starting du', async () => {
  const report = await survey([], { execute: () => assert.fail('unexpected recursive scan') });
  assert.deepEqual(report.directories, []);
  assert.ok(report.volumes.length > 0);
  for (const volume of report.volumes) {
    assert.ok(volume.available_bytes >= 0);
    assert.ok(volume.capacity_bytes >= volume.available_bytes);
  }
});

test('measurement is read-only and shell metacharacters are literal paths', async t => {
  const root = await fixture(t);
  const path = join(root, 'space;$(touch marker)');
  await mkdir(path);
  await writeFile(join(path, 'source.txt'), 'keep this source');
  const result = await measureDirectory(path);
  assert.equal(result.status, 'measured');
  assert.ok(Number.isSafeInteger(result.allocated_bytes));
  assert.equal(await readFile(join(path, 'source.txt'), 'utf8'), 'keep this source');
  await assert.rejects(access(join(root, 'marker')));
});

test('symlinks and missing paths never start a recursive scan', async t => {
  const root = await fixture(t);
  const link = join(root, 'link');
  await symlink(root, link);
  const options = { execute: () => assert.fail('unexpected du') };
  assert.equal((await measureDirectory(link, options)).status, 'symlink');
  assert.equal((await measureDirectory(join(root, 'missing'), options)).status, 'missing');
});

test('partial output on permission errors is not reported as a complete size', async t => {
  const root = await fixture(t);
  const result = await measureDirectory(root, {
    execute: async () => { throw Object.assign(new Error('permission denied'), { code: 1, stdout: `12\t${root}\n` }); },
  });
  assert.equal(result.status, 'error');
  assert.equal(result.allocated_bytes, null);
});

test('a process killed for excessive diagnostics is an error, not a timeout', async t => {
  const root = await fixture(t);
  const result = await measureDirectory(root, {
    execute: async () => { throw Object.assign(new Error('maxBuffer exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true }); },
  });
  assert.equal(result.status, 'error');
  assert.equal(result.allocated_bytes, null);
});

test('a real stalled subprocess is killed and reported as unknown size', async t => {
  const root = await fixture(t);
  const started = Date.now();
  const result = await measureDirectory(root, {
    timeoutMs: 100,
    execute: (_file, _args, options) => execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options),
  });
  assert.equal(result.status, 'timeout');
  assert.equal(result.allocated_bytes, null);
  assert.ok(Date.now() - started < 3000);
});

test('bounded measurements preserve order and deduplicate repeated targets', async t => {
  const root = await fixture(t);
  const paths = await Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const path = join(root, String(i));
    await mkdir(path);
    return path;
  }));
  let busy = 0;
  let peak = 0;
  const report = await survey([...paths, paths[0]], {
    execute: async (_file, args) => {
      peak = Math.max(peak, ++busy);
      await new Promise(resolve => setTimeout(resolve, 10));
      busy--;
      return { stdout: `4\t${args.at(-1)}\n` };
    },
  });
  assert.deepEqual(report.directories.map(row => row.path), paths);
  assert.ok(peak <= 2);
  assert.ok(report.directories.every(row => row.allocated_bytes === 4096));
});

test('invalid output and oversized requests fail without false zero sizes', async t => {
  const root = await fixture(t);
  const result = await measureDirectory(root, { execute: async () => ({ stdout: 'not a measurement' }) });
  assert.equal(result.status, 'error');
  assert.equal(result.allocated_bytes, null);
  await assert.rejects(survey(Array.from({ length: 9 }, (_, i) => join(root, String(i)))), /8/);
  assert.throws(() => parseArgs(['--timeout-ms', '0']), /timeout/);
  assert.throws(() => parseArgs(['--apply']), /Unknown/);
  assert.deepEqual(parseArgs(['--timeout-ms', '250', '--', '-literal']), { paths: ['-literal'], timeoutMs: 250 });
});

test('CLI keeps a literal --help path after the option delimiter', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '--help'));
  const { stdout } = await execute(process.execPath, [script, '--', '--help'], { cwd: root });
  const report = JSON.parse(stdout);
  assert.equal(await realpath(report.directories[0].path), await realpath(join(root, '--help')));
  assert.equal(report.directories[0].status, 'measured');
});

test('CLI emits incomplete JSON and exit 2 for a missing target', async t => {
  const root = await fixture(t);
  await assert.rejects(execute(process.execPath, [script, join(root, 'missing')]), error => {
    assert.equal(error.code, 2);
    const report = JSON.parse(error.stdout);
    assert.equal(report.directories[0].status, 'missing');
    assert.equal(report.directories[0].allocated_bytes, null);
    return true;
  });
});
