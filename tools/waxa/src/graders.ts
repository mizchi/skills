/** Graders: text (regex), code (JS expression), self-report, llm (judge). */
import { executeClaude } from "./process.ts";
import type { Grader, GraderResult, SelfReport } from "./types.ts";

// ---- Graders -------------------------------------------------------------

export function compileRegex(pattern: string): RegExp {
  const m = pattern.match(/^\(\?([imsux]+)\)(.*)$/);
  if (m) {
    const flags = m[1].replace(/[xu]/g, "");
    return new RegExp(m[2], flags);
  }
  return new RegExp(pattern);
}

export function gradeText(grader: Grader, output: string): GraderResult {
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

export function pythonToJs(expr: string): string {
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

export function gradeCode(grader: Grader, output: string): GraderResult {
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

export function gradeOutputContains(expected: string[] | undefined, output: string): GraderResult {
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

export function gradeSelfReport(grader: Grader, sr: SelfReport | null): GraderResult {
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

/** The prompt sent to the LLM judge for one output and rubric. */
export function buildJudgePrompt(output: string, rubric: string): string {
  return [
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
    rubric,
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
}

/** Parse "PASS: yes / SCORE: 90 / REASON: ..." into a 0-1 score; a missing SCORE follows PASS. */
export function parseJudgeResponse(resp: string): { pass: boolean; score: number; reason: string } {
  const pass = /PASS:\s*yes/i.test(resp);
  const sm = resp.match(/SCORE:\s*(\d+)/);
  const score = sm ? parseInt(sm[1], 10) / 100 : pass ? 1 : 0;
  const reason = resp.match(/REASON:\s*(.+)/)?.[1]?.trim().slice(0, 240) ?? "";
  return { pass, score, reason };
}

export async function gradeLlm(
  grader: Grader,
  output: string,
  judgeModel: string,
): Promise<GraderResult> {
  const start = performance.now();
  const cfg = grader.config as { rubric: string };
  let verdict = { pass: false, score: 0, reason: "" };
  try {
    verdict = parseJudgeResponse(
      await executeClaude(buildJudgePrompt(output, cfg.rubric), judgeModel, 90),
    );
  } catch (e) {
    verdict.reason = `judge-error: ${(e as Error).message.slice(0, 200)}`;
  }
  return {
    name: grader.name,
    pass: verdict.pass,
    score: verdict.score,
    message: verdict.reason || undefined,
    durationMs: Math.round(performance.now() - start),
  };
}
