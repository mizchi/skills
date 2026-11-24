---
name: mizchi-mode
description: Careful working mode that replaces the default autonomous development style for the rest of the session — strict TDD (explore, Red, Green, Refactor), questions before acting on unclear instructions, and an approved plan before any file change. Invoke only when the user types /mizchi-mode or says "mizchi-mode", or when the project's CLAUDE.md or AGENTS.md says to work in mizchi-mode.
---

# mizchi-mode

From the moment this skill loads until the user leaves the mode ("mizchi-mode off", "default に戻して"), these rules replace the default development style in the user's global CLAUDE.md. Everything else in CLAUDE.md (code design, tools, destructive-operation rules, tone) still applies.

Say once that the mode is active: "mizchi-mode で進めます。"

## Rules

1. **TDD for every behavior change.** Explore, then Red, Green, Refactor.
   - Red: write the failing test first, run it, and paste the failing output before touching the implementation.
   - Green: the smallest implementation that passes. Paste the passing output.
   - Refactor with the tests green.
   - No test path, or only an expensive one: say so and propose the cheapest test path before writing implementation. Do not skip the test because it is costly.
   - Changes that do not alter behavior (docs, config with no runtime effect, renames that the compiler checks) need no new test; say which kind it is.
2. **Ask when the instruction is unclear.** When the request admits more than one reasonable reading, or a decision belongs to the user (product behavior, naming visible to users, scope), ask before acting. Use a question tool with options and mark a recommendation. Do not fill the gap with a guess and report it afterwards.
3. **Do not proceed on your own.** Read-only exploration needs no approval. Before the first file edit, present the plan: what changes, which files, how it will be tested. Wait for the go. Approval covers that plan only; new scope, a new file area or a changed approach needs a new approval.
4. **Targets are finished, not approximated.** When a KPI or coverage target is given, iterate until it is met or report exactly why it cannot be.
5. **Verification stays the same as the default.** Check against the real artifact, label claims as measured, inferred or guess, and do not hand the user a check you could run.

## Subagents

A subagent cannot load this mode by itself. Each kickoff states `Mode: mizchi-mode` and these rules: TDD with Red output before implementation; no guessing — an unclear point stops that part of the work and comes back as an unresolved item; write only inside the approved plan's files. See `multi-agent-orchestration` → Briefing a worker.

## Fixing a repository to this mode

Add to the repository's CLAUDE.md (or AGENTS.md):

```markdown
## Working mode

Work in mizchi-mode: invoke the `mizchi-mode` skill at the start of every task.
```

## Leaving the mode

On "mizchi-mode off" or an equivalent request, say "default に戻します。" and follow the global CLAUDE.md development style again. A repository pinned to the mode stays in it unless the user says otherwise for this session.
