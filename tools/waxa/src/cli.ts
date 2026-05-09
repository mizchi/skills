#!/usr/bin/env -S deno run -A
/**
 * waxa — skill evaluation CLI (waza-schema-compatible + empirical-prompt-tuning
 * methodology on top).
 *
 * - Reads waza-shaped eval.yaml + tasks/*.yaml. Repo-root config is `.waxa.yaml`
 *   first, falling back to `.waza.yaml` so waza can coexist.
 * - Executes via `claude -p --system-prompt --disable-slash-commands` so the
 *   executor is bias-suppressed (no skill auto-discovery, no CLAUDE.md
 *   auto-merge), with the target skill's body injected into the user prompt.
 * - Forces a structured Self-report (Phase trace + Unclear points + fill-ins
 *   + retries) at the tail of the executor output, then grades it.
 * - Supports four grader types: text (regex), code (JS expr with Python
 *   compat shim), self-report (structural assertions), llm (LLM-as-Judge).
 * - Persists JSONL into results/.
 *
 *   waxa <eval.yaml> [--task ID]
 *   waxa iterate <eval.yaml> [--max N] [--task ID]
 */
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { dirname, join, resolve } from "@std/path";
import { expandGlob } from "@std/fs";

// ---- Types ---------------------------------------------------------------

interface Metric {
  name: string;
  weight: number;
  threshold: number;
  description?: string;
}

type GraderType = "text" | "code" | "self-report" | "llm";

interface Grader {
  name: string;
  type: GraderType;
  config: Record<string, unknown>;
}

interface EvalConfig {
  name: string;
  description?: string;
  skill: string;
  version?: string;
  config?: {
    trials_per_task?: number;  // default 1; N>1 mitigates LLM non-determinism
    timeout_seconds?: number;
    model?: string;
    parallel?: boolean;
    workers?: number;
  };
  metrics?: Metric[];
  graders?: Grader[];
  tasks: string[];
}

interface Task {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputs: { prompt: string; context?: unknown };
  expected?: { output_contains?: string[]; require_self_report?: boolean };
  graders?: Grader[];
}

interface GraderResult {
  name: string;
  pass: boolean;
  score: number;
  message?: string;
  durationMs: number;
}

interface PhaseEntry {
  phase: string;
  status: "OK" | "stuck" | "skipped" | "missing";
  reason?: string;
}

interface UnclearPoint {
  issue: string;
  cause: string;
  rule: string;
}

interface SelfReport {
  phaseTrace: PhaseEntry[];
  unclearPoints: UnclearPoint[];
  discretionaryFillIns: string[];
  retries: number;
  raw: string;
}

interface TaskTrial {
  trial: number;
  output: string;
  selfReport: SelfReport | null;
  graders: GraderResult[];
  passRate: number;
  durationMs: number;
}

interface TaskResult {
  taskId: string;
  taskName: string;
  trials: TaskTrial[];
  // Aggregates across trials. With trials_per_task=1 these mirror the
  // single trial; with N>1 they are means/totals.
  passRate: number;
  durationMs: number;
}

// ---- Helpers -------------------------------------------------------------

async function loadYaml<T>(path: string): Promise<T> {
  return parseYaml(await Deno.readTextFile(path)) as T;
}

async function findRepoRoot(start: string): Promise<string> {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    for (const candidate of [".waxa.yaml", ".waza.yaml"]) {
      try {
        await Deno.stat(join(dir, candidate));
        return dir;
      } catch (_) { /* try next candidate */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate repo root (.waxa.yaml or .waza.yaml) walking up from ${start}`,
  );
}

async function loadSkillBody(repoRoot: string, skillName: string): Promise<string> {
  return await Deno.readTextFile(join(repoRoot, skillName, "SKILL.md"));
}

// ---- Executor ------------------------------------------------------------

async function executeClaude(
  prompt: string,
  model: string,
  timeoutSec: number,
  systemPrompt =
    "You are a blank-slate executor. Follow the instructions in the user message exactly. Do not introduce yourself, do not append meta commentary, do not invoke external tools.",
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  try {
    const cmd = new Deno.Command("claude", {
      args: [
        "-p",
        "--output-format",
        "text",
        "--model",
        model,
        "--no-session-persistence",
        "--disable-slash-commands",
        "--system-prompt",
        systemPrompt,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      signal: ctrl.signal,
    });
    const child = cmd.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(prompt));
    await writer.close();
    const { stdout, stderr, code } = await child.output();
    if (code !== 0) {
      throw new Error(
        `claude exit ${code}; stderr=${
          new TextDecoder().decode(stderr).slice(0, 500)
        }; stdout=${new TextDecoder().decode(stdout).slice(0, 200)}`,
      );
    }
    return new TextDecoder().decode(stdout);
  } finally {
    clearTimeout(t);
  }
}

// ---- Self-report extraction ---------------------------------------------

const SELF_REPORT_REQUEST = `

---

# Self-report (mandatory)

Append the following structured block to the END of your response, after
the deliverable. Do not omit any section. Use literally "(none)" when a
section has no content.

\`\`\`
## Self-report

### Phase trace
- Understanding: OK
- Planning: OK
- Execution: OK
- Formatting: OK
(Replace OK with "stuck: <one-line reason>" if a phase was stuck.)

### Unclear points
(none)
(Or, when not none, enumerate as:)
1. Issue: <what observably happened>
   Cause: <why, diagnosed at the instruction level>
   General Fix Rule: <a class-level rule that would prevent this class of mistake>

### Discretionary fill-ins
(none)
(Or, when not none, list as bullets starting with "- ".)

### Retries
0
(Or higher integer if a decision was redone.)
\`\`\`
`;

function extractSelfReport(output: string): SelfReport | null {
  const startIdx = output.indexOf("## Self-report");
  if (startIdx < 0) return null;
  const body = output.slice(startIdx);

  const phases = ["Understanding", "Planning", "Execution", "Formatting"];
  const phaseTrace: PhaseEntry[] = phases.map((p) => {
    const re = new RegExp(`-\\s*${p}\\s*:\\s*(OK|stuck|skipped)\\b\\s*:?\\s*(.*)`, "i");
    const m = body.match(re);
    if (!m) return { phase: p, status: "missing" };
    const status = m[1].toLowerCase() === "ok"
      ? "OK"
      : m[1].toLowerCase() === "stuck"
      ? "stuck"
      : "skipped";
    const reason = (m[2] ?? "").trim();
    return {
      phase: p,
      status: status as PhaseEntry["status"],
      reason: reason.length > 0 ? reason : undefined,
    };
  });

  const unclearMatch = body.match(/### Unclear points\s*\n([\s\S]*?)(?=\n###|$)/);
  const unclearText = (unclearMatch?.[1] ?? "").trim();
  const unclearPoints: UnclearPoint[] = [];
  if (!/^\(none\)/im.test(unclearText) && unclearText.length > 0) {
    const entries = unclearText.split(/^\s*\d+\.\s+/m).slice(1);
    for (const e of entries) {
      const issue = e.match(/Issue:\s*(.+)/)?.[1]?.trim();
      const cause = e.match(/Cause:\s*(.+)/)?.[1]?.trim();
      const rule = e.match(/General Fix Rule:\s*(.+)/)?.[1]?.trim();
      if (issue && cause && rule) unclearPoints.push({ issue, cause, rule });
    }
  }

  const fillsMatch = body.match(/### Discretionary fill-ins\s*\n([\s\S]*?)(?=\n###|$)/);
  const fillsText = (fillsMatch?.[1] ?? "").trim();
  const discretionaryFillIns = /^\(none\)/im.test(fillsText)
    ? []
    : (fillsText.match(/^\s*-\s*(.+)$/gm) ?? []).map((s) => s.replace(/^\s*-\s*/, "").trim());

  const retriesMatch = body.match(/### Retries\s*\n\s*(\d+)/);
  const retries = retriesMatch ? parseInt(retriesMatch[1], 10) : 0;

  return { phaseTrace, unclearPoints, discretionaryFillIns, retries, raw: body };
}

// ---- Graders -------------------------------------------------------------

function compileRegex(pattern: string): RegExp {
  const m = pattern.match(/^\(\?([imsux]+)\)(.*)$/);
  if (m) {
    const flags = m[1].replace(/[xu]/g, "");
    return new RegExp(m[2], flags);
  }
  return new RegExp(pattern);
}

function gradeText(grader: Grader, output: string): GraderResult {
  const start = performance.now();
  const cfg = grader.config as { regex_match?: string[]; regex_not_match?: string[] };
  const failures: string[] = [];
  for (const re of cfg.regex_match ?? []) {
    if (!compileRegex(re).test(output)) failures.push(`missing: ${re}`);
  }
  for (const re of cfg.regex_not_match ?? []) {
    if (compileRegex(re).test(output)) failures.push(`should NOT match: ${re}`);
  }
  return {
    name: grader.name,
    pass: failures.length === 0,
    score: failures.length === 0 ? 1 : 0,
    message: failures.join("; ") || undefined,
    durationMs: Math.round(performance.now() - start),
  };
}

function pythonToJs(expr: string): string {
  // Best-effort waza-compat shim. Translates a few Python membership idioms
  // to JS so basic assertions work with `new Function`. Intentionally narrow:
  // - `len(x)` → `(x).length`
  // - `'a' in x` / `'a' not in x` → `x.includes('a')` / `!x.includes('a')`
  //
  // NOT translated (would need a real parser to do safely):
  // - boolean operators `or` / `and` / `not` (string-literal collisions)
  // - method calls like `output.lower()` (Python-only)
  // For richer logic, write the assertion in JS directly, or split into
  // multiple graders, or use an `llm` grader with a rubric.
  let out = expr;
  out = out.replace(/\blen\s*\(([^()]+)\)/g, "($1).length");
  out = out.replace(/(['"][^'"]+['"])\s+not\s+in\s+([a-zA-Z_]\w*)/g, "!$2.includes($1)");
  out = out.replace(/(['"][^'"]+['"])\s+in\s+([a-zA-Z_]\w*)/g, "$2.includes($1)");
  return out;
}

function gradeCode(grader: Grader, output: string): GraderResult {
  const start = performance.now();
  const cfg = grader.config as { assertions?: string[] };
  const failures: string[] = [];
  for (const expr of cfg.assertions ?? []) {
    try {
      const fn = new Function("output", `return (${pythonToJs(expr)});`);
      const r = fn(output);
      if (!r) failures.push(`Failed: ${expr}`);
    } catch (e) {
      failures.push(`Error in ${expr}: ${(e as Error).message}`);
    }
  }
  return {
    name: grader.name,
    pass: failures.length === 0,
    score: failures.length === 0 ? 1 : 0,
    message: failures.join("; ") || undefined,
    durationMs: Math.round(performance.now() - start),
  };
}

function gradeOutputContains(expected: string[] | undefined, output: string): GraderResult {
  const start = performance.now();
  if (!expected || expected.length === 0) {
    return { name: "_output_contains", pass: true, score: 1, durationMs: 0 };
  }
  const missing = expected.filter((s) => !output.includes(s));
  return {
    name: "_output_contains",
    pass: missing.length === 0,
    score: (expected.length - missing.length) / expected.length,
    message: missing.length ? `missing: [${missing.join(", ")}]` : undefined,
    durationMs: Math.round(performance.now() - start),
  };
}

function gradeSelfReport(grader: Grader, sr: SelfReport | null): GraderResult {
  const start = performance.now();
  const cfg = grader.config as {
    require_present?: boolean;
    require_all_phases_ok?: boolean;
    max_unclear?: number;
    max_retries?: number;
  };
  const failures: string[] = [];
  if (cfg.require_present !== false && !sr) {
    failures.push("self-report not found");
  }
  if (sr) {
    if (cfg.require_all_phases_ok) {
      const stuck = sr.phaseTrace.filter((p) => p.status !== "OK");
      if (stuck.length) failures.push(`stuck/missing phases: ${stuck.map((p) => p.phase).join(", ")}`);
    }
    if (typeof cfg.max_unclear === "number" && sr.unclearPoints.length > cfg.max_unclear) {
      failures.push(`unclear points ${sr.unclearPoints.length} > max ${cfg.max_unclear}`);
    }
    if (typeof cfg.max_retries === "number" && sr.retries > cfg.max_retries) {
      failures.push(`retries ${sr.retries} > max ${cfg.max_retries}`);
    }
  }
  return {
    name: grader.name,
    pass: failures.length === 0,
    score: failures.length === 0 ? 1 : 0,
    message: failures.join("; ") || undefined,
    durationMs: Math.round(performance.now() - start),
  };
}

async function gradeLlm(
  grader: Grader,
  output: string,
  judgeModel: string,
): Promise<GraderResult> {
  const start = performance.now();
  const cfg = grader.config as { rubric: string };
  const judgePrompt = [
    `あなたは AI agent の output を評価する judge。`,
    ``,
    `以下の output が、続く rubric を満たすかを判定する。`,
    ``,
    `## evaluated output`,
    ``,
    output,
    ``,
    `---`,
    ``,
    `## rubric`,
    ``,
    cfg.rubric,
    ``,
    `---`,
    ``,
    `# 指示`,
    `次の構造で **必ず** 回答する。前置き・解説不要。`,
    ``,
    `PASS: yes`,
    `SCORE: 90`,
    `REASON: <一文で根拠>`,
    ``,
    `(PASS は yes / no、SCORE は 0-100 の整数、REASON は一文)`,
  ].join("\n");
  let pass = false;
  let score = 0;
  let reason = "";
  try {
    const resp = await executeClaude(judgePrompt, judgeModel, 90);
    pass = /PASS:\s*yes/i.test(resp);
    const sm = resp.match(/SCORE:\s*(\d+)/);
    if (sm) score = parseInt(sm[1], 10) / 100;
    else score = pass ? 1 : 0;
    const rm = resp.match(/REASON:\s*(.+)/);
    reason = rm?.[1]?.trim().slice(0, 240) ?? "";
  } catch (e) {
    reason = `judge-error: ${(e as Error).message.slice(0, 200)}`;
  }
  return {
    name: grader.name,
    pass,
    score,
    message: reason || undefined,
    durationMs: Math.round(performance.now() - start),
  };
}

// ---- Run a task ----------------------------------------------------------

async function runOneTrial(
  trialNum: number,
  repoRoot: string,
  evalCfg: EvalConfig,
  task: Task,
  skillBody: string,
  model: string,
  timeout: number,
  requireSelfReport: boolean,
  totalTrials: number,
): Promise<TaskTrial> {
  const start = performance.now();
  const prompt = [
    `以下の skill 本文を blank-slate executor として読み、続く scenario を実行して deliverable を返せ。`,
    ``,
    `# 対象 skill: ${evalCfg.skill}`,
    ``,
    skillBody,
    ``,
    `---`,
    ``,
    `# scenario`,
    ``,
    task.inputs.prompt,
    ``,
    `# 指示`,
    `- 上の skill の指示通りに scenario を実行する`,
    `- まず deliverable を返答する (前置き・自己紹介・冗長な確認は不要)`,
    `- 内部で skill を読んだ前提で書く`,
    requireSelfReport ? SELF_REPORT_REQUEST : "",
  ].join("\n");

  const trialLabel = totalTrials > 1 ? ` trial ${trialNum}/${totalTrials}` : "";
  console.log(
    `  [${task.id}]${trialLabel} executing claude (model=${model}, timeout=${timeout}s)...`,
  );
  let output = "";
  try {
    output = await executeClaude(prompt, model, timeout);
  } catch (e) {
    output = `[runner-error] ${(e as Error).message}`;
  }

  const selfReport = requireSelfReport ? extractSelfReport(output) : null;

  const allGraders: Grader[] = [...(evalCfg.graders ?? []), ...(task.graders ?? [])];
  const graderResults: GraderResult[] = [];
  graderResults.push(gradeOutputContains(task.expected?.output_contains, output));
  for (const g of allGraders) {
    if (g.type === "text") graderResults.push(gradeText(g, output));
    else if (g.type === "code") graderResults.push(gradeCode(g, output));
    else if (g.type === "self-report") graderResults.push(gradeSelfReport(g, selfReport));
    else if (g.type === "llm") graderResults.push(await gradeLlm(g, output, model));
    else {
      graderResults.push({
        name: g.name,
        pass: false,
        score: 0,
        message: `unknown grader type: ${g.type}`,
        durationMs: 0,
      });
    }
  }

  const passes = graderResults.filter((r) => r.pass).length;
  const passRate = graderResults.length === 0 ? 1 : passes / graderResults.length;

  return {
    trial: trialNum,
    output,
    selfReport,
    graders: graderResults,
    passRate,
    durationMs: Math.round(performance.now() - start),
  };
}

async function runTask(
  repoRoot: string,
  evalCfg: EvalConfig,
  task: Task,
): Promise<TaskResult> {
  const skillBody = await loadSkillBody(repoRoot, evalCfg.skill);
  const model = evalCfg.config?.model ?? "claude-sonnet-4-6";
  const timeout = evalCfg.config?.timeout_seconds ?? 300;
  const requireSelfReport = task.expected?.require_self_report !== false;
  const trialsPerTask = Math.max(1, evalCfg.config?.trials_per_task ?? 1);

  const trials: TaskTrial[] = [];
  for (let t = 1; t <= trialsPerTask; t++) {
    const trial = await runOneTrial(
      t,
      repoRoot,
      evalCfg,
      task,
      skillBody,
      model,
      timeout,
      requireSelfReport,
      trialsPerTask,
    );
    trials.push(trial);
  }

  const passRate = trials.reduce((a, t) => a + t.passRate, 0) / trials.length;
  const durationMs = trials.reduce((a, t) => a + t.durationMs, 0);

  return {
    taskId: task.id,
    taskName: task.name,
    trials,
    passRate,
    durationMs,
  };
}

// ---- Main ----------------------------------------------------------------

async function loadTasks(
  evalCfg: EvalConfig,
  evalDir: string,
  taskFilter?: string,
): Promise<Task[]> {
  const tasks: Task[] = [];
  for (const pattern of evalCfg.tasks ?? []) {
    for await (const f of expandGlob(pattern, { root: evalDir })) {
      if (!f.isFile) continue;
      const t = await loadYaml<Task>(f.path);
      if (!taskFilter || t.id === taskFilter || t.name === taskFilter) tasks.push(t);
    }
  }
  return tasks;
}

function printTaskResult(idx: number, total: number, r: TaskResult) {
  console.log(`[${idx}/${total}] ${r.taskName}`);
  const multi = r.trials.length > 1;
  for (const trial of r.trials) {
    if (multi) console.log(`  -- trial ${trial.trial}/${r.trials.length} --`);
    for (const g of trial.graders) {
      const mark = g.pass ? "✓" : "✗";
      console.log(`    ${mark} ${g.name} score=${g.score.toFixed(2)} ${g.message ?? ""}`);
    }
    if (trial.selfReport) {
      const stuck = trial.selfReport.phaseTrace.filter((p) => p.status !== "OK");
      console.log(
        `    self-report: phases=${
          stuck.length === 0 ? "all OK" : stuck.map((p) => p.phase).join("/") + " stuck"
        }, unclear=${trial.selfReport.unclearPoints.length}, retries=${trial.selfReport.retries}`,
      );
    } else {
      console.log(`    self-report: (not extracted)`);
    }
    if (multi) {
      console.log(
        `    trial pass_rate=${(trial.passRate * 100).toFixed(0)}% (${trial.durationMs}ms)`,
      );
    }
  }
  if (multi) {
    const totalUnclear = r.trials.reduce(
      (a, t) => a + (t.selfReport?.unclearPoints.length ?? 0),
      0,
    );
    console.log(
      `  AGGREGATE: mean_pass_rate=${(r.passRate * 100).toFixed(0)}% across ${r.trials.length} trials, total_unclear=${totalUnclear}, total_dur=${r.durationMs}ms`,
    );
  } else {
    console.log(`  pass_rate=${(r.passRate * 100).toFixed(0)}% (${r.durationMs}ms)`);
  }
  console.log("");
}

async function persistJsonl(
  repoRoot: string,
  evalName: string,
  results: TaskResult[],
  iterTag?: string,
): Promise<string> {
  const resultsDir = join(repoRoot, "results");
  await Deno.mkdir(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = iterTag ? `-${iterTag}` : "";
  const outFile = join(resultsDir, `${evalName}${suffix}-${stamp}.jsonl`);
  // One JSONL line per trial (so multi-trial runs can be analyzed
  // trial-by-trial). The aggregate is duplicated on each row for grep-
  // ability; readers that want unique aggregates can dedupe by task_id.
  const lines = results.flatMap((r) =>
    r.trials.map((t) =>
      JSON.stringify({
        eval: evalName,
        task_id: r.taskId,
        task_name: r.taskName,
        trial: t.trial,
        of_trials: r.trials.length,
        trial_pass_rate: t.passRate,
        trial_duration_ms: t.durationMs,
        task_mean_pass_rate: r.passRate,
        task_total_duration_ms: r.durationMs,
        graders: t.graders,
        self_report: t.selfReport,
        output: t.output,
      })
    )
  );
  await Deno.writeTextFile(outFile, lines.join("\n") + "\n");
  return outFile;
}

interface RunEvalOptions {
  taskFilter?: string;
  iterTag?: string;
  modelOverride?: string;
  skillOverride?: string;
}

async function runEval(
  evalPath: string,
  opts: RunEvalOptions = {},
): Promise<{ evalCfg: EvalConfig; evalDir: string; repoRoot: string; results: TaskResult[] }> {
  const { taskFilter, iterTag, modelOverride, skillOverride } = opts;
  const evalCfgRaw = await loadYaml<EvalConfig>(evalPath);
  const evalCfg: EvalConfig = {
    ...evalCfgRaw,
    skill: skillOverride ?? evalCfgRaw.skill,
    config: {
      ...(evalCfgRaw.config ?? {}),
      ...(modelOverride ? { model: modelOverride } : {}),
    },
  };
  const evalDir = dirname(resolve(evalPath));
  const repoRoot = await findRepoRoot(evalDir);

  console.log(`Eval: ${evalCfg.name}`);
  console.log(`Skill: ${evalCfg.skill}`);
  if (iterTag) console.log(`Iteration: ${iterTag}`);
  console.log(`Repo root: ${repoRoot}`);
  console.log("");

  const tasks = await loadTasks(evalCfg, evalDir, taskFilter);
  if (tasks.length === 0) {
    console.error("No tasks matched.");
    Deno.exit(2);
  }

  const parallel = evalCfg.config?.parallel === true;
  const workers = Math.max(1, evalCfg.config?.workers ?? 2);
  const results: TaskResult[] = [];

  if (parallel && tasks.length > 1) {
    console.log(`[parallel] running ${tasks.length} tasks with up to ${workers} workers`);
    let nextIdx = 0;
    const numbered = tasks.map((t, i) => ({ idx: i, task: t }));
    results.length = tasks.length;
    async function worker() {
      while (true) {
        const slot = nextIdx++;
        if (slot >= numbered.length) return;
        const { idx, task } = numbered[slot];
        const r = await runTask(repoRoot, evalCfg, task);
        results[idx] = r;
        printTaskResult(idx + 1, tasks.length, r);
      }
    }
    await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, () => worker()));
  } else {
    for (const task of tasks) {
      const r = await runTask(repoRoot, evalCfg, task);
      results.push(r);
      printTaskResult(results.length, tasks.length, r);
    }
  }

  const overall = results.reduce((a, r) => a + r.passRate, 0) / results.length;
  console.log("===========================================");
  console.log(`Overall pass rate: ${(overall * 100).toFixed(1)}% (${results.length} task(s))`);
  console.log("===========================================");

  const outFile = await persistJsonl(repoRoot, evalCfg.name, results, iterTag);
  console.log(`Results written: ${outFile}`);

  return { evalCfg, evalDir, repoRoot, results };
}

// ---- Iteration / Failure-pattern ledger ---------------------------------

interface LedgerPattern {
  rule: string;
  seen_in: number[];
  representative_issue: string;
}

interface LedgerIteration {
  iter: number;
  timestamp: string;
  overall_pass_rate: number;
  new_unclear_count: number;
  reseen_count: number;
  total_unclear: number;
  new_rules: string[];
  reseen_rules: string[];
}

interface Ledger {
  eval: string;
  skill: string;
  patterns: LedgerPattern[];
  iterations: LedgerIteration[];
}

async function loadLedger(path: string, evalName: string, skill: string): Promise<Ledger> {
  try {
    return await loadYaml<Ledger>(path);
  } catch (_) {
    return { eval: evalName, skill, patterns: [], iterations: [] };
  }
}

async function saveLedger(path: string, ledger: Ledger): Promise<void> {
  await Deno.writeTextFile(path, stringifyYaml(ledger as unknown as Record<string, unknown>));
}

function classifyUnclear(
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

async function runIterate(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: run.ts iterate <eval.yaml> [--max N] [--task ID]");
    Deno.exit(1);
  }
  const max = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1], 10) : 5;
  const taskFilter = args.includes("--task") ? args[args.indexOf("--task") + 1] : undefined;

  const evalCfg0 = await loadYaml<EvalConfig>(evalPath);
  const evalDir = dirname(resolve(evalPath));
  const ledgerPath = join(evalDir, "ledger.yaml");
  const ledger = await loadLedger(ledgerPath, evalCfg0.name, evalCfg0.skill);
  const startIter = (ledger.iterations.at(-1)?.iter ?? 0) + 1;

  // Restore the trailing zero-unclear streak from the ledger so that
  // CONVERGED detection works across separate `waxa iterate` invocations
  // (e.g. iter 2 ran yesterday, iter 3 today — both zero ⇒ CONVERGED).
  let consecutiveZero = 0;
  for (let i = ledger.iterations.length - 1; i >= 0; i--) {
    if (ledger.iterations[i].new_unclear_count === 0) consecutiveZero += 1;
    else break;
  }
  if (consecutiveZero > 0) {
    console.log(
      `\n[ledger] resumed with ${consecutiveZero} prior zero-unclear iteration(s); CONVERGED triggers when this reaches 2.`,
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

    // Convergence / divergence detection.
    if (newRules.length === 0) consecutiveZero += 1;
    else consecutiveZero = 0;

    if (consecutiveZero >= 2) {
      console.log(`\n[CONVERGED] ${consecutiveZero} consecutive iterations with zero new unclear points.`);
      lastDecisive = "converged";
      break;
    }

    // Divergence: 3+ iters with same-or-higher new_unclear_count and no convergence.
    const last3 = ledger.iterations.slice(-3);
    if (last3.length === 3 && last3.every((i) => i.new_unclear_count >= 1)) {
      const trend = last3[2].new_unclear_count >= last3[0].new_unclear_count;
      if (trend) {
        console.log(`\n[DIVERGENCE-SIGNAL] 3+ consecutive iterations with non-decreasing new unclear; consider rewriting the prompt structure rather than patching.`);
        lastDecisive = "diverged";
        break;
      }
    }
  }

  if (!lastDecisive) {
    console.log(`\n[CAPPED] reached max iterations (${max}) without convergence.`);
  }

  console.log(`\nLedger updated: ${ledgerPath}`);
}

// ---- compare sub-command (multi-model) -----------------------------------

function summarizeResults(results: TaskResult[]): {
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

async function runCompare(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: waxa compare <eval.yaml> --models <a,b,...> [--task ID]");
    Deno.exit(1);
  }
  const modelsCsv = args.includes("--models") ? args[args.indexOf("--models") + 1] : "";
  if (!modelsCsv) {
    console.error("--models <csv> is required");
    Deno.exit(1);
  }
  const models = modelsCsv.split(",").map((m) => m.trim()).filter(Boolean);
  const taskFilter = args.includes("--task") ? args[args.indexOf("--task") + 1] : undefined;

  const summary: { model: string; s: ReturnType<typeof summarizeResults> }[] = [];
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

async function runVariant(args: string[]) {
  const evalPath = args[0];
  if (!evalPath) {
    console.error("Usage: waxa variant <eval.yaml> --base <skill> --candidate <skill> [--task ID]");
    Deno.exit(1);
  }
  const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
  const candidate = args.includes("--candidate")
    ? args[args.indexOf("--candidate") + 1]
    : undefined;
  if (!base || !candidate) {
    console.error("--base <skill> and --candidate <skill> are both required");
    Deno.exit(1);
  }
  const taskFilter = args.includes("--task") ? args[args.indexOf("--task") + 1] : undefined;

  const variants = [
    { label: "base", skill: base },
    { label: "candidate", skill: candidate },
  ];
  const summary: { label: string; skill: string; s: ReturnType<typeof summarizeResults> }[] = [];
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
  // Recommendation per empirical: prefer higher accuracy → fewer unclear → lower duration.
  const ranked = [...summary].sort((a, b) => {
    if (b.s.acc !== a.s.acc) return b.s.acc - a.s.acc;
    if (a.s.unclear !== b.s.unclear) return a.s.unclear - b.s.unclear;
    return a.s.meanDur - b.s.meanDur;
  });
  console.log(`\nRecommended: ${ranked[0].label} (${ranked[0].skill})`);
}

// ---- Main ----------------------------------------------------------------

async function main() {
  const sub = Deno.args[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.error("Usage:");
    console.error("  waxa <eval.yaml> [--task <id>]                                 single run");
    console.error("  waxa iterate <eval.yaml> [--max N] [--task <id>]              iteration loop");
    console.error("  waxa compare <eval.yaml> --models <csv> [--task <id>]         multi-model comparison");
    console.error("  waxa variant <eval.yaml> --base <skill> --candidate <skill>   skill A/B exploration");
    Deno.exit(sub ? 0 : 1);
  }

  if (sub === "iterate") {
    await runIterate(Deno.args.slice(1));
    return;
  }
  if (sub === "compare") {
    await runCompare(Deno.args.slice(1));
    return;
  }
  if (sub === "variant") {
    await runVariant(Deno.args.slice(1));
    return;
  }

  // Default: single run
  const taskFilter = Deno.args.includes("--task")
    ? Deno.args[Deno.args.indexOf("--task") + 1]
    : undefined;
  const { results } = await runEval(sub, { taskFilter });
  Deno.exit(results.every((r) => r.passRate === 1) ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
