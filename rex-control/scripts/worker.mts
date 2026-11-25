import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { openState } from "./registry.mts";

const [file, token] = process.argv.slice(2);
const db = openState(file);
// The creating launcher commits the token after Rex returns the new block ID.
db.exec("BEGIN IMMEDIATE; COMMIT");
const latest = db.prepare("SELECT revision, command FROM panes WHERE token=?");
const finish = db.prepare("UPDATE panes SET finished=? WHERE token=? AND revision=?");
let stopping = false;
for (const signal of ["SIGINT", "SIGHUP", "SIGTERM"]) process.on(signal, () => { stopping = true; });

function start(command: {args: string[]; path?: string}, revision: number) {
  const [program, ...args] = command.args;
  const child = spawn(program, args, {
    stdio: ["ignore", "inherit", "inherit"], detached: true, env: {...process.env, PATH: command.path},
  });
  let active = true;
  const ended = new Promise<void>(done => {
    child.once("error", error => { console.error(error.message); });
    child.once("close", (code, signal) => {
      // Reap remaining group members while the process group still belongs to this job.
      if (child.pid) signalGroup(child.pid, "SIGKILL");
      active = false;
      finish.run(revision, token, revision);
      console.log(`[rex-control] exit ${signal ?? code}`);
      done();
    });
  });
  return {pid: child.pid, ended, get active() { return active; }};
}

function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

let child: ReturnType<typeof start> | undefined;
async function stopChild() {
  if (!child) return;
  if (child.active && child.pid && signalGroup(child.pid, "SIGTERM")) {
    // Descendants can outlive the group leader.
    const deadline = Date.now() + 1000;
    while (child.active && Date.now() < deadline && signalGroup(child.pid, 0)) await sleep(40);
    if (child.active) signalGroup(child.pid, "SIGKILL");
  }
  await child.ended;
  child = undefined;
}
let revision = 0;
try {
  while (!stopping) {
    const row = latest.get(token) as {revision: number; command: string} | undefined;
    if (!row) break;
    if (row.revision !== revision) {
      if (child) {
        await stopChild();
        continue; // Re-read the request after shutdown; it may have changed again.
      }
      revision = row.revision;
      child = start(JSON.parse(row.command), revision);
    }
    await sleep(150);
  }
} finally {
  await stopChild();
  db.close();
}
