import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assessTextRecord,
  materializeReview,
  selectReview,
  translationManifest,
} from './skill-review.mjs';
import { assessSemantic } from './skill-freshness.mjs';
const { prepareDocuments, parseDocumentReport } = await import(
  new URL('./documents.js', import.meta.resolve('jev-lint'))
);
const repository = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('./cli.js', import.meta.resolve('jev-lint')));
const json = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha = (value) => {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) {
    throw new Error('Expected a full commit SHA');
  }
  return value;
};
const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();

export function eventRefs(root, event, name, repositoryName) {
  const head = sha(
    name === 'pull_request_target'
      ? event.pull_request?.head?.sha
      : event.after ?? event.workflow_dispatch?.sha ?? process.env.GITHUB_SHA,
  );
  if (name === 'pull_request_target') {
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(repositoryName ?? '') ||
      !Number.isSafeInteger(event.number) || event.number < 1
    ) throw new Error('Invalid PR identity');
    // Fetch objects only. Never checkout the proposed tree or run its scripts.
    git(root, [
      'fetch',
      '--no-tags',
      `https://github.com/${repositoryName}.git`,
      `refs/pull/${event.number}/head`,
    ]);
    if (git(root, ['rev-parse', 'FETCH_HEAD']) !== head) {
      throw new Error('PR changed while the review was starting');
    }
    const base = git(root, [
      'merge-base',
      sha(event.pull_request.base.sha),
      head,
    ]);
    return { base, head };
  }
  if (name === 'push') {
    return {
      base: event.before && !/^0+$/.test(event.before)
        ? sha(event.before)
        : undefined,
      head,
    };
  }
  if (name === 'workflow_dispatch') return { head, all: true };
  throw new Error('Unsupported review event');
}

export async function runReview(
  {
    root = repository,
    base,
    head,
    all = false,
    plan = false,
    run = spawnSync,
  } = {},
) {
  const directory = resolve(root, '.cache/skill-review/current');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const report = {
    schemaVersion: 1,
    status: 'failed',
    exitCode: 3,
    errors: [],
  };
  try {
    const selected = selectReview(root, { base, head, all });
    report.selection = selected;
    const workspace = join(directory, 'source');
    mkdirSync(workspace);
    materializeReview(root, selected, workspace);
    if (!selected.files.length) {
      Object.assign(report, {
        status: 'not-applicable',
        exitCode: 0,
        note:
          'No surviving skill document was selected; deletions remain in selection.deleted.',
      });
      return report;
    }
    // Configuration, rules and dependencies always come from this trusted checkout.
    cpSync(join(root, '.jev-lint.yaml'), join(workspace, '.jev-lint.yaml'));
    cpSync(join(root, '.jev-lint/rules'), join(workspace, '.jev-lint/rules'), {
      recursive: true,
    });
    // Rules read context documents such as authoring-contract.md and
    // description-trigger-contract.md; copy every one so a new document cannot
    // break the review with "context document not found".
    for (const name of readdirSync(join(root, '.jev-lint'))) {
      if (!name.endsWith('.md')) continue;
      cpSync(join(root, '.jev-lint', name), join(workspace, '.jev-lint', name));
    }
    const invoke = (args) => {
      const r = run(process.execPath, [cli, ...args], {
        cwd: workspace,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 600_000,
      });
      if (r.error || ![0, 1, 3].includes(r.status)) {
        throw new Error('jev-lint command failed before a complete review');
      }
      return r;
    };
    const planned = invoke([
      'check',
      ...selected.files,
      '--cache',
      'none',
      '--dry-run',
      '--show-subjects',
      '--format',
      'json',
    ]);
    if (planned.status !== 0) throw new Error('Text review planning failed');
    const textPlan = JSON.parse(planned.stdout);
    json(join(directory, 'text-plan.json'), textPlan);
    if (
      !textPlan.subjectList?.length || selected.files.some((path) =>
        !textPlan.subjectList.some((s) =>
          s.file === path
        )
      ) ||
      textPlan.ignored?.subjects || textPlan.undeclared?.length
    ) throw new Error('Incomplete text review plan');
    report.text = {
      subjects: textPlan.subjects,
      files: selected.files.length,
      exitCode: 0,
    };
    const manifest = translationManifest(selected.files);
    const manifestFile = join(directory, 'translations.manifest.json');
    json(manifestFile, manifest);
    const input = manifest.comparisons.length
      ? prepareDocuments(manifest, { cwd: workspace })
      : null;
    if (
      input &&
      (input.issues.length || input.deferred.length ||
        input.unboundDocuments.length)
    ) throw new Error('Incomplete translation plan');
    report.translations = {
      expected: input?.expectedComparisons ?? 0,
      exitCode: 0,
    };
    if (plan) {
      Object.assign(report, { status: 'planned', exitCode: 0 });
      return report;
    }
    if (!(process.env.TYPESAFE_API_KEY || process.env.TYPESAFEAI_API_KEY)) {
      throw new Error('TYPESAFE_API_KEY is required for live skill review');
    }
    const recordFile = join(directory, 'text.jev.json');
    const checked = invoke([
      'check',
      ...selected.files,
      '--cache',
      'none',
      '--retry',
      '3',
      '--record',
      recordFile,
      '--format',
      'json',
    ]);
    const record = JSON.parse(readFileSync(recordFile, 'utf8'));
    const expected = textPlan.subjectList.map((s) => ({
      ...s,
      ruleKey: `text/${s.rule}`,
    }));
    const complete = assessTextRecord(record, expected);
    report.text.exitCode = complete === 3 ? 3 : checked.status;
    if (input) {
      const recordFile = join(directory, 'translations.jev.json');
      const checked = invoke([
        'docs',
        '--document-manifest',
        manifestFile,
        '--record',
        recordFile,
        '--json',
      ]);
      const translated = parseDocumentReport(
        JSON.parse(readFileSync(recordFile, 'utf8')),
        input,
      );
      report.translations = {
        coverage: translated.coverage,
        exitCode: checked.status === 3 ? 3 : assessSemantic(translated),
      };
    }
    report.exitCode =
      [report.text.exitCode, report.translations.exitCode].includes(3)
        ? 3
        : [report.text.exitCode, report.translations.exitCode].includes(1)
        ? 1
        : 0;
    report.status = report.exitCode === 3
      ? 'failed'
      : report.exitCode === 1
      ? 'review-required'
      : 'complete';
  } catch (error) {
    report.errors.push(error.message);
    report.status = 'failed';
    report.exitCode = 3;
  } finally {
    json(join(directory, 'report.json'), report);
  }
  return report;
}

if (
  process.argv[1] && existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const arg = args.shift();
      if (arg === '--base') options.base = args.shift();
      else if (arg === '--head') options.head = args.shift();
      else if (arg === '--all') options.all = true;
      else if (arg === '--dry-run') options.plan = true;
      else if (arg === '--event-file') {
        Object.assign(
          options,
          eventRefs(
            repository,
            JSON.parse(readFileSync(args.shift(), 'utf8')),
            process.env.GITHUB_EVENT_NAME,
            process.env.GITHUB_REPOSITORY,
          ),
        );
      } else throw new Error(`Unknown argument: ${arg}`);
    }
    options.head ??= git(repository, ['rev-parse', 'HEAD']);
    const report = await runReview(options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 3;
  }
}
