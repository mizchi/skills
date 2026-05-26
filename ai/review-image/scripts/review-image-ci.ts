#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read

import { parseArgs, reviewImage } from "./review-image.ts";

export interface CiReviewResult {
  decision: "pass" | "fail";
  summary: string;
  issues: string[];
  model: string;
  usage?: unknown;
  rawText: string;
}

export function buildCiPrompt(prompt: string): string {
  return [
    "Review this image as a CI gate for visual regressions and invalid inputs.",
    `Task:\n${prompt}`,
    "Return strict JSON only.",
    "Use this schema:",
    `{
  "decision": "pass" | "fail",
  "summary": "short summary",
  "issues": ["issue 1", "issue 2"]
}`,
    "Mark fail when the image is blank, corrupted, obviously malformed, suspicious, severely broken, or clearly mismatched against the task.",
    "Mark pass only when the image looks valid enough to continue the pipeline.",
  ].join("\n\n");
}

export function parseCiReviewText(raw: string): Omit<CiReviewResult, "model" | "usage" | "rawText"> {
  const jsonText = extractJsonObject(raw);
  const parsed = JSON.parse(jsonText) as {
    decision?: unknown;
    summary?: unknown;
    issues?: unknown;
  };

  return {
    decision: parsed.decision === "pass" ? "pass" : "fail",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0)
      : [],
  };
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Response did not contain a JSON object");
  }
  return candidate.slice(start, end + 1);
}

function printUsage(): void {
  console.error(`review-image-ci.ts\n\nUsage:\n  ./review-image-ci.ts <image-path-or-url> <prompt> [--model <openrouter-model>]\n\nBehavior:\n  - prints strict JSON suitable for CI\n  - exits 0 on pass\n  - exits 2 when the model returns fail`);
}

if (import.meta.main) {
  try {
    if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
      printUsage();
      Deno.exit(0);
    }

    const parsed = parseArgs(Deno.args.filter((arg) => arg !== "--json"));
    const result = await reviewImage({
      ...parsed,
      prompt: buildCiPrompt(parsed.prompt),
      json: true,
    });
    const ci = parseCiReviewText(result.text);
    const output: CiReviewResult = {
      ...ci,
      model: result.model,
      usage: result.usage,
      rawText: result.text,
    };

    console.log(JSON.stringify(output, null, 2));
    if (output.decision === "fail") {
      Deno.exit(2);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
