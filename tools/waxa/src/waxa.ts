/**
 * waxa — skill evaluation CLI. Conceptually inspired by microsoft/waza and
 * agentskills.io's evaluating-skills layout; ships as an independent tool
 * with the empirical-prompt-tuning iteration loop layered on top.
 *
 * - Reads waxa-shaped eval.yaml + tasks/*.yaml. Repo-root marker is `.waxa.yaml`.
 * - Executes via `claude -p --system-prompt --disable-slash-commands` so the
 *   executor is bias-suppressed (no skill auto-discovery, no CLAUDE.md
 *   auto-merge), with the target skill's body injected into the user prompt.
 * - Forces a structured Self-report at the tail of the executor output, then
 *   grades it with text / code / self-report / llm graders.
 * - Runs on Node.js 24+; the executor binary can be swapped with WAXA_CLAUDE_BIN.
 *
 * This module is the public entry: it re-exports the library surface and
 * dispatches sub-commands.
 */
import { ExitCode, flagValue } from "./args.ts";
import { runAudit } from "./audit.ts";
import { runCompare, runVariant } from "./compare.ts";
import { runInit } from "./init.ts";
import { runIterate } from "./ledger.ts";
import { runEval } from "./run.ts";

export { ExitCode } from "./args.ts";
export {
  compileRegex,
  gradeCode,
  gradeOutputContains,
  gradeSelfReport,
  gradeText,
} from "./graders.ts";
export { executeClaude, runProcess } from "./process.ts";
export { runEval } from "./run.ts";
export { extractSelfReport } from "./self-report.ts";
export type { EvalConfig, Grader, GraderResult, SelfReport, Task, TaskResult } from "./types.ts";

/** Run the CLI with argv (without node and script). Returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  try {
    await dispatch(argv);
    return 0;
  } catch (e) {
    if (e instanceof ExitCode) return e.code;
    throw e;
  }
}

async function dispatch(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.error("Usage:");
    console.error("  waxa init [--skill <name>] [--force]                          scaffold <skill>/evals/");
    console.error("  waxa audit <skill-dir> [--no-apm] [--json]                    skill quality + apm audit (composition)");
    console.error("  waxa <eval.yaml> [--task <id>] [--baseline]                   single run (--baseline runs with_skill + without_skill)");
    console.error("  waxa iterate <eval.yaml> [--max N] [--task <id>]              iteration loop");
    console.error("  waxa compare <eval.yaml> --models <csv> [--task <id>]         multi-model comparison");
    console.error("  waxa variant <eval.yaml> --base <skill> --candidate <skill>   skill A/B exploration");
    throw new ExitCode(sub ? 0 : 1);
  }

  const rest = argv.slice(1);
  if (sub === "init") return await runInit(rest);
  if (sub === "audit") return await runAudit(rest);
  if (sub === "iterate") return await runIterate(rest);
  if (sub === "compare") return await runCompare(rest);
  if (sub === "variant") return await runVariant(rest);

  // Default: single run
  const taskFilter = flagValue(argv, "--task");
  const withBaseline = argv.includes("--baseline");
  const { results } = await runEval(sub, { taskFilter, withBaseline });
  throw new ExitCode(results.every((r) => r.passRate === 1) ? 0 : 1);
}
