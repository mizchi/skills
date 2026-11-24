import { test } from "node:test";
import assert from "node:assert/strict";
import { flagValue } from "../src/args.ts";
import { buildJudgePrompt, parseJudgeResponse } from "../src/graders.ts";
import { assessConvergence, classifyUnclear, trailingZeroStreak } from "../src/ledger.ts";
import type { Ledger, LedgerIteration } from "../src/ledger.ts";
import { rankVariants, summarizeResults } from "../src/compare.ts";
import { buildTrialPrompt } from "../src/run.ts";
import { SELF_REPORT_REQUEST } from "../src/self-report.ts";
import { stats } from "../src/output.ts";
import { rewriteDeclarationSpecifiers } from "../scripts/rewrite-dts.ts";
import type { TaskResult } from "../src/types.ts";

test("flagValue reads the value after a flag", () => {
  assert.equal(flagValue(["x.yaml", "--task", "t1", "--baseline"], "--task"), "t1");
  assert.equal(flagValue(["x.yaml"], "--task"), undefined);
});

test("buildTrialPrompt injects the skill only with_skill and appends the self-report request", () => {
  const withSkill = buildTrialPrompt({ skill: "echo", skillBody: "BODY", taskPrompt: "hello", withSkill: true, requireSelfReport: true });
  assert.match(withSkill, /# 対象 skill: echo/);
  assert.ok(withSkill.includes("BODY"));
  assert.ok(withSkill.includes("hello"));
  assert.ok(withSkill.endsWith(SELF_REPORT_REQUEST));
  const baseline = buildTrialPrompt({ skill: "echo", skillBody: "BODY", taskPrompt: "hello", withSkill: false, requireSelfReport: false });
  assert.ok(!baseline.includes("BODY"));
  assert.ok(!baseline.includes("Self-report"));
});

test("judge prompt carries output and rubric; responses parse to pass, score and reason", () => {
  const prompt = buildJudgePrompt("THE OUTPUT", "THE RUBRIC");
  assert.ok(prompt.includes("THE OUTPUT") && prompt.includes("THE RUBRIC"));
  assert.deepEqual(parseJudgeResponse("PASS: yes\nSCORE: 85\nREASON: fine"), { pass: true, score: 0.85, reason: "fine" });
  assert.deepEqual(parseJudgeResponse("PASS: no\nREASON: missing"), { pass: false, score: 0, reason: "missing" });
  assert.deepEqual(parseJudgeResponse("pass: YES"), { pass: true, score: 1, reason: "" });
});

function iteration(iter: number, newUnclear: number): LedgerIteration {
  return {
    iter,
    timestamp: "2026-01-01T00:00:00.000Z",
    overall_pass_rate: 1,
    new_unclear_count: newUnclear,
    reseen_count: 0,
    total_unclear: newUnclear,
    new_rules: [],
    reseen_rules: [],
  };
}

test("convergence needs two trailing zero-unclear iterations; divergence needs three non-decreasing", () => {
  assert.equal(trailingZeroStreak([iteration(1, 2), iteration(2, 0), iteration(3, 0)]), 2);
  assert.equal(assessConvergence([iteration(1, 1), iteration(2, 0)]), undefined);
  assert.equal(assessConvergence([iteration(1, 1), iteration(2, 0), iteration(3, 0)]), "converged");
  assert.equal(assessConvergence([iteration(1, 1), iteration(2, 1), iteration(3, 2)]), "diverged");
  assert.equal(assessConvergence([iteration(1, 3), iteration(2, 2), iteration(3, 1)]), undefined);
  // empirical-prompt-tuning: divergence means new unclear points never decreased.
  assert.equal(assessConvergence([iteration(1, 1), iteration(2, 3), iteration(3, 2)]), undefined);
  assert.equal(assessConvergence([iteration(1, 1), iteration(2, 1), iteration(3, 1)]), "diverged");
});

test("classifyUnclear separates new rules from rules already in the ledger, case-insensitively", () => {
  const ledger: Ledger = {
    eval: "e",
    skill: "s",
    patterns: [{ rule: "State offline constraints", seen_in: [1], representative_issue: "x" }],
    iterations: [],
  };
  const r = classifyUnclear(ledger, 2, [
    { issue: "a", cause: "b", rule: "state offline constraints" },
    { issue: "c", cause: "d", rule: "Name the output path" },
  ]);
  assert.deepEqual(r, { newRules: ["Name the output path"], reseenRules: ["state offline constraints"] });
  assert.deepEqual(ledger.patterns[0].seen_in, [1, 2]);
  assert.equal(ledger.patterns.length, 2);
});

function result(passRate: number, unclear: number, durationMs: number): TaskResult {
  return {
    taskId: "t",
    taskName: "t",
    passRate,
    durationMs,
    trials: [{
      trial: 1,
      output: "",
      graders: [],
      passRate,
      durationMs,
      selfReport: {
        phaseTrace: [],
        unclearPoints: Array.from({ length: unclear }, () => ({ issue: "i", cause: "c", rule: "r" })),
        discretionaryFillIns: [],
        retries: 0,
        raw: "",
      },
    }],
  };
}

test("summaries, stats and variant ranking (accuracy, then unclear, then duration)", () => {
  const s = summarizeResults([result(1, 0, 100), result(0.5, 2, 300)]);
  assert.deepEqual(s, { pass: 1, total: 2, acc: 0.75, unclear: 2, meanDur: 200 });
  assert.deepEqual(stats([result(1, 0, 100), result(0.5, 0, 300)]).pass_rate, { mean: 0.75, stddev: 0.25 });
  const ranked = rankVariants([
    { label: "base", skill: "a", s: { pass: 1, total: 1, acc: 0.9, unclear: 0, meanDur: 10 } },
    { label: "candidate", skill: "b", s: { pass: 1, total: 1, acc: 0.9, unclear: 0, meanDur: 5 } },
  ]);
  assert.equal(ranked[0].label, "candidate");
});

test("declaration specifiers are rewritten from .ts to .js for older TypeScript consumers", () => {
  const input = 'export { ExitCode } from "./args.ts";\nexport type { Task } from "./types.ts";\nimport x from "node:path";\nexport { y } from "pkg/file.ts";\n';
  const out = rewriteDeclarationSpecifiers(input);
  assert.ok(out.includes('from "./args.js"') && out.includes('from "./types.js"'));
  assert.ok(out.includes('from "node:path"'));
  assert.ok(out.includes('from "pkg/file.ts"'), "only relative specifiers are rewritten");
});
