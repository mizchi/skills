/** The iteration ledger (ledger.yaml), convergence detection and `waxa iterate`. */
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ExitCode, flagValue } from "./args.ts";
import { loadYaml } from "./layout.ts";
import { runEval } from "./run.ts";
import type { EvalConfig, UnclearPoint } from "./types.ts";

// ---- Iteration / Failure-pattern ledger ---------------------------------

export interface LedgerPattern {
  rule: string;
  seen_in: number[];
  representative_issue: string;
}

export interface LedgerIteration {
  iter: number;
  timestamp: string;
  overall_pass_rate: number;
  new_unclear_count: number;
  reseen_count: number;
  total_unclear: number;
  new_rules: string[];
  reseen_rules: string[];
}

export interface Ledger {
  eval: string;
  skill: string;
  patterns: LedgerPattern[];
  iterations: LedgerIteration[];
}

export async function loadLedger(path: string, evalName: string, skill: string): Promise<Ledger> {
  try {
    return await loadYaml<Ledger>(path);
  } catch (_) {
    return { eval: evalName, skill, patterns: [], iterations: [] };
  }
}

export async function saveLedger(path: string, ledger: Ledger): Promise<void> {
  await writeFile(path, stringifyYaml(ledger as unknown as Record<string, unknown>));
}

export function classifyUnclear(
  ledger: Ledger,
  iter: number,
  unclear: UnclearPoint[],
): { newRules: string[]; reseenRules: string[] } {
  const knownRules = new Map(ledger.patterns.map((p) => [p.rule.trim().toLowerCase(), p]));
  const newRules: string[] = [];
  const reseenRules: string[] = [];
  for (const u of unclear) {
    const key = u.rule.trim().toLowerCase();
    const existing = knownRules.get(key);
    if (existing) {
      if (!existing.seen_in.includes(iter)) existing.seen_in.push(iter);
      reseenRules.push(u.rule);
    } else {
      ledger.patterns.push({ rule: u.rule, seen_in: [iter], representative_issue: u.issue });
      knownRules.set(key, ledger.patterns[ledger.patterns.length - 1]);
      newRules.push(u.rule);
    }
  }
  return { newRules, reseenRules };
}

/** Iterations at the end of the ledger with zero new unclear points. */
export function trailingZeroStreak(iterations: LedgerIteration[]): number {
  let n = 0;
  for (let i = iterations.length - 1; i >= 0 && iterations[i].new_unclear_count === 0; i--) n++;
  return n;
}

/**
 * Converged: the last two iterations found no new unclear points.
 * Diverged: the last three each found some, and the count did not fall.
 */
export function assessConvergence(
  iterations: LedgerIteration[],
): "converged" | "diverged" | undefined {
  if (trailingZeroStreak(iterations) >= 2) return "converged";
  const last3 = iterations.slice(-3);
  if (
    last3.length === 3 &&
    last3.every((i) => i.new_unclear_count >= 1) &&
    last3[2].new_unclear_count >= last3[0].new_unclear_count
  ) return "diverged";
  return undefined;
}

export async function runIterate(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: run.ts iterate <eval.yaml> [--max N] [--task ID]");
    throw new ExitCode(1);
  }
  const max = parseInt(flagValue(args, "--max") ?? "5", 10);
  const taskFilter = flagValue(args, "--task");

  const evalCfg0 = await loadYaml<EvalConfig>(evalPath);
  const evalDir = dirname(resolve(evalPath));
  const ledgerPath = join(evalDir, "ledger.yaml");
  const ledger = await loadLedger(ledgerPath, evalCfg0.name, evalCfg0.skill);
  const startIter = (ledger.iterations.at(-1)?.iter ?? 0) + 1;

  // The trailing zero-unclear streak lives in the ledger, so CONVERGED detection
  // works across separate `waxa iterate` invocations.
  const resumed = trailingZeroStreak(ledger.iterations);
  if (resumed > 0) {
    console.log(
      `\n[ledger] resumed with ${resumed} prior zero-unclear iteration(s); CONVERGED triggers when this reaches 2.`,
    );
  }
  let lastDecisive: "converged" | "diverged" | "capped" | undefined;

  for (let iter = startIter; iter < startIter + max; iter++) {
    console.log(`\n========== Iteration ${iter} ==========\n`);
    const { results } = await runEval(evalPath, { taskFilter, iterTag: `iter-${iter}` });

    const allUnclear = results.flatMap((r) =>
      r.trials.flatMap((t) => t.selfReport?.unclearPoints ?? [])
    );
    const { newRules, reseenRules } = classifyUnclear(ledger, iter, allUnclear);
    const overallPass = results.reduce((a, r) => a + r.passRate, 0) / results.length;

    ledger.iterations.push({
      iter,
      timestamp: new Date().toISOString(),
      overall_pass_rate: Number(overallPass.toFixed(4)),
      new_unclear_count: newRules.length,
      reseen_count: reseenRules.length,
      total_unclear: allUnclear.length,
      new_rules: newRules,
      reseen_rules: reseenRules,
    });
    await saveLedger(ledgerPath, ledger);

    console.log(
      `\n  ledger: iter=${iter}, accuracy=${(overallPass * 100).toFixed(0)}%, new_unclear=${newRules.length}, reseen=${reseenRules.length}, total_unclear=${allUnclear.length}`,
    );

    const verdict = assessConvergence(ledger.iterations);
    if (verdict === "converged") {
      console.log(
        `\n[CONVERGED] ${trailingZeroStreak(ledger.iterations)} consecutive iterations with zero new unclear points.`,
      );
      lastDecisive = verdict;
      break;
    }
    if (verdict === "diverged") {
      console.log(`\n[DIVERGENCE-SIGNAL] 3+ consecutive iterations with non-decreasing new unclear; consider rewriting the prompt structure rather than patching.`);
      lastDecisive = verdict;
      break;
    }
  }

  if (!lastDecisive) {
    console.log(`\n[CAPPED] reached max iterations (${max}) without convergence.`);
  }

  console.log(`\nLedger updated: ${ledgerPath}`);
}
