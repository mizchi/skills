#!/usr/bin/env -S deno run -A
/**
 * Minimal waza-schema-compatible runner.
 *
 * Executes eval.yaml + tasks/*.yaml against `claude -p --bare` for a
 * bias-free executor, then runs text/code graders on the output.
 *
 * Status: prototype. Not feature-parity with `waza run`.
 *
 *   deno run -A evals/runner/run.ts evals/skill-selector/eval.yaml
 */
import { parse as parseYaml } from "jsr:@std/yaml@1";
import { dirname, fromFileUrl, join, resolve } from "jsr:@std/path@1";
import { expandGlob } from "jsr:@std/fs@1";

interface Metric {
  name: string;
  weight: number;
  threshold: number;
  description?: string;
}

interface Grader {
  name: string;
  type: "text" | "code";
  config: Record<string, unknown>;
}

interface EvalConfig {
  name: string;
  description?: string;
  skill: string;
  version?: string;
  config?: { trials_per_task?: number; timeout_seconds?: number; model?: string };
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
  expected?: { output_contains?: string[] };
  graders?: Grader[];
}

interface GraderResult {
  name: string;
  pass: boolean;
  score: number;
  message?: string;
  durationMs: number;
}

interface TaskResult {
  taskId: string;
  taskName: string;
  output: string;
  graders: GraderResult[];
  passRate: number;
  durationMs: number;
}

async function loadYaml<T>(path: string): Promise<T> {
  return parseYaml(await Deno.readTextFile(path)) as T;
}

async function findRepoRoot(start: string): Promise<string> {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    try {
      await Deno.stat(join(dir, ".waza.yaml"));
      return dir;
    } catch (_) { /* try parent */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate repo root (.waza.yaml) walking up from ${start}`);
}

async function loadSkillBody(repoRoot: string, skillName: string): Promise<string> {
  return await Deno.readTextFile(join(repoRoot, skillName, "SKILL.md"));
}

async function executeClaude(
  prompt: string,
  model: string,
  timeoutSec: number,
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
        "You are a blank-slate executor. Follow the instructions in the user message exactly. Do not introduce yourself, do not append meta commentary, do not invoke external tools.",
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

function compileRegex(pattern: string): RegExp {
  // Translate Go-style inline flags `(?i)` / `(?im)` to JS flags.
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
  // Best-effort waza-compat shim. Translates a few Python idioms to JS so
  // assertions like `len(output) > 200` and `'foo' in output` work with
  // `new Function`.
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
      const jsExpr = pythonToJs(expr);
      const fn = new Function("output", `return (${jsExpr});`);
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

async function runTask(
  repoRoot: string,
  evalDir: string,
  evalCfg: EvalConfig,
  task: Task,
): Promise<TaskResult> {
  const start = performance.now();
  const skillBody = await loadSkillBody(repoRoot, evalCfg.skill);
  const model = evalCfg.config?.model ?? "sonnet";
  const timeout = evalCfg.config?.timeout_seconds ?? 300;
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
    `- deliverable のみを返答する (前置き・自己紹介・冗長な確認は不要)`,
    `- 内部で skill を読んだ前提で書く`,
  ].join("\n");

  console.log(`  [${task.id}] executing claude (model=${model}, timeout=${timeout}s)...`);
  let output = "";
  try {
    output = await executeClaude(prompt, model, timeout);
  } catch (e) {
    output = `[runner-error] ${(e as Error).message}`;
  }

  const allGraders: Grader[] = [...(evalCfg.graders ?? []), ...(task.graders ?? [])];
  const graderResults: GraderResult[] = allGraders.map((g) =>
    g.type === "text" ? gradeText(g, output) : gradeCode(g, output)
  );
  graderResults.unshift(gradeOutputContains(task.expected?.output_contains, output));

  const passes = graderResults.filter((r) => r.pass).length;
  const passRate = graderResults.length === 0 ? 1 : passes / graderResults.length;

  return {
    taskId: task.id,
    taskName: task.name,
    output,
    graders: graderResults,
    passRate,
    durationMs: Math.round(performance.now() - start),
  };
}

async function main() {
  const evalPath = Deno.args[0];
  if (!evalPath) {
    console.error("Usage: run.ts <eval.yaml> [--task <task-id>]");
    Deno.exit(1);
  }
  const taskFilter = Deno.args.includes("--task")
    ? Deno.args[Deno.args.indexOf("--task") + 1]
    : undefined;

  const evalCfg = await loadYaml<EvalConfig>(evalPath);
  const evalDir = dirname(resolve(evalPath));
  const repoRoot = await findRepoRoot(evalDir);

  console.log(`Eval: ${evalCfg.name}`);
  console.log(`Skill: ${evalCfg.skill}`);
  console.log(`Repo root: ${repoRoot}`);
  console.log("");

  const tasks: Task[] = [];
  for (const pattern of evalCfg.tasks ?? []) {
    for await (const f of expandGlob(pattern, { root: evalDir })) {
      if (!f.isFile) continue;
      const t = await loadYaml<Task>(f.path);
      if (!taskFilter || t.id === taskFilter || t.name === taskFilter) tasks.push(t);
    }
  }

  if (tasks.length === 0) {
    console.error("No tasks matched.");
    Deno.exit(2);
  }

  const results: TaskResult[] = [];
  for (const task of tasks) {
    console.log(`[${results.length + 1}/${tasks.length}] ${task.name}`);
    const r = await runTask(repoRoot, evalDir, evalCfg, task);
    results.push(r);
    for (const g of r.graders) {
      const mark = g.pass ? "✓" : "✗";
      console.log(`    ${mark} ${g.name} score=${g.score.toFixed(2)} ${g.message ?? ""}`);
    }
    console.log(`  pass_rate=${(r.passRate * 100).toFixed(0)}% (${r.durationMs}ms)`);
    console.log("");
  }

  const overall = results.reduce((a, r) => a + r.passRate, 0) / results.length;
  console.log("===========================================");
  console.log(`Overall pass rate: ${(overall * 100).toFixed(1)}% (${results.length} task(s))`);
  console.log("===========================================");

  // Persist JSONL
  const resultsDir = join(repoRoot, "results");
  await Deno.mkdir(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(resultsDir, `${evalCfg.name}-${stamp}.jsonl`);
  const lines = results.map((r) =>
    JSON.stringify({
      eval: evalCfg.name,
      skill: evalCfg.skill,
      task_id: r.taskId,
      task_name: r.taskName,
      pass_rate: r.passRate,
      duration_ms: r.durationMs,
      graders: r.graders,
      output: r.output,
    })
  );
  await Deno.writeTextFile(outFile, lines.join("\n") + "\n");
  console.log(`Results written: ${outFile}`);

  Deno.exit(results.every((r) => r.passRate === 1) ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
