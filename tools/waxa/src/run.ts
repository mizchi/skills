/** Running trials and tasks, and a whole eval (the default sub-command). */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ExitCode } from "./args.ts";
import { gradeCode, gradeLlm, gradeOutputContains, gradeSelfReport, gradeText } from "./graders.ts";
import { loadTasks, loadYaml, nextIterationNumber, resolveLayout } from "./layout.ts";
import type { LayoutPaths } from "./layout.ts";
import { persistTaskOutputs, printTaskResult, writeBenchmark } from "./output.ts";
import { executeClaude } from "./process.ts";
import { extractSelfReport, SELF_REPORT_REQUEST } from "./self-report.ts";
import type { EvalConfig, Grader, GraderResult, Task, TaskResult, TaskTrial } from "./types.ts";

// ---- Run a task ----------------------------------------------------------

/**
 * The executor prompt for one trial. With the skill, its body is injected
 * ahead of the scenario; the baseline sends the scenario alone, so the delta
 * measures what the skill body buys.
 */
export function buildTrialPrompt(opts: {
  skill: string;
  skillBody: string;
  taskPrompt: string;
  withSkill: boolean;
  requireSelfReport: boolean;
}): string {
  const tail = opts.requireSelfReport ? SELF_REPORT_REQUEST : "";
  if (!opts.withSkill) {
    return [
      `# scenario`,
      ``,
      opts.taskPrompt,
      ``,
      `# 指示`,
      `- scenario を blank-slate のまま実行する (補助 skill を読まない前提)`,
      `- まず deliverable を返答する (前置き・自己紹介・冗長な確認は不要)`,
      tail,
    ].join("\n");
  }
  return [
    `以下の skill 本文を blank-slate executor として読み、続く scenario を実行して deliverable を返せ。`,
    ``,
    `# 対象 skill: ${opts.skill}`,
    ``,
    opts.skillBody,
    ``,
    `---`,
    ``,
    `# scenario`,
    ``,
    opts.taskPrompt,
    ``,
    `# 指示`,
    `- 上の skill の指示通りに scenario を実行する`,
    `- まず deliverable を返答する (前置き・自己紹介・冗長な確認は不要)`,
    `- 内部で skill を読んだ前提で書く`,
    tail,
  ].join("\n");
}

export async function runOneTrial(
  trialNum: number,
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
  const prompt = buildTrialPrompt({
    skill: evalCfg.skill,
    skillBody,
    taskPrompt: task.inputs.prompt,
    withSkill,
    requireSelfReport,
  });

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

export async function runTask(
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


export interface RunEvalOptions {
  taskFilter?: string;
  iterTag?: string;
  modelOverride?: string;
  skillOverride?: string;
  withBaseline?: boolean;
}

export interface RunEvalResult {
  evalCfg: EvalConfig;
  layout: LayoutPaths;
  iterDir: string;
  results: TaskResult[];
  baselineResults?: TaskResult[];
}

export async function runEval(
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
  const skillBody = await readFile(layout.skillMdPath, "utf8");

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
    throw new ExitCode(2);
  }

  const iterN = await nextIterationNumber(layout.resultsDir);
  const iterDir = join(layout.resultsDir, `iteration-${iterN}`);
  await mkdir(iterDir, { recursive: true });

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
        const r = await runTask(evalCfg, task, skillBody, true);
        results[idx] = r;
        printTaskResult(idx + 1, tasks.length, r);
        await persistTaskOutputs(iterDir, task, r, "with_skill");
      }
    }
    await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, () => worker()));
  } else {
    for (const task of tasks) {
      const r = await runTask(evalCfg, task, skillBody, true);
      results.push(r);
      printTaskResult(results.length, tasks.length, r);
      await persistTaskOutputs(iterDir, task, r, "with_skill");

      if (withBaseline) {
        const rb = await runTask(evalCfg, task, skillBody, false);
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
