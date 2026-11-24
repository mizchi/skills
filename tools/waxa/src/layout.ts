/** Locating SKILL.md, eval files and the results directory; loading YAML and tasks. */
import { glob, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EvalConfig, Task } from "./types.ts";

// ---- Helpers -------------------------------------------------------------

export async function loadYaml<T>(path: string): Promise<T> {
  return parseYaml(await readFile(path, "utf8")) as T;
}

export async function findRepoRoot(start: string): Promise<string> {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    try {
      await stat(join(dir, ".waxa.yaml"));
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
export interface LayoutPaths {
  baseDir: string; // dirname(evalPath)
  skillDir: string; // directory containing SKILL.md
  skillMdPath: string;
  workspaceRoot: string; // for results/<skill>/iteration-N/
  resultsDir: string; // <workspaceRoot>/results/<skill>/
  layout: "skill-local" | "monorepo-legacy";
}

export async function resolveLayout(
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
      await stat(skillMdPath);
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

  // monorepo legacy: <repo-root>/<paths.skills or "">/<skill>/SKILL.md
  const workspaceRoot = await findRepoRoot(baseDir);
  const marker = await loadYaml<{ paths?: { skills?: string } } | null>(
    join(workspaceRoot, ".waxa.yaml"),
  ).catch(() => null);
  const skillDir = join(workspaceRoot, marker?.paths?.skills ?? "", evalCfg.skill);
  return {
    baseDir,
    skillDir,
    skillMdPath: join(skillDir, "SKILL.md"),
    workspaceRoot,
    resultsDir: join(workspaceRoot, "results", evalCfg.skill),
    layout: "monorepo-legacy",
  };
}

export async function nextIterationNumber(resultsDir: string): Promise<number> {
  try {
    let max = 0;
    for (const entry of await readdir(resultsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const m = entry.name.match(/^iteration-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  } catch (_) {
    return 1;
  }
}


export async function loadTasks(
  evalCfg: EvalConfig,
  evalDir: string,
  taskFilter?: string,
): Promise<Task[]> {
  const tasks: Task[] = [];
  for (const pattern of evalCfg.tasks ?? []) {
    const matches: string[] = [];
    for await (const rel of glob(pattern, { cwd: evalDir })) matches.push(join(evalDir, rel));
    // Sort for a stable task order across platforms (glob order is not specified).
    for (const path of matches.sort()) {
      if (!(await stat(path)).isFile()) continue;
      const t = await loadYaml<Task>(path);
      if (!taskFilter || t.id === taskFilter || t.name === taskFilter) tasks.push(t);
    }
  }
  return tasks;
}
