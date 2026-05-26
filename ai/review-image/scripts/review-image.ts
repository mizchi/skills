#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read

const DEFAULT_MODEL_FALLBACK = "google/gemini-2.5-flash-lite";
const DEFAULT_API_URL_FALLBACK = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_SYSTEM_PROMPT =
  "You are a strict image reviewer. Explain obvious visual regressions, suspicious or invalid inputs, corruption, broken layout, and mismatches against the given prompt.";

export interface ParsedArgs {
  image: string;
  prompt: string;
  model: string;
  apiUrl: string;
  json: boolean;
}

export interface ReviewResult {
  id?: string;
  model: string;
  text: string;
  usage?: unknown;
  raw?: unknown;
}

export function parseArgs(args: string[]): ParsedArgs {
  let model = defaultModel();
  let apiUrl = defaultApiUrl();
  let json = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      printUsage();
      Deno.exit(0);
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length) || model;
      continue;
    }
    if (arg === "--model") {
      model = requireValue(args[++index], "--model");
      continue;
    }
    if (arg.startsWith("--api-url=")) {
      apiUrl = arg.slice("--api-url=".length) || apiUrl;
      continue;
    }
    if (arg === "--api-url") {
      apiUrl = requireValue(args[++index], "--api-url");
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length < 2) {
    throw new Error("Usage: review-image.ts <image-path-or-url> <prompt> [--model <openrouter-model>] [--json]");
  }

  return {
    image: positional[0]!,
    prompt: positional.slice(1).join(" ").trim(),
    model,
    apiUrl,
    json,
  };
}

export async function reviewImage(args: ParsedArgs): Promise<ReviewResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENROUTER_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY (or OPENROUTER_KEY) is not set");
  }

  const imageUrl = await resolveImageInput(args.image);
  const response = await fetch(args.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://github.com/mizchi/skills",
      "X-Title": Deno.env.get("OPENROUTER_APP_NAME") ?? "mizchi-skills review-image",
    },
    body: JSON.stringify(buildRequestBody({
      model: args.model,
      prompt: args.prompt,
      imageUrl,
    })),
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}\n${JSON.stringify(body, null, 2)}`);
  }

  const json = await response.json();
  const text = extractAssistantText(json);
  return {
    id: typeof json?.id === "string" ? json.id : undefined,
    model: typeof json?.model === "string" ? json.model : args.model,
    text,
    usage: json?.usage,
    raw: json,
  };
}

export function buildRequestBody(input: { model: string; prompt: string; imageUrl: string }): Record<string, unknown> {
  return {
    model: input.model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: input.prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: input.imageUrl,
            },
          },
        ],
      },
    ],
  };
}

export function extractAssistantText(payload: unknown): string {
  const firstChoice = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const content = firstChoice?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => {
        if (typeof part === "string") return [part];
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return [part.text];
        }
        return [];
      })
      .join("\n")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }
  throw new Error("OpenRouter response did not contain text content");
}

export function inferMimeType(pathOrUrl: string): string {
  const normalized = pathOrUrl.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".bmp")) return "image/bmp";
  if (normalized.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${base64Encode(bytes)}`;
}

function defaultModel(): string {
  try {
    return Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL_FALLBACK;
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return DEFAULT_MODEL_FALLBACK;
    throw error;
  }
}

function defaultApiUrl(): string {
  try {
    return Deno.env.get("OPENROUTER_API_URL") ?? DEFAULT_API_URL_FALLBACK;
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return DEFAULT_API_URL_FALLBACK;
    throw error;
  }
}

async function resolveImageInput(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:")) {
    return pathOrUrl;
  }
  const bytes = await Deno.readFile(pathOrUrl);
  return bytesToDataUrl(bytes, inferMimeType(pathOrUrl));
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage(): void {
  console.error(`review-image.ts\n\nUsage:\n  ./review-image.ts <image-path-or-url> <prompt> [--model <openrouter-model>] [--json]\n\nExamples:\n  ./review-image.ts ./screenshot.png "Check whether this VRT diff looks broken"\n  ./review-image.ts ./input.webp "Is this image invalid or suspicious?" --model google/gemma-3-4b-it`);
}

if (import.meta.main) {
  try {
    const args = parseArgs(Deno.args);
    const result = await reviewImage(args);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.text);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
