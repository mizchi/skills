/** The Self-report block requested from the executor, and its parser. */
import type { PhaseEntry, SelfReport, UnclearPoint } from "./types.ts";

// ---- Self-report extraction ---------------------------------------------

export const SELF_REPORT_REQUEST = `

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

export function extractSelfReport(output: string): SelfReport | null {
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
