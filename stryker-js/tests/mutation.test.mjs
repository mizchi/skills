import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { collectGitChanges, planMutation } from "../assets/scripts/mutation-plan.mjs";
import { summarizeMutationReport } from "../assets/scripts/mutation-summary.mjs";

const patterns = [
  "src/**/*.{ts,tsx,js}",
  "!src/**/*.{test,spec}.{ts,tsx,js}",
  "!src/**/__tests__/**",
  "!src/**/*.d.ts",
];
const modified = (path, patch = "@@ -3 +3 @@\n-old\n+new\n") => ({
  path,
  status: "modified",
  patch,
});
const cli = fileURLToPath(new URL("../assets/scripts/mutation-changed.mjs", import.meta.url));

test("select only new-side lines, preserving separate hunks", () => {
  assert.deepEqual(
    planMutation([modified("src/fee.ts", "@@ -3 +3 @@\n-old\n+new\n@@ -8,2 +8,3 @@\n")], patterns)
      .mutate,
    ["src/fee.ts:3-3", "src/fee.ts:8-10"],
  );
});

test("a deletion or missing line range selects only the changed file", () => {
  for (const patch of [
    "@@ -3,2 +3 @@\n",
    "@@ -3 +2,0 @@\n",
    "old mode 100644\nnew mode 100755\n",
  ]) {
    assert.deepEqual(planMutation([modified("src/fee.ts", patch)], patterns).mutate, [
      "src/fee.ts",
    ]);
  }
});

test("added source is a whole file; deleted source, excluded tests and declarations are skipped", () => {
  const changes = [
    { path: "src/new.tsx", status: "added", patch: "" },
    { path: "src/old.ts", status: "deleted", patch: "" },
    modified("src/fee.test.ts"),
    modified("src/types.d.ts"),
    modified("README.md"),
  ];
  assert.deepEqual(planMutation(changes, patterns, { diffOnly: true }).mutate, ["src/new.tsx"]);
});

test("diff-only never expands to all source on test/config/dependency changes", () => {
  const changes = [modified("src/fee.ts"), modified("tests/fee.test.ts"), modified("package.json")];
  assert.deepEqual(planMutation(changes, patterns, { diffOnly: true }).mutate, ["src/fee.ts:3-3"]);
  assert.equal(planMutation(changes.slice(1), patterns, { diffOnly: true }).scope, "none");
  assert.equal(planMutation(changes, patterns).scope, "all");
  assert.deepEqual(planMutation(changes, patterns).mutate, patterns);
});

test("colocated tests and Vitest/TypeScript configs trigger local reevaluation", () => {
  for (const path of [
    "src/fee.spec.ts",
    "src/__tests__/fee.ts",
    "test/fee.ts",
    "vitest.config.mts",
    "vite.config.ts",
    "tsconfig.test.json",
    "pnpm-lock.yaml",
    "stryker.config.json",
  ]) {
    assert.equal(planMutation([modified(path)], patterns).scope, "all", path);
    assert.equal(planMutation([modified(path)], patterns, { diffOnly: true }).scope, "none", path);
  }
});

test("literal spaces, Unicode and commas survive; glob/range-like filenames fail", () => {
  assert.deepEqual(planMutation([modified("src/送料, fee.ts")], patterns).mutate, [
    "src/送料, fee.ts:3-3",
  ]);
  for (const path of ["src/a[1].ts", "src/a*.ts", "src/a:3.ts", "src/a\\b.ts", "src/a\nb.ts"]) {
    assert.throws(() => planMutation([modified(path)], ["src/**"]), /literal|glob|range/i);
  }
});

test("empty or range-based mutation config fails rather than reporting no targets", () => {
  for (const mutate of [
    [],
    ["!src/**"],
    ["src/fee.ts:3-4"],
    ["/src/**"],
    ["../src/**"],
    ["src/**", "!"],
    undefined,
  ]) {
    assert.throws(() => planMutation([], mutate), /mutate|pattern|range/i);
  }
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "skill-stryker-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  const write = (path, text) => writeFileSync(join(directory, path), text);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Skill test fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(directory, "src"));
  write("src/fee.ts", "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");
  write(".gitignore", "ignored.ts\nreports/\n");
  write("stryker.config.json", JSON.stringify({ mutate: patterns }));
  git("add", ".");
  git("commit", "-m", "baseline");
  return { directory, git, write };
}

test("Git combines staged, unstaged and untracked source without ignored files", (t) => {
  const { directory, git, write } = fixture(t);
  write("src/fee.ts", "export const a = 10;\nexport const b = 2;\nexport const c = 3;\n");
  git("add", "src/fee.ts");
  write("src/fee.ts", "export const a = 10;\nexport const b = 2;\nexport const c = 30;\n");
  write("src/送料, fee.ts", "export const fee = 500;\n");
  write("src/ignored.ts", "export const ignored = 0;\n");
  const { changes } = collectGitChanges(directory, undefined, patterns);
  assert.deepEqual(
    new Set(planMutation(changes, patterns).mutate),
    new Set(["src/fee.ts:1-1", "src/fee.ts:3-3", "src/送料, fee.ts"]),
  );
});

test("merge-base excludes changes unique to the base branch", (t) => {
  const { directory, git, write } = fixture(t);
  git("checkout", "-b", "feature");
  write("src/fee.ts", "export const a = 10;\nexport const b = 2;\nexport const c = 3;\n");
  git("commit", "-am", "feature");
  git("checkout", "main");
  write("src/main-only.ts", "export const x = 1;\n");
  git("add", ".");
  git("commit", "-m", "main");
  git("checkout", "feature");
  const result = collectGitChanges(directory, "main", patterns);
  assert.equal(result.comparison, git("merge-base", "HEAD", "main"));
  assert.deepEqual(planMutation(result.changes, patterns).mutate, ["src/fee.ts:1-1"]);
});

test("rename is a deletion and addition; invalid refs fail", (t) => {
  const { directory, git } = fixture(t);
  git("mv", "src/fee.ts", "src/renamed.ts");
  assert.deepEqual(
    planMutation(collectGitChanges(directory, undefined, patterns).changes, patterns).mutate,
    ["src/renamed.ts"],
  );
  assert.throws(() => collectGitChanges(directory, "missing-ref", patterns), /git/i);
});

test("--list is dependency-free, read-only and strict about CI scope", (t) => {
  const { directory, git, write } = fixture(t);
  write("package.json", JSON.stringify({ private: true }));
  write("src/fee.ts", "export const a = 10;\nexport const b = 2;\nexport const c = 3;\n");
  const before = git("status", "--porcelain");
  const result = spawnSync(process.execPath, [cli, "--diff-only", "--list"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).mutate, ["src/fee.ts:1-1"]);
  assert.equal(git("status", "--porcelain"), before);
  assert.equal(existsSync(join(directory, "reports")), false);
});

test("no-target run writes a skip plan and removes stale changed reports without importing Stryker", (t) => {
  const { directory } = fixture(t);
  mkdirSync(join(directory, "reports/mutation"), { recursive: true });
  writeFileSync(join(directory, "reports/mutation/changed.json"), "stale");
  writeFileSync(join(directory, "reports/mutation/changed.html"), "stale");
  const result = spawnSync(process.execPath, [cli, "--diff-only"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "reports/mutation/changed-plan.json"))).scope,
    "none",
  );
  assert.equal(existsSync(join(directory, "reports/mutation/changed.json")), false);
  assert.equal(existsSync(join(directory, "reports/mutation/changed.html")), false);
});

test("CLI rejects unknown flags and invalid bases with nonzero exit", (t) => {
  const { directory } = fixture(t);
  for (const args of [["--unknown"], ["--base", "missing-ref", "--list"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.notEqual(result.stderr, "");
  }
});

test("a failed comparison clears old changed reports and plan", (t) => {
  const { directory } = fixture(t);
  mkdirSync(join(directory, "reports/mutation"), { recursive: true });
  for (const name of ["changed-plan.json", "changed.json", "changed.html"])
    writeFileSync(join(directory, "reports/mutation", name), "stale");
  const result = spawnSync(process.execPath, [cli, "--base", "missing-ref", "--diff-only"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  for (const name of ["changed-plan.json", "changed.json", "changed.html"])
    assert.equal(existsSync(join(directory, "reports/mutation", name)), false);
});

const mutant = (status, id = status) => ({
  id,
  status,
  mutatorName: "EqualityOperator",
  replacement: "a > b",
  location: { start: { line: 2, column: 4 }, end: { line: 2, column: 10 } },
  coveredBy: ["t1"],
});
const report = (mutants) => ({
  files: {
    "src/fee.ts": { source: "export function fee(a, b) {\n  return a >= b;\n}\n", mutants },
  },
  testFiles: {
    "tests/fee.test.ts": {
      tests: [{ id: "t1", name: "equal amounts", location: { start: { line: 3, column: 0 } } }],
    },
  },
});

test("summary uses Stryker's detected/valid metric and reports excluded/error/pending states", () => {
  const summary = summarizeMutationReport(
    report(
      [
        "Killed",
        "Timeout",
        "Survived",
        "NoCoverage",
        "CompileError",
        "RuntimeError",
        "Ignored",
        "Pending",
      ].map((s) => mutant(s)),
    ),
  );
  assert.equal(summary.total, 8);
  assert.equal(summary.valid, 4);
  assert.equal(summary.detected, 2);
  assert.equal(summary.mutationScore, 50);
  assert.equal(summary.complete, false);
  assert.equal(summary.counts.CompileError, 1);
  assert.equal(summary.counts.RuntimeError, 1);
  assert.equal(summary.counts.Ignored, 1);
  assert.deepEqual(
    summary.findings.map((f) => f.status),
    ["Timeout", "Survived", "NoCoverage", "CompileError", "RuntimeError", "Pending"],
  );
});

test("summary exposes source, replacement, location and covering tests for AI review", () => {
  const summary = summarizeMutationReport(report([mutant("Survived")]));
  const finding = summary.findings[0];
  assert.equal(finding.file, "src/fee.ts");
  assert.equal(finding.line, 2);
  assert.equal(finding.source, "  return a >= b;");
  assert.equal(finding.replacement, "a > b");
  assert.equal(finding.coveredBy[0].name, "equal amounts");
  assert.equal(finding.coveredBy[0].file, "tests/fee.test.ts");
});

test("no valid mutants is unmeasured; malformed reports fail", () => {
  for (const mutants of [[], [mutant("Ignored")], [mutant("CompileError")]]) {
    assert.equal(summarizeMutationReport(report(mutants)).mutationScore, null);
  }
  for (const invalid of [
    {},
    { files: [] },
    { files: { x: {} } },
    report([mutant("NewUnknownStatus")]),
  ]) {
    assert.throws(() => summarizeMutationReport(invalid), /report|mutant|status/i);
  }
});
