/** Console output, per-task result files and benchmark.json. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task, TaskResult } from "./types.ts";

export function printTaskResult(idx: number, total: number, r: TaskResult) {
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
export async function persistTaskOutputs(
  iterDir: string,
  task: Task,
  result: TaskResult,
  config: "with_skill" | "without_skill",
): Promise<void> {
  const taskDir = join(iterDir, task.id, config);
  await mkdir(taskDir, { recursive: true });

  for (const trial of result.trials) {
    await writeFile(
      join(taskDir, `output-trial-${trial.trial}.txt`),
      trial.output,
    );
  }

  const durations = result.trials.map((t) => t.durationMs);
  const timingMean = durations.reduce((a, x) => a + x, 0) / Math.max(1, durations.length);
  await writeFile(
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
  await writeFile(
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

export function stats(rs: TaskResult[]) {
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

export async function writeBenchmark(
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
  await writeFile(outFile, JSON.stringify(benchmark, null, 2) + "\n");
  return outFile;
}
