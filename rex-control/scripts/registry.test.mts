import assert from "node:assert/strict";
import test from "node:test";
import {select, type Entry} from "./registry.mts";

const window = (id: string, focus: string, ...ids: string[]) => ({
  window_id: id, focused_block_id: focus, layers: [{blocks: ids.map(block_id => ({block_id}))}],
});
const saved: Entry = {anchor:"editor", block:"monitor", token:"token", command:"{}", revision:1, finished:0};
const other = window("other", "shell", "shell");
const view = {active_window_id:"other", windows:[window("project", "editor", "editor", "monitor"), other]};

test("a stale block can reuse the managed pane in a background tab", () => {
  assert.deepEqual(select(view, "closed", [saved]), {anchor:"editor", entry:saved});
});
test("a live editor in another tab gets its own pane", () => {
  assert.deepEqual(select(view, "shell", [saved]), {anchor:"shell"});
});
test("use the surviving editor after its side pane closes", () => {
  assert.deepEqual(select({...view, windows:[window("project", "editor", "editor"), other]}, "closed", [saved]),
    {anchor:"editor"});
});
test("first use without a block starts at the active tab", () => {
  assert.deepEqual(select(view, undefined, []), {anchor:"shell"});
});
