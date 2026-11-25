---
name: rex-control
description: Run a local command in a reusable Rex side pane, read its output, switch the command, or close the pane from a terminal or an agent session with a stale block ID.
---

# Rex pane control

Use [pane.mts](scripts/pane.mts) with Node.js 24+ and the Rex CLI on macOS or Linux. Run it from the directory where the command should execute. Give the pane a stable name. In the examples, set `pane` to the installed script path.

```sh
pane="$HOME/.claude/skills/rex-control/scripts/pane.mts"
node "$pane" run tests -- pnpm test
node "$pane" capture tests
node "$pane" run tests -- pnpm test --watch
node "$pane" close tests
```

- **Run.** Opens a right split and leaves the editor focused. It prints the block ID as soon as Rex accepts the request. Use `capture` to see command output and the eventual exit status. A finished command can be run again in the same pane.
- **Reuse.** The same command keeps running. Changing the executable or its arguments stops the previous process group and starts the replacement in the same pane. Commands receive an argv array and the caller's PATH. Output streams to the pane. Use this for noninteractive commands such as test runners and log viewers. For a pipeline, pass `sh -c '...'` explicitly.
- **Close.** Requests shutdown of this named pane and its command group. Manually closing it in Rex also releases the pane. The next run can open it again.

Pane ownership is scoped to the working directory, Rex session, name and editor pane. If the inherited `REX_BLOCK` has disappeared, the script first looks for the registered pane in that session. A single match can be controlled while another tab is active. On first use without a valid block, the active tab supplies the anchor. To target a particular editor, pass a live `REX_BLOCK`. The script consults `rex session inspect` on each invocation and uses a private SQLite registry under `${XDG_STATE_HOME:-$HOME/.local/state}/rex-control/` to serialize concurrent launches.

A Rex shell supplies `REX_SESSION`. From another local shell, use `rex ls --json` and explicitly set `REX_SESSION` to the intended session. For direct interaction with an existing interactive terminal, use the Rex CLI with its exact block ID (`rex capture`, `rex send`, `rex send-key`). The named commands above operate on panes created by this helper.
