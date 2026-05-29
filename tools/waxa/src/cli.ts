/**
 * waxa — skill evaluation CLI. Conceptually inspired by microsoft/waza and
 * agentskills.io's evaluating-skills layout; ships as an independent tool
 * with the empirical-prompt-tuning iteration loop layered on top.
 *
 * - Reads waxa-shaped eval.yaml + tasks/*.yaml. Repo-root marker is `.waxa.yaml`.
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
    try {
      await Deno.stat(join(dir, ".waxa.yaml"));
      return dir;
    } catch (_) { /* walk up */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate repo root (.waxa.yaml) walking up from ${start}`,
  );
}

async function loadSkillBody(repoRoot: string, skillName: string): Promise<string> {
  return await Deno.readTextFile(join(repoRoot, skillName, "SKILL.md"));
}

/**
 * Resolve the directory layout for a given eval.yaml. Supports two forms:
 *
 *   1. skill-local (preferred from 0.2.0):
 *        <skill>/SKILL.md
 *        <skill>/evals/eval.yaml
 *        <skill>/evals/tasks/*.yaml
 *      Detected when the eval.yaml's parent directory is named `evals`
 *      and `../SKILL.md` exists.
 *
 *   2. monorepo legacy (pre-0.2.0):
 *        <repo-root>/<skill>/SKILL.md
 *        <repo-root>/evals/<skill>/eval.yaml
 *      Detected when skill-local form doesn't apply but
 *      `findRepoRoot` succeeds; SKILL.md is then read from
 *      `<repo-root>/<skill>/SKILL.md`.
 *
 * Workspace (per-iteration outputs) lives at:
 *   <workspaceRoot>/results/<skill>/iteration-N/
 *
 * where `workspaceRoot` is the `.waxa.yaml` directory when present,
 * otherwise the skill directory's parent.
 */
interface LayoutPaths {
  baseDir: string; // dirname(evalPath)
  skillDir: string; // directory containing SKILL.md
  skillMdPath: string;
  workspaceRoot: string; // for results/<skill>/iteration-N/
  resultsDir: string; // <workspaceRoot>/results/<skill>/
  layout: "skill-local" | "monorepo-legacy";
}

async function resolveLayout(
  evalPath: string,
  evalCfg: EvalConfig,
): Promise<LayoutPaths> {
  const absEval = resolve(evalPath);
  const baseDir = dirname(absEval);
  const baseName = baseDir.split("/").filter(Boolean).pop() ?? "";

  // skill-local form: <skill>/evals/eval.yaml
  if (baseName === "evals") {
    const skillDir = dirname(baseDir);
    const skillMdPath = join(skillDir, "SKILL.md");
    try {
      await Deno.stat(skillMdPath);
      let workspaceRoot: string;
      try {
        workspaceRoot = await findRepoRoot(skillDir);
      } catch (_) {
        workspaceRoot = dirname(skillDir);
      }
      return {
        baseDir,
        skillDir,
        skillMdPath,
        workspaceRoot,
        resultsDir: join(workspaceRoot, "results", evalCfg.skill),
        layout: "skill-local",
      };
    } catch (_) {
      // SKILL.md missing → fall through to legacy resolution
    }
  }

  // monorepo legacy: <repo-root>/<skill>/SKILL.md
  const workspaceRoot = await findRepoRoot(baseDir);
  const skillDir = join(workspaceRoot, evalCfg.skill);
  return {
    baseDir,
    skillDir,
    skillMdPath: join(skillDir, "SKILL.md"),
    workspaceRoot,
    resultsDir: join(workspaceRoot, "results", evalCfg.skill),
    layout: "monorepo-legacy",
  };
}

async function nextIterationNumber(resultsDir: string): Promise<number> {
  try {
    let max = 0;
    for await (const entry of Deno.readDir(resultsDir)) {
      if (!entry.isDirectory) continue;
      const m = entry.name.match(/^iteration-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  } catch (_) {
    return 1;
  }
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
  // Best-effort shim for Python-style assertion idioms users may carry
  // over from other eval frameworks. Translates a few patterns to JS so
  // basic assertions work with `new Function`. Intentionally narrow:
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
  withSkill = true,
): Promise<TaskTrial> {
  const start = performance.now();
  const prompt = withSkill
    ? [
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
    ].join("\n")
    : [
      // baseline: scenario only, no skill injection. Lets us measure the
      // delta the skill body actually buys.
      `# scenario`,
      ``,
      task.inputs.prompt,
      ``,
      `# 指示`,
      `- scenario を blank-slate のまま実行する (補助 skill を読まない前提)`,
      `- まず deliverable を返答する (前置き・自己紹介・冗長な確認は不要)`,
      requireSelfReport ? SELF_REPORT_REQUEST : "",
    ].join("\n");

  const cfgLabel = withSkill ? "" : " [baseline]";
  const trialLabel = totalTrials > 1 ? ` trial ${trialNum}/${totalTrials}` : "";
  console.log(
    `  [${task.id}]${cfgLabel}${trialLabel} executing claude (model=${model}, timeout=${timeout}s)...`,
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
  skillBody: string,
  withSkill = true,
): Promise<TaskResult> {
  const model = evalCfg.config?.model ?? "claude-opus-4-8";
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
      withSkill,
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

// per-task / per-config result writer (agentskills.io workspace shape).
// Layout:
//   <iterDir>/<task.id>/<with_skill|without_skill>/
//     ├── output-trial-<n>.txt
//     ├── timing.json
//     └── grading.json
async function persistTaskOutputs(
  iterDir: string,
  task: Task,
  result: TaskResult,
  config: "with_skill" | "without_skill",
): Promise<void> {
  const taskDir = join(iterDir, task.id, config);
  await Deno.mkdir(taskDir, { recursive: true });

  for (const trial of result.trials) {
    await Deno.writeTextFile(
      join(taskDir, `output-trial-${trial.trial}.txt`),
      trial.output,
    );
  }

  const durations = result.trials.map((t) => t.durationMs);
  const timingMean = durations.reduce((a, x) => a + x, 0) / Math.max(1, durations.length);
  await Deno.writeTextFile(
    join(taskDir, "timing.json"),
    JSON.stringify(
      {
        duration_ms_mean: Math.round(timingMean),
        trials: result.trials.map((t) => ({ trial: t.trial, duration_ms: t.durationMs })),
      },
      null,
      2,
    ) + "\n",
  );

  const assertion_results = result.trials.flatMap((t) =>
    t.graders.map((g) => ({
      trial: t.trial,
      text: g.name,
      passed: g.pass,
      score: g.score,
      evidence: g.message ?? "",
    }))
  );
  const passed = assertion_results.filter((a) => a.passed).length;
  await Deno.writeTextFile(
    join(taskDir, "grading.json"),
    JSON.stringify(
      {
        assertion_results,
        summary: {
          passed,
          failed: assertion_results.length - passed,
          total: assertion_results.length,
          pass_rate: assertion_results.length ? passed / assertion_results.length : 1,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

function stats(rs: TaskResult[]) {
  const passes = rs.map((r) => r.passRate);
  const durs = rs.flatMap((r) => r.trials.map((t) => t.durationMs));
  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length;
  const stddev = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  };
  return {
    pass_rate: {
      mean: Number(mean(passes).toFixed(3)),
      stddev: Number(stddev(passes).toFixed(3)),
    },
    duration_ms: {
      mean: Math.round(mean(durs)),
      stddev: Math.round(stddev(durs)),
    },
  };
}

async function writeBenchmark(
  iterDir: string,
  withSkill: TaskResult[],
  baseline?: TaskResult[],
): Promise<string> {
  const ws = stats(withSkill);
  const benchmark: Record<string, unknown> = {
    run_summary: { with_skill: ws },
  };
  if (baseline) {
    const bs = stats(baseline);
    (benchmark.run_summary as Record<string, unknown>).without_skill = bs;
    benchmark.delta = {
      pass_rate: Number((ws.pass_rate.mean - bs.pass_rate.mean).toFixed(3)),
      duration_ms: ws.duration_ms.mean - bs.duration_ms.mean,
    };
  }
  const outFile = join(iterDir, "benchmark.json");
  await Deno.writeTextFile(outFile, JSON.stringify(benchmark, null, 2) + "\n");
  return outFile;
}

interface RunEvalOptions {
  taskFilter?: string;
  iterTag?: string;
  modelOverride?: string;
  skillOverride?: string;
  withBaseline?: boolean;
}

interface RunEvalResult {
  evalCfg: EvalConfig;
  layout: LayoutPaths;
  iterDir: string;
  results: TaskResult[];
  baselineResults?: TaskResult[];
}

async function runEval(
  evalPath: string,
  opts: RunEvalOptions = {},
): Promise<RunEvalResult> {
  const { taskFilter, iterTag, modelOverride, skillOverride, withBaseline = false } = opts;
  const evalCfgRaw = await loadYaml<EvalConfig>(evalPath);
  const evalCfg: EvalConfig = {
    ...evalCfgRaw,
    skill: skillOverride ?? evalCfgRaw.skill,
    config: {
      ...(evalCfgRaw.config ?? {}),
      ...(modelOverride ? { model: modelOverride } : {}),
    },
  };
  const layout = await resolveLayout(evalPath, evalCfg);
  const skillBody = await Deno.readTextFile(layout.skillMdPath);

  console.log(`Eval: ${evalCfg.name}`);
  console.log(`Skill: ${evalCfg.skill}`);
  console.log(`Layout: ${layout.layout}`);
  console.log(`Skill body: ${layout.skillMdPath}`);
  if (iterTag) console.log(`Iteration tag: ${iterTag}`);
  if (withBaseline) console.log(`Baseline: enabled (with_skill vs without_skill)`);
  console.log("");

  const tasks = await loadTasks(evalCfg, layout.baseDir, taskFilter);
  if (tasks.length === 0) {
    console.error("No tasks matched.");
    Deno.exit(2);
  }

  const iterN = await nextIterationNumber(layout.resultsDir);
  const iterDir = join(layout.resultsDir, `iteration-${iterN}`);
  await Deno.mkdir(iterDir, { recursive: true });

  // Baseline mode forces serial execution to keep claude rate limits
  // and process count predictable; parallel-with-baseline is a future
  // optimization. Single-config runs honor evalCfg.config.parallel.
  const parallel = !withBaseline && evalCfg.config?.parallel === true;
  const workers = Math.max(1, evalCfg.config?.workers ?? 2);
  const results: TaskResult[] = [];
  const baselineResults: TaskResult[] = [];

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
        const r = await runTask(layout.workspaceRoot, evalCfg, task, skillBody, true);
        results[idx] = r;
        printTaskResult(idx + 1, tasks.length, r);
        await persistTaskOutputs(iterDir, task, r, "with_skill");
      }
    }
    await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, () => worker()));
  } else {
    for (const task of tasks) {
      const r = await runTask(layout.workspaceRoot, evalCfg, task, skillBody, true);
      results.push(r);
      printTaskResult(results.length, tasks.length, r);
      await persistTaskOutputs(iterDir, task, r, "with_skill");

      if (withBaseline) {
        const rb = await runTask(layout.workspaceRoot, evalCfg, task, skillBody, false);
        baselineResults.push(rb);
        printTaskResult(results.length, tasks.length, rb);
        await persistTaskOutputs(iterDir, task, rb, "without_skill");
      }
    }
  }

  const overall = results.reduce((a, r) => a + r.passRate, 0) / results.length;
  console.log("===========================================");
  console.log(
    `Overall pass rate (with skill): ${(overall * 100).toFixed(1)}% (${results.length} task(s))`,
  );
  if (withBaseline && baselineResults.length) {
    const overallBase = baselineResults.reduce((a, r) => a + r.passRate, 0) /
      baselineResults.length;
    const delta = (overall - overallBase) * 100;
    console.log(`Overall pass rate (baseline):   ${(overallBase * 100).toFixed(1)}%`);
    console.log(
      `Delta:                          ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pt`,
    );
  }
  console.log("===========================================");

  const benchPath = await writeBenchmark(
    iterDir,
    results,
    baselineResults.length ? baselineResults : undefined,
  );
  console.log(`Iteration written: ${iterDir}`);
  console.log(`Benchmark:        ${benchPath}`);

  return {
    evalCfg,
    layout,
    iterDir,
    results,
    baselineResults: baselineResults.length ? baselineResults : undefined,
  };
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

// ---- Scaffolding (`waxa init`) ------------------------------------------

const EVAL_TEMPLATE = `name: __SKILL__-eval
description: |
  Evaluation suite for __SKILL__.
  Convergence target: 2 consecutive runs with zero unclear-points
  (cf. empirical-prompt-tuning — bundled at
  references/empirical-prompt-tuning.md inside this npm package).

skill: __SKILL__
version: "0.1"

config:
  # 2 trials averages over LLM non-determinism; bump higher only when a
  # critical axis is suspected to be unstable.
  trials_per_task: 2
  timeout_seconds: 240
  parallel: false
  executor: claude
  model: claude-opus-4-8

tasks:
  - "tasks/*.yaml"
`;

const TASK_TYPICAL_TEMPLATE = `# Median scenario — the most common shape of the user request this skill
# is meant to handle. Should pass at convergence.
id: __SKILL__-typical-001
name: __SKILL__ typical scenario
description: |
  TODO: one paragraph describing the situation the executor faces.

tags:
  - typical

inputs:
  prompt: |
    TODO: the user request as it would arrive in a real session.

expected:
  output_contains:
    - "TODO"   # remove or replace with literal tokens the deliverable must mention
  outcomes:
    - type: task_completed

graders:
  - name: self_report_complete
    type: self-report
    config:
      require_present: true
      require_all_phases_ok: true
      max_retries: 2

  # Add surface + semantic grader pairs per behavioral axis. See
  # references/empirical-prompt-tuning.md (bundled) for the rationale.
  #
  # - name: <axis>_surface
  #   type: text
  #   config:
  #     regex_match:
  #       - "(?i)<broad-alternation>"
  #
  # - name: <axis>_semantic
  #   type: llm
  #   config:
  #     rubric: |
  #       <multi-clause rubric>
`;

const TASK_EDGE_TEMPLATE = `# Edge scenario — a known failure mode the skill is supposed to handle.
# Examples: an out-of-scope request the skill should refuse, a sibling
# skill's territory the skill should defer to, a stress prompt that
# exercises the rule the skill encodes.
id: __SKILL__-edge-001
name: __SKILL__ edge scenario
description: |
  TODO: one paragraph describing the edge case.

tags:
  - edge

inputs:
  prompt: |
    TODO: the user request that exercises the edge case.

expected:
  output_contains:
    - "TODO"
  outcomes:
    - type: task_completed

graders:
  - name: self_report_complete
    type: self-report
    config:
      require_present: true
      require_all_phases_ok: true
      max_retries: 2

  # TODO: graders verifying the edge behavior is honored.
`;

async function runInit(args: string[]) {
  const force = args.includes("--force");
  const skillFromFlag = args.includes("--skill")
    ? args[args.indexOf("--skill") + 1]
    : undefined;
  const cwd = Deno.cwd();

  // 0.2.0 layout: scaffold `<cwd>/evals/` (skill-local). The user
  // typically runs `waxa init` from inside the skill's own directory,
  // so cwd's basename gives the skill name. SKILL.md is expected at
  // `<cwd>/SKILL.md` (the runner resolves it via resolveLayout()).
  const skill = skillFromFlag ?? cwd.split("/").filter(Boolean).pop();
  if (!skill) {
    console.error("could not infer skill name; pass --skill <name>");
    Deno.exit(2);
  }

  // SKILL.md sanity check (warn only, don't block — the user may be
  // scaffolding the eval before authoring the skill body).
  try {
    await Deno.stat(join(cwd, "SKILL.md"));
  } catch (_) {
    console.error(
      `[warn] ${cwd}/SKILL.md not found; \`waxa <eval.yaml>\` will fail until it exists.`,
    );
  }

  const evalDir = join(cwd, "evals");
  const tasksDir = join(evalDir, "tasks");
  await Deno.mkdir(tasksDir, { recursive: true });

  const writes: Array<[string, string]> = [
    [join(evalDir, "eval.yaml"), EVAL_TEMPLATE.replaceAll("__SKILL__", skill)],
    [
      join(tasksDir, "scenario-typical.yaml"),
      TASK_TYPICAL_TEMPLATE.replaceAll("__SKILL__", skill),
    ],
    [
      join(tasksDir, "scenario-edge.yaml"),
      TASK_EDGE_TEMPLATE.replaceAll("__SKILL__", skill),
    ],
  ];

  for (const [path, body] of writes) {
    let exists = true;
    try {
      await Deno.stat(path);
    } catch (_) {
      exists = false;
    }
    if (exists && !force) {
      console.error(`skip (exists): ${path}    — pass --force to overwrite`);
      continue;
    }
    await Deno.writeTextFile(path, body);
    console.log(`${exists ? "wrote (forced)" : "created"}: ${path}`);
  }

  console.log(`\nNext: edit ${tasksDir} to fill in scenarios,`);
  console.log(`then run \`waxa evals/eval.yaml\` from inside ${cwd}.`);
}

// ---- Main ----------------------------------------------------------------

// ---- audit sub-command (composition: apm + waxa-specific) ----------------

interface AuditFinding {
  level: "error" | "warn" | "info";
  source: "waxa" | "apm";
  rule: string;
  message: string;
  path?: string;
  line?: number;
}

function parseFrontmatter(body: string): {
  meta: Record<string, string> | null;
  bodyLines: number;
} {
  const m = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: null, bodyLines: body.split("\n").length };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) {
      let v = kv[2].trim();
      // strip surrounding quotes
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      }
      meta[kv[1]] = v;
    }
  }
  return { meta, bodyLines: body.slice(m[0].length).split("\n").length };
}

async function checkWaxaQuality(skillDir: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const skillMdPath = join(skillDir, "SKILL.md");

  let body: string;
  try {
    body = await Deno.readTextFile(skillMdPath);
  } catch (_) {
    findings.push({
      level: "error",
      source: "waxa",
      rule: "missing-skill-md",
      message: `SKILL.md not found at ${skillMdPath}`,
      path: skillMdPath,
    });
    return findings;
  }

  const { meta, bodyLines } = parseFrontmatter(body);
  if (!meta) {
    findings.push({
      level: "error",
      source: "waxa",
      rule: "missing-frontmatter",
      message: "SKILL.md has no YAML frontmatter (--- ... ---)",
      path: skillMdPath,
    });
  } else {
    if (!meta.name) {
      findings.push({
        level: "error",
        source: "waxa",
        rule: "frontmatter-name-missing",
        message: "frontmatter `name` field is required",
        path: skillMdPath,
      });
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.name)) {
      findings.push({
        level: "error",
        source: "waxa",
        rule: "frontmatter-name-shape",
        message:
          `name "${meta.name}" must be lowercase alphanumeric + hyphens (no leading/trailing/double hyphens)`,
        path: skillMdPath,
      });
    }
    if (!meta.description) {
      findings.push({
        level: "error",
        source: "waxa",
        rule: "frontmatter-description-missing",
        message: "frontmatter `description` field is required",
        path: skillMdPath,
      });
    } else {
      if (meta.description.length > 1024) {
        findings.push({
          level: "error",
          source: "waxa",
          rule: "frontmatter-description-too-long",
          message: `description is ${meta.description.length} chars (max 1024)`,
          path: skillMdPath,
        });
      }
      // Accept project-track trigger phrases ("Use when", "Use ONLY when",
      // "Use after", "When ...", "After ...") and meta-track equivalents
      // ("Invoke ONLY when", "Activate during", "Consult when", "Read when").
      if (
        !/\b(use|invoke|activate|consult|read)(\s+\w+)*\s+(when|after|during|to)\b|^(when|after|during)\s/i
          .test(meta.description)
      ) {
        findings.push({
          level: "warn",
          source: "waxa",
          rule: "frontmatter-description-trigger",
          message:
            "description should be triggering-condition-shaped (start with 'Use when...', 'When...', 'After...')",
          path: skillMdPath,
        });
      }
    }
  }

  // body length
  if (bodyLines > 500) {
    findings.push({
      level: "warn",
      source: "waxa",
      rule: "body-too-long",
      message: `SKILL.md body is ${bodyLines} lines (>500). Consider moving reference material to references/.`,
      path: skillMdPath,
    });
  }

  // "When NOT to use" section detection — accept markdown headers
  // (`## When NOT to use`), plain-text section markers (`When NOT to use:`),
  // and Meta-skill anti-trigger phrasings (`Do NOT use for:`,
  // `Do NOT auto-invoke ...`, `Do NOT use this skill for ...`).
  const hasWhenNot = /^(#+\s*)?when\s+not\s+to\s+(use|invoke|activate):?$/im.test(body);
  const hasDoNot =
    /^(#+\s*)?do\s+not\s+(use|invoke|activate|auto-invoke)\b/im.test(body) ||
    /^do\s+not\s+(use|invoke|activate|auto-invoke)\b/im.test(body);
  if (!hasWhenNot && !hasDoNot) {
    findings.push({
      level: "warn",
      source: "waxa",
      rule: "missing-when-not-to-use",
      message: "no 'When NOT to use' / 'When not to invoke' section found",
      path: skillMdPath,
    });
  }

  // scripts/ suspicious pattern
  const scriptsDir = join(skillDir, "scripts");
  try {
    for await (const entry of Deno.readDir(scriptsDir)) {
      if (!entry.isFile) continue;
      const p = join(scriptsDir, entry.name);
      const text = await Deno.readTextFile(p);
      const susPatterns: Array<[string, RegExp]> = [
        ["pipe-to-shell", /\b(curl|wget|fetch)\b[^\n]*\|\s*(sh|bash|zsh)\b/i],
        ["eval-call", /\beval\s*[\(`]/],
        ["hardcoded-openai-key", /\bsk-[A-Za-z0-9]{20,}\b/],
        ["hardcoded-anthropic-key", /\bsk-ant-[A-Za-z0-9-]{20,}\b/],
        ["hardcoded-bearer", /\bBearer\s+[A-Za-z0-9._-]{20,}/],
      ];
      const lines = text.split("\n");
      for (const [rule, re] of susPatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            findings.push({
              level: "error",
              source: "waxa",
              rule: `suspicious-script:${rule}`,
              message: `${rule} in ${entry.name}: ${lines[i].trim().slice(0, 80)}`,
              path: p,
              line: i + 1,
            });
          }
        }
      }
    }
  } catch (_) {
    // scripts/ missing — fine, not all skills have scripts
  }

  // LICENSE existence (info only)
  let hasLicense = false;
  for (const candidate of ["LICENSE", "LICENSE.txt", "LICENSE.md", "license"]) {
    try {
      await Deno.stat(join(skillDir, candidate));
      hasLicense = true;
      break;
    } catch (_) { /* try next */ }
  }
  if (!hasLicense) {
    findings.push({
      level: "info",
      source: "waxa",
      rule: "no-skill-license",
      message:
        "no LICENSE / LICENSE.txt / LICENSE.md at skill dir (skill-finder rubric will treat this as a license-axis fail)",
    });
  }

  return findings;
}

async function runApmAudit(skillMdPath: string): Promise<AuditFinding[]> {
  // best-effort: skip silently if apm is not on PATH
  try {
    const which = new Deno.Command("which", { args: ["apm"], stdout: "piped", stderr: "null" });
    const r = await which.output();
    if (!r.success) return [];
  } catch (_) {
    return [];
  }
  try {
    const cmd = new Deno.Command("apm", {
      args: ["audit", "--file", skillMdPath, "--format", "json"],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout } = await cmd.output();
    const text = new TextDecoder().decode(stdout);
    if (!text.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return [
        {
          level: "warn",
          source: "apm",
          rule: "audit-output-unparseable",
          message: `apm audit returned non-JSON output (head: ${text.slice(0, 80)})`,
          path: skillMdPath,
        },
      ];
    }
    // apm audit JSON shape may vary across versions. Try a few keys.
    const findings: AuditFinding[] = [];
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.findings)
      ? ((parsed as Record<string, unknown>).findings as unknown[])
      : Array.isArray((parsed as Record<string, unknown>)?.results)
      ? ((parsed as Record<string, unknown>).results as unknown[])
      : [];
    for (const it of items) {
      const obj = it as Record<string, unknown>;
      findings.push({
        level: (obj.level as AuditFinding["level"]) ?? "warn",
        source: "apm",
        rule: String(obj.rule ?? obj.id ?? "apm-finding"),
        message: String(obj.message ?? obj.description ?? JSON.stringify(obj)),
        path: obj.path as string | undefined,
        line: obj.line as number | undefined,
      });
    }
    return findings;
  } catch (e) {
    return [
      {
        level: "warn",
        source: "apm",
        rule: "audit-subprocess-error",
        message: `apm audit failed: ${(e as Error).message}`,
        path: skillMdPath,
      },
    ];
  }
}

async function runAudit(args: string[]) {
  if (args.length === 0 || args[0].startsWith("-")) {
    console.error("Usage: waxa audit <skill-dir> [--no-apm] [--json]");
    Deno.exit(2);
  }
  const skillDir = resolve(args[0]);
  const noApm = args.includes("--no-apm");
  const asJson = args.includes("--json");

  const findings: AuditFinding[] = [];
  findings.push(...(await checkWaxaQuality(skillDir)));
  if (!noApm) {
    findings.push(...(await runApmAudit(join(skillDir, "SKILL.md"))));
  }

  if (asJson) {
    console.log(JSON.stringify({ skill_dir: skillDir, findings }, null, 2));
  } else {
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of findings) counts[f.level]++;
    console.log(`audit: ${skillDir}`);
    console.log(
      `  errors=${counts.error}  warnings=${counts.warn}  info=${counts.info}`,
    );
    for (const f of findings) {
      const loc = f.path
        ? ` (${f.path.replace(skillDir + "/", "")}${f.line ? ":" + f.line : ""})`
        : "";
      const icon = f.level === "error" ? "✗" : f.level === "warn" ? "⚠" : "·";
      console.log(`  ${icon} [${f.source}/${f.rule}] ${f.message}${loc}`);
    }
  }
  Deno.exit(findings.some((f) => f.level === "error") ? 1 : 0);
}

async function main() {
  const sub = Deno.args[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.error("Usage:");
    console.error("  waxa init [--skill <name>] [--force]                          scaffold <skill>/evals/");
    console.error("  waxa audit <skill-dir> [--no-apm] [--json]                    skill quality + apm audit (composition)");
    console.error("  waxa <eval.yaml> [--task <id>] [--baseline]                   single run (--baseline runs with_skill + without_skill)");
    console.error("  waxa iterate <eval.yaml> [--max N] [--task <id>]              iteration loop");
    console.error("  waxa compare <eval.yaml> --models <csv> [--task <id>]         multi-model comparison");
    console.error("  waxa variant <eval.yaml> --base <skill> --candidate <skill>   skill A/B exploration");
    Deno.exit(sub ? 0 : 1);
  }

  if (sub === "init") {
    await runInit(Deno.args.slice(1));
    return;
  }
  if (sub === "audit") {
    await runAudit(Deno.args.slice(1));
    return;
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
  const withBaseline = Deno.args.includes("--baseline");
  const { results } = await runEval(sub, { taskFilter, withBaseline });
  Deno.exit(results.every((r) => r.passRate === 1) ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
