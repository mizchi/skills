#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openState, select, statePath, type Entry } from "./registry.mts";

const usage = "pane.mts run NAME -- COMMAND [ARG ...] | capture NAME | close NAME";
function main() {
  const [action, name, ...rest] = process.argv.slice(2);
  if (action === "--help") return console.log(usage);
  if (!name || (action === "run" ? rest[0] !== "--" || !rest[1] :
      !["capture", "close"].includes(action) || rest.length !== 0)) throw new Error(usage);
  const session = process.env.REX_SESSION;
  if (!session) throw new Error("Set REX_SESSION to the intended Rex session ID");
  const cwd = process.cwd();
  const file = statePath();
  const db = openState(file);
  try {
    // Two callers checking the same anchor must not both create a split.
    db.exec("BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT * FROM panes WHERE session=? AND cwd=? AND name=?")
      .all(session, cwd, name) as Entry[];
    const view = JSON.parse(execFileSync("rex", ["session", "inspect", session, "--json"], {encoding: "utf8"}));
    const {anchor, entry} = select(view, process.env.REX_BLOCK, rows);
    let block = entry?.block;
    if (action === "run") {
      const command = JSON.stringify({args: rest.slice(1), path: process.env.PATH});
      if (!entry) {
        const token = randomUUID();
        const runner = fileURLToPath(new URL("./worker.mts", import.meta.url));
        block = execFileSync("rex", ["split", "-s", session, "-b", anchor, "--split=right",
          "--focus=false", "--label", name, "-c", cwd, "--shell=none", "--",
          process.execPath, runner, file, token], {encoding: "utf8"}).trim();
        db.prepare("INSERT OR REPLACE INTO panes VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)")
          .run(session, cwd, name, anchor, block, token, command);
      } else if (entry.command !== command || entry.finished === entry.revision) {
        db.prepare("UPDATE panes SET command=?, revision=revision+1 WHERE token=?").run(command, entry.token);
      }
    } else if (!entry) {
      throw new Error(`No managed pane named ${name} for this directory and anchor`);
    } else if (action === "close") {
      db.prepare("DELETE FROM panes WHERE token=?").run(entry.token);
    }
    db.exec("COMMIT");
    if (action === "capture") execFileSync("rex", ["capture", "-s", session, "-b", block!, "--trim"], {stdio:"inherit"});
    else console.log(block);
  } finally {
    db.close();
  }
}
try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
