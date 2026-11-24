/** `waxa init`: scaffold <skill>/evals/. */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExitCode, flagValue } from "./args.ts";

// ---- Scaffolding (`waxa init`) ------------------------------------------

export const EVAL_TEMPLATE = `name: __SKILL__-eval
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

export const TASK_TYPICAL_TEMPLATE = `# Median scenario — the most common shape of the user request this skill
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

export const TASK_EDGE_TEMPLATE = `# Edge scenario — a known failure mode the skill is supposed to handle.
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

export async function runInit(args: string[]) {
  const force = args.includes("--force");
  const skillFromFlag = flagValue(args, "--skill");
  const cwd = process.cwd();

  // 0.2.0 layout: scaffold `<cwd>/evals/` (skill-local). The user
  // typically runs `waxa init` from inside the skill's own directory,
  // so cwd's basename gives the skill name. SKILL.md is expected at
  // `<cwd>/SKILL.md` (the runner resolves it via resolveLayout()).
  const skill = skillFromFlag ?? cwd.split("/").filter(Boolean).pop();
  if (!skill) {
    console.error("could not infer skill name; pass --skill <name>");
    throw new ExitCode(2);
  }

  // SKILL.md sanity check (warn only, don't block — the user may be
  // scaffolding the eval before authoring the skill body).
  try {
    await stat(join(cwd, "SKILL.md"));
  } catch (_) {
    console.error(
      `[warn] ${cwd}/SKILL.md not found; \`waxa <eval.yaml>\` will fail until it exists.`,
    );
  }

  const evalDir = join(cwd, "evals");
  const tasksDir = join(evalDir, "tasks");
  await mkdir(tasksDir, { recursive: true });

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
      await stat(path);
    } catch (_) {
      exists = false;
    }
    if (exists && !force) {
      console.error(`skip (exists): ${path}    — pass --force to overwrite`);
      continue;
    }
    await writeFile(path, body);
    console.log(`${exists ? "wrote (forced)" : "created"}: ${path}`);
  }

  console.log(`\nNext: edit ${tasksDir} to fill in scenarios,`);
  console.log(`then run \`waxa evals/eval.yaml\` from inside ${cwd}.`);
}
