#!/usr/bin/env -S npx tsx
import { resolve } from "node:path";
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  createReadOnlyTools,
} from "@mariozechner/pi-coding-agent";

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("Usage: npx tsx summarize.ts <directory>");
  process.exit(1);
}

const targetDir = resolve(process.cwd(), targetArg);

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  cwd: targetDir,
  // Factory form binds cwd explicitly — avoids the readOnlyTools constant trap
  // (which would capture process.cwd() at import time).
  tools: createReadOnlyTools(targetDir),
  // In-memory session: no .jsonl is written to disk.
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt(
  `Summarize the directory at ${targetDir}. ` +
    `Use the read, grep, find, and ls tools to inspect files. ` +
    `Report the project's purpose, main entry points, key modules, ` +
    `and any notable conventions. Keep it concise.`,
);

process.stdout.write("\n");
