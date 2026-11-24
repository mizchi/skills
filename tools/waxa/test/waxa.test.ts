import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileRegex,
  extractSelfReport,
  gradeCode,
  gradeOutputContains,
  gradeSelfReport,
  gradeText,
} from "../src/waxa.ts";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");

const SELF_REPORT = [
  "## Self-report",
  "",
  "### Phase trace",
  "- Understanding: OK",
  "- Planning: OK",
  "- Execution: stuck: no network",
  "- Formatting: OK",
  "",
  "### Unclear points",
  "1. Issue: could not fetch",
  "   Cause: no network",
  "   General Fix Rule: state offline constraints",
  "",
  "### Discretionary fill-ins",
  "- assumed defaults",
  "",
  "### Retries",
  "2",
].join("\n");

const CLEAN_REPORT = [
  "## Self-report",
  "### Phase trace",
  "- Understanding: OK",
  "- Planning: OK",
  "- Execution: OK",
  "- Formatting: OK",
  "### Unclear points",
  "(none)",
  "### Discretionary fill-ins",
  "(none)",
  "### Retries",
  "0",
].join("\n");

// ---- unit -----------------------------------------------------------------

test("extractSelfReport parses phases, unclear points, fill-ins and retries", () => {
  const sr = extractSelfReport(`deliverable\n\n${SELF_REPORT}`);
  assert.ok(sr);
  assert.deepEqual(sr.phaseTrace.map((p) => p.status), ["OK", "OK", "stuck", "OK"]);
  assert.equal(sr.phaseTrace[2].reason, "no network");
  assert.deepEqual(sr.unclearPoints, [
    { issue: "could not fetch", cause: "no network", rule: "state offline constraints" },
  ]);
  assert.deepEqual(sr.discretionaryFillIns, ["assumed defaults"]);
  assert.equal(sr.retries, 2);
});

test("extractSelfReport returns null without a block and treats (none) as empty", () => {
  assert.equal(extractSelfReport("just text"), null);
  const sr = extractSelfReport(CLEAN_REPORT);
  assert.ok(sr);
  assert.equal(sr.unclearPoints.length, 0);
  assert.equal(sr.discretionaryFillIns.length, 0);
});

test("compileRegex accepts inline (?is) flags", () => {
  assert.ok(compileRegex("(?is)alpha.*BETA").test("ALPHA\nbeta"));
  assert.ok(!compileRegex("alpha.*BETA").test("ALPHA\nbeta"));
});

test("text, code, self-report and output_contains graders", () => {
  const out = "ECHO: hi\n" + CLEAN_REPORT;
  assert.ok(gradeText({ name: "t", type: "text", config: { regex_match: ["^ECHO: "] } }, out).pass);
  assert.ok(!gradeText({ name: "t", type: "text", config: { regex_not_match: ["ECHO"] } }, out).pass);
  assert.ok(gradeCode({ name: "c", type: "code", config: { assertions: ["len(output) > 3", "'ECHO' in output"] } }, out).pass);
  assert.ok(!gradeCode({ name: "c", type: "code", config: { assertions: ["output.length < 3"] } }, out).pass);
  assert.ok(gradeSelfReport({ name: "s", type: "self-report", config: { require_all_phases_ok: true, max_unclear: 0 } }, extractSelfReport(out)).pass);
  assert.ok(!gradeSelfReport({ name: "s", type: "self-report", config: {} }, null).pass);
  assert.equal(gradeOutputContains(["ECHO: hi", "missing"], out).score, 0.5);
});

// ---- end to end with a fake `claude` -------------------------------------

function fixture(opts: { judge?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "waxa-"));
  const skill = join(root, "echo-skill");
  mkdirSync(join(skill, "evals", "tasks"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: echo-skill\ndescription: Use when echoing.\n---\n\nPrefix the input with ECHO: .\n");
  writeFileSync(
    join(skill, "evals", "eval.yaml"),
    [
      "name: echo-skill-eval",
      "skill: echo-skill",
      "config:",
      "  trials_per_task: 2",
      "  timeout_seconds: 20",
      "  model: fake-model",
      "graders:",
      "  - name: prefix",
      "    type: text",
      "    config:",
      "      regex_match: ['^ECHO: ']",
      "tasks:",
      "  - 'tasks/*.yaml'",
      "",
    ].join("\n"),
  );
  const judge = opts.judge
    ? ["  - name: judged", "    type: llm", "    config:", "      rubric: says hello"]
    : [];
  writeFileSync(
    join(skill, "evals", "tasks", "hello.yaml"),
    [
      "id: echo-hello",
      "name: Echo hello",
      "inputs:",
      "  prompt: hello",
      "expected:",
      "  output_contains: ['ECHO: hello']",
      "graders:",
      "  - name: report",
      "    type: self-report",
      "    config:",
      "      require_all_phases_ok: true",
      "      max_unclear: 0",
      ...judge,
      "",
    ].join("\n"),
  );
  const fake = join(root, "fake-claude.mjs");
  const argsLog = join(root, "args.jsonl");
  writeFileSync(
    fake,
    [
      "#!/usr/bin/env node",
      "import { appendFileSync, readFileSync } from 'node:fs';",
      `appendFileSync(${JSON.stringify(argsLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
      "const input = readFileSync(0, 'utf8');",
      "if (input.includes('## rubric')) { process.stdout.write('PASS: yes\\nSCORE: 80\\nREASON: fine\\n'); process.exit(0); }",
      `process.stdout.write('ECHO: hello\\n\\n' + ${JSON.stringify(CLEAN_REPORT)} + '\\n');`,
    ].join("\n"),
  );
  chmodSync(fake, 0o755);
  return { root, skill, evalPath: join(skill, "evals", "eval.yaml"), fake, argsLog };
}

function runCli(args: string[], env: Record<string, string>, cwd?: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
}

test("single run with a fake claude passes, writes outputs and passes executor flags", () => {
  const f = fixture({ judge: true });
  const r = runCli([f.evalPath], { WAXA_CLAUDE_BIN: f.fake });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Overall pass rate \(with skill\): 100\.0%/);
  const iterDir = join(f.root, "results", "echo-skill", "iteration-1");
  assert.ok(existsSync(join(iterDir, "benchmark.json")));
  const out = readFileSync(join(iterDir, "echo-hello", "with_skill", "output-trial-2.txt"), "utf8");
  assert.match(out, /^ECHO: hello/);
  const calls = readFileSync(f.argsLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
  assert.equal(calls.length, 4, "2 executor calls + 2 judge calls");
  for (const args of calls) {
    for (const flag of ["-p", "--no-session-persistence", "--disable-slash-commands", "--system-prompt"]) {
      assert.ok(args.includes(flag), `missing ${flag} in ${args.join(" ")}`);
    }
    assert.equal(args[args.indexOf("--model") + 1], "fake-model");
  }
});

test("a missing claude binary is recorded per trial and fails the run instead of crashing", () => {
  const f = fixture();
  const r = runCli([f.evalPath], { WAXA_CLAUDE_BIN: join(f.root, "does-not-exist") });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = readFileSync(join(f.root, "results", "echo-skill", "iteration-1", "echo-hello", "with_skill", "output-trial-1.txt"), "utf8");
  assert.match(out, /^\[runner-error\]/);
  assert.match(r.stdout, /Overall pass rate/);
});

test("--baseline writes both configs and a delta", () => {
  const f = fixture();
  const r = runCli([f.evalPath, "--baseline"], { WAXA_CLAUDE_BIN: f.fake });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const iterDir = join(f.root, "results", "echo-skill", "iteration-1", "echo-hello");
  assert.deepEqual(readdirSync(iterDir).sort(), ["with_skill", "without_skill"]);
  assert.match(r.stdout, /Delta:/);
});

test("iterate --max 1 records the iteration in ledger.yaml", () => {
  const f = fixture();
  const r = runCli(["iterate", f.evalPath, "--max", "1"], { WAXA_CLAUDE_BIN: f.fake });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ledger = readFileSync(join(f.skill, "evals", "ledger.yaml"), "utf8");
  assert.match(ledger, /iter: 1/);
  assert.match(ledger, /overall_pass_rate: 1/);
});

test("init scaffolds evals/ and audit reports frontmatter problems", () => {
  const dir = mkdtempSync(join(tmpdir(), "waxa-init-"));
  const r = runCli(["init", "--skill", "demo"], {}, dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(dir, "evals", "eval.yaml")));
  assert.ok(existsSync(join(dir, "evals", "tasks", "scenario-typical.yaml")));

  writeFileSync(join(dir, "SKILL.md"), "---\nname: Demo_Skill\n---\nbody\n");
  const a = runCli(["audit", dir, "--no-apm", "--json"], {});
  assert.equal(a.status, 1);
  const rules = (JSON.parse(a.stdout) as { findings: { rule: string }[] }).findings.map((x) => x.rule);
  assert.ok(rules.includes("frontmatter-name-shape"));
  assert.ok(rules.includes("frontmatter-description-missing"));
});

test("legacy layout honours .waxa.yaml paths.skills", () => {
  const f = fixture();
  const root = mkdtempSync(join(tmpdir(), "waxa-legacy-"));
  mkdirSync(join(root, "skills", "echo-skill"), { recursive: true });
  mkdirSync(join(root, "evals", "echo-skill", "tasks"), { recursive: true });
  writeFileSync(join(root, ".waxa.yaml"), "paths:\n  skills: skills/\n  evals: evals/\n");
  writeFileSync(join(root, "skills", "echo-skill", "SKILL.md"), readFileSync(join(f.skill, "SKILL.md")));
  writeFileSync(join(root, "evals", "echo-skill", "eval.yaml"), readFileSync(f.evalPath));
  writeFileSync(join(root, "evals", "echo-skill", "tasks", "hello.yaml"), readFileSync(join(f.skill, "evals", "tasks", "hello.yaml")));
  const r = runCli([join(root, "evals", "echo-skill", "eval.yaml")], { WAXA_CLAUDE_BIN: f.fake });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Skill body: .*skills\/echo-skill\/SKILL\.md/);
});

test("--help exits 0 and no arguments exits 1", () => {
  assert.equal(runCli(["--help"], {}).status, 0);
  assert.equal(runCli([], {}).status, 1);
});
