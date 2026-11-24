/** Spawning the executor (`claude -p`) and other subprocesses. */
import { spawn } from "node:child_process";

// ---- Executor ------------------------------------------------------------

export async function executeClaude(
  prompt: string,
  model: string,
  timeoutSec: number,
  systemPrompt =
    "You are a blank-slate executor. Follow the instructions in the user message exactly. Do not introduce yourself, do not append meta commentary, do not invoke external tools.",
): Promise<string> {
  // WAXA_CLAUDE_BIN swaps the executor binary (tests use a fake claude).
  const bin = process.env.WAXA_CLAUDE_BIN ?? "claude";
  const { code, stdout, stderr } = await runProcess(
    bin,
    [
      "-p",
      "--output-format",
      "text",
      "--model",
      model,
      "--no-session-persistence",
      "--disable-slash-commands",
      "--system-prompt",
      systemPrompt,
    ],
    { input: prompt, timeoutMs: timeoutSec * 1000 },
  );
  if (code !== 0) {
    throw new Error(
      `${bin} exit ${code}; stderr=${stderr.slice(0, 500)}; stdout=${stdout.slice(0, 200)}`,
    );
  }
  return stdout;
}

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a process, write `input` to stdin, and collect stdout/stderr.
 * Rejects when the binary cannot be started (ENOENT, EACCES) or the timeout
 * fires, so callers see a real error instead of an empty output.
 */
export function runProcess(
  command: string,
  args: string[],
  opts: { input?: string; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`failed to start ${command}: ${e.message}`));
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolvePromise({
        code: code ?? (signal ? 128 : 1),
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
    // A child that exits before reading stdin raises EPIPE; the close handler reports it.
    child.stdin.on("error", () => {});
    child.stdin.end(opts.input ?? "");
  });
}
