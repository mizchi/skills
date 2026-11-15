import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const sha = (value) => {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error('Expected a full commit SHA');
  }
  return value;
};
const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
const isSkill = (path) => /^[a-z0-9-]+\/SKILL(?:-ja)?\.md$/.test(path);
export function selectReview(root, { base, head, all = false }) {
  sha(head);
  if (base) sha(base);
  const tree = new Map(
    git(root, ['ls-tree', '-rz', '--full-tree', head]).split('\0').filter(
      Boolean,
    ).map((entry) => {
      const [metadata, path] = entry.split('\t');
      return [path, metadata.split(' ')];
    }),
  );
  const changed = all || !base
    ? [...tree.keys()]
    : git(root, ['diff', '--no-renames', '--name-only', '-z', base, head, '--'])
      .split('\0').filter(Boolean);
  const full = all || !base ||
    changed.some((p) =>
      /^(?:scripts\/(?:.*skill.*|lint-translations\.mjs)|\.jev-lint(?:\/|\.yaml)|package\.json|pnpm-lock\.yaml|\.github\/workflows\/skill-review\.yml)/
        .test(p)
    );
  const skills = [
    ...new Set(
      (full
        ? [...tree.keys()].filter(isSkill)
        : changed.filter((p) =>
          tree.has(`${p.split('/')[0]}/SKILL.md`) || isSkill(p)
        )).map((p) => p.split('/')[0]),
    ),
  ].sort();
  const files = skills.flatMap((name) =>
    [`${name}/SKILL.md`, `${name}/SKILL-ja.md`].filter((p) => tree.has(p))
  ).sort();
  for (const name of skills) {
    if (tree.has(`${name}/SKILL-ja.md`) && !tree.has(`${name}/SKILL.md`)) {
      throw new Error(`Missing canonical source: ${name}`);
    }
  }
  for (const path of files) {
    if (
      !['100644', '100755'].includes(tree.get(path)[0]) ||
      tree.get(path)[1] !== 'blob'
    ) throw new Error(`SKILL must be a regular file: ${path}`);
  }
  return {
    base,
    head,
    full,
    skills: skills.filter((name) =>
      files.some((p) => p.startsWith(`${name}/`))
    ),
    files,
    deleted: changed.filter((p) => isSkill(p) && !tree.has(p)),
    changed,
  };
}

export function materializeReview(root, review, directory) {
  for (const path of review.files) {
    if (!isSkill(path)) throw new Error('Only skill text can be materialized');
    const text = git(root, ['show', `${sha(review.head)}:${path}`]);
    if (Buffer.byteLength(text) > 128 * 1024 || text.includes('\0')) {
      throw new Error(`Invalid or oversized skill: ${path}`);
    }
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return review.files;
}

export function translationManifest(files) {
  const manifest = {
    schema: 'jev-lint-documents-manifest-1',
    roots: [],
    files: {},
    comparisons: [],
  };
  for (const path of files.filter((p) => p.endsWith('/SKILL-ja.md'))) {
    const name = path.split('/')[0], canonical = `${name}/SKILL.md`;
    if (!files.includes(canonical)) {
      throw new Error(`Missing canonical source: ${name}`);
    }
    const en = `${name}-en`, ja = `${name}-ja`;
    manifest.files[en] = { path: canonical, role: 'reference' };
    manifest.files[ja] = { path, role: 'document' };
    manifest.roots.push(canonical, path);
    manifest.comparisons.push({
      id: name,
      topic:
        'Skill workflow, authorization requirements, and declared tool behavior',
      mode: 'translation',
      reference: { source: en },
      target: { source: ja },
    }, {
      id: `${name}-activation`,
      topic:
        'Advertised capabilities and activation conditions, including explicit-only versus automatic invocation',
      mode: 'translation',
      reference: { source: en, contains: `name: ${name}` },
      target: { source: ja, contains: `name: ${name}` },
      context: [{ source: en }, { source: ja }],
    });
  }
  return manifest;
}

export function assessTextRecord(record, expected) {
  const key = (a) => JSON.stringify([a.file, a.ruleKey, a.line, a.endLine]);
  if (
    record?.schema !== 'jev-lint-run-1' || !Array.isArray(record.answers) ||
    !expected.length || record.answers.length !== expected.length
  ) return 3;
  const answers = new Map(record.answers.map((a) => [key(a), a]));
  if (answers.size !== expected.length) return 3;
  return expected.every((a) => {
      const value = answers.get(key(a))?.value;
      return Number.isFinite(value) && value >= 0 && value <= 1;
    })
    ? 0
    : 3;
}
