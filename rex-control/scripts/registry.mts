import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";

export function statePath() {
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "rex-control", "panes.sqlite");
}

export function openState(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = 15000;
    CREATE TABLE IF NOT EXISTS panes (
      session TEXT, cwd TEXT, name TEXT, anchor TEXT, block TEXT, token TEXT UNIQUE,
      command TEXT, revision INTEGER, finished INTEGER,
      PRIMARY KEY (session, cwd, name, anchor)
    );`);
  return db;
}

export type Entry = { anchor: string; block: string; token: string; command: string; revision: number; finished: number };
type Window = { window_id: string; focused_block_id: string; layers: { blocks: {block_id: string}[] }[] };
type View = { active_window_id: string; windows: Window[] };

export function select(view: View, hint: string | undefined, saved: Entry[]): {anchor: string; entry?: Entry} {
  const windows = new Map<string, string>();
  for (const w of view.windows) for (const layer of w.layers) {
    for (const b of layer.blocks) windows.set(b.block_id, w.window_id);
  }
  const live = saved.filter(p => windows.has(p.block) &&
    (!windows.has(p.anchor) || windows.get(p.anchor) === windows.get(p.block)));
  function at(anchor: string) {
    const entry = live.find(p => p.anchor === anchor || p.block === anchor);
    return entry ? { anchor: entry.anchor, entry } : { anchor };
  }
  if (hint && windows.has(hint)) return at(hint);
  if (live.length === 1) return at(live[0].block);
  const active = live.filter(p => windows.get(p.block) === view.active_window_id);
  if (active.length === 1) return at(active[0].block);
  const editors = saved.filter(p => windows.has(p.anchor));
  if (!live.length && editors.length === 1) return at(editors[0].anchor);
  const focused = view.windows.find(w => w.window_id === view.active_window_id)?.focused_block_id;
  if (focused && windows.has(focused)) return at(focused);
  throw new Error("No placed Rex pane is available in this session");
}
