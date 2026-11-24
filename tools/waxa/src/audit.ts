/** `waxa audit`: waxa quality checks composed with `apm audit`. */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ExitCode } from "./args.ts";
import { runProcess } from "./process.ts";

// ---- audit sub-command (composition: apm + waxa-specific) ----------------

export interface AuditFinding {
  level: "error" | "warn" | "info";
  source: "waxa" | "apm";
  rule: string;
  message: string;
  path?: string;
  line?: number;
}

export function parseFrontmatter(body: string): {
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

export async function checkWaxaQuality(skillDir: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const skillMdPath = join(skillDir, "SKILL.md");

  let body: string;
  try {
    body = await readFile(skillMdPath, "utf8");
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
    for (const entry of await readdir(scriptsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const p = join(scriptsDir, entry.name);
      const text = await readFile(p, "utf8");
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
      await stat(join(skillDir, candidate));
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

export async function runApmAudit(skillMdPath: string): Promise<AuditFinding[]> {
  // best-effort: skip silently if apm is not on PATH
  let text: string;
  try {
    text = (await runProcess("apm", ["audit", "--file", skillMdPath, "--format", "json"])).stdout;
  } catch (_) {
    return [];
  }
  try {
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

export async function runAudit(args: string[]) {
  if (args.length === 0 || args[0].startsWith("-")) {
    console.error("Usage: waxa audit <skill-dir> [--no-apm] [--json]");
    throw new ExitCode(2);
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
  throw new ExitCode(findings.some((f) => f.level === "error") ? 1 : 0);
}
