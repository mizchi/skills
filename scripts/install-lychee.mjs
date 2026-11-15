import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repository = fileURLToPath(new URL('../', import.meta.url));
export const release = JSON.parse(readFileSync(new URL('./lychee-release.json', import.meta.url), 'utf8'));
export const lycheeBinary = join(repository, '.tools', 'lychee', release.version, 'lychee');

export async function installLychee() {
  if (existsSync(lycheeBinary)) {
    const version = execFileSync(lycheeBinary, ['--version'], { encoding: 'utf8' }).trim();
    if (version === `lychee ${release.version}`) return lycheeBinary;
  }
  const asset = release.assets[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`No pinned lychee release for ${process.platform}-${process.arch}`);
  const url = `https://github.com/lycheeverse/lychee/releases/download/lychee-v${release.version}/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(archive).digest('hex');
  if (digest !== asset.sha256) throw new Error(`SHA-256 mismatch for ${asset.name}`);
  const temporary = mkdtempSync(join(tmpdir(), 'skills-lychee-'));
  try {
    const tarball = join(temporary, asset.name);
    writeFileSync(tarball, archive);
    const members = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
    const binary = members.find(path => path === 'lychee' || path.endsWith('/lychee'));
    if (!binary) throw new Error('Verified archive does not contain lychee');
    execFileSync('tar', ['-xzf', tarball, '-C', temporary, binary]);
    mkdirSync(dirname(lycheeBinary), { recursive: true });
    copyFileSync(join(temporary, binary), lycheeBinary);
    chmodSync(lycheeBinary, 0o755);
    const version = execFileSync(lycheeBinary, ['--version'], { encoding: 'utf8' }).trim();
    if (version !== `lychee ${release.version}`) throw new Error(`Unexpected binary version: ${version}`);
    return lycheeBinary;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await installLychee());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
