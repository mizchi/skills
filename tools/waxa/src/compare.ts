/** `waxa compare` (models) and `waxa variant` (skill A/B), on objective axes only. */
import { ExitCode, flagValue } from "./args.ts";
import { runEval } from "./run.ts";
import type { TaskResult } from "./types.ts";

// ---- compare sub-command (multi-model) -----------------------------------

export function summarizeResults(results: TaskResult[]): {
  pass: number;
  total: number;
  acc: number;
  unclear: number;
  meanDur: number;
} {
  // pass = number of tasks with mean pass_rate == 1 (every trial fully passed)
  const pass = results.filter((r) => r.passRate === 1).length;
  const total = results.length;
  const acc = total === 0 ? 0 : results.reduce((a, r) => a + r.passRate, 0) / total;
  const unclear = results.reduce(
    (a, r) => a + r.trials.reduce((b, t) => b + (t.selfReport?.unclearPoints.length ?? 0), 0),
    0,
  );
  const meanDur = total === 0 ? 0 : results.reduce((a, r) => a + r.durationMs, 0) / total;
  return { pass, total, acc, unclear, meanDur };
}

export type Summary = ReturnType<typeof summarizeResults>;

/** Recommendation per empirical-prompt-tuning: higher accuracy, then fewer unclear points, then lower duration. */
export function rankVariants<T extends { s: Summary }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    if (b.s.acc !== a.s.acc) return b.s.acc - a.s.acc;
    if (a.s.unclear !== b.s.unclear) return a.s.unclear - b.s.unclear;
    return a.s.meanDur - b.s.meanDur;
  });
}

export async function runCompare(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: waxa compare <eval.yaml> --models <a,b,...> [--task ID]");
    throw new ExitCode(1);
  }
  const modelsCsv = flagValue(args, "--models") ?? "";
  if (!modelsCsv) {
    console.error("--models <csv> is required");
    throw new ExitCode(1);
  }
  const models = modelsCsv.split(",").map((m) => m.trim()).filter(Boolean);
  const taskFilter = flagValue(args, "--task");

  const summary: { model: string; s: Summary }[] = [];
  for (const model of models) {
    console.log(`\n========== Model: ${model} ==========\n`);
    const { results } = await runEval(evalPath, {
      taskFilter,
      iterTag: `model-${model.replace(/[^a-z0-9-]/gi, "_")}`,
      modelOverride: model,
    });
    summary.push({ model, s: summarizeResults(results) });
  }

  console.log(`\n===== Multi-model comparison =====`);
  console.log(`(objective axes only — accuracy, mean duration, unclear count.`);
  console.log(` LLM-as-judge "A vs B" is intentionally NOT used here — bias.)\n`);
  console.log(`| model | pass | total | accuracy | unclear | mean_dur(ms) |`);
  console.log(`|---|---|---|---|---|---|`);
  for (const { model, s } of summary) {
    console.log(
      `| ${model} | ${s.pass} | ${s.total} | ${(s.acc * 100).toFixed(1)}% | ${s.unclear} | ${Math.round(s.meanDur)} |`,
    );
  }
}

// ---- variant sub-command (skill A/B exploration) -------------------------

export async function runVariant(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: waxa variant <eval.yaml> --base <skill> --candidate <skill> [--task ID]");
    throw new ExitCode(1);
  }
  const base = flagValue(args, "--base");
  const candidate = flagValue(args, "--candidate");
  if (!base || !candidate) {
    console.error("--base <skill> and --candidate <skill> are both required");
    throw new ExitCode(1);
  }
  const taskFilter = flagValue(args, "--task");

  const variants = [
    { label: "base", skill: base },
    { label: "candidate", skill: candidate },
  ];
  const summary: { label: string; skill: string; s: Summary }[] = [];
  for (const v of variants) {
    console.log(`\n========== Variant: ${v.label} (${v.skill}) ==========\n`);
    const { results } = await runEval(evalPath, {
      taskFilter,
      iterTag: `variant-${v.label}`,
      skillOverride: v.skill,
    });
    summary.push({ label: v.label, skill: v.skill, s: summarizeResults(results) });
  }

  console.log(`\n===== Variant exploration =====`);
  console.log(`(objective axes only. Per empirical-prompt-tuning's pairwise caveat:`);
  console.log(` we do not ask an LLM to rate "A vs B" directly — position + self-`);
  console.log(` preference bias make such judgments noisy at small n.)\n`);
  console.log(`| variant | skill | pass | accuracy | unclear | mean_dur(ms) |`);
  console.log(`|---|---|---|---|---|---|`);
  for (const x of summary) {
    console.log(
      `| ${x.label} | ${x.skill} | ${x.s.pass}/${x.s.total} | ${(x.s.acc * 100).toFixed(1)}% | ${x.s.unclear} | ${Math.round(x.s.meanDur)} |`,
    );
  }
  const ranked = rankVariants(summary);
  console.log(`\nRecommended: ${ranked[0].label} (${ranked[0].skill})`);
}
