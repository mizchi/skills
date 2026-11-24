---
name: mizchi-skill
description: Use at the start of a software task to find and load the matching skill from mizchi/skills — repository setup, CI and GitHub Actions, releases and npm publishing, OSS docs and changelogs, dependency updates, testing, Playwright and flaky tests, Cloudflare, AWS or Kubernetes deploys, SQL, Nix, task runners (pkfire, just), MoonBit, Gleam or TypeScript practice, frontend review, OpenTelemetry, technical writing, project retrospectives and KPIs. Skip it when an installed skill already matches or the request is a one-line answer.
---

# mizchi-skill

One installed skill that stands in for the whole mizchi/skills catalog. It finds the skill that fits the task and
loads it on demand, so the other skills need not be installed or listed in every session.

## Route a task

1. **Search the catalog.** From this skill's base directory, grep for two to four words of the task's job:
   `grep -n -i -E 'deploy|cloudflare' references/catalog.md`. Read the whole catalog only when grep finds nothing
   plausible.
2. **Choose at most two skills** whose "Use for" describes the task's job, not merely a shared word. Skip rows marked
   *explicit only* unless the user named that skill or its job. When nothing fits, continue without a skill.
3. **Load it.** If the skill is already in your list of available skills, invoke it with the Skill tool. Otherwise
   run `bash scripts/fetch_skill.sh <name>` from this skill's base directory, read `<printed dir>/SKILL.md`, and
   follow it as if it had been invoked. Resolve its relative links and scripts against the printed directory.
4. **Say which skill you loaded**, in one line, before acting on it: "Using `npm-release` for the publish setup."

`fetch_skill.sh` prefers an installed copy, then `$MIZCHI_SKILLS_DIR`, then a shallow clone of
github.com/mizchi/skills in `~/.cache/mizchi-skills`. It installs nothing. When the user relies on one skill often,
suggest `apm install -g mizchi/skills/<name>`; do not install it unasked.

## Common mistakes

| Mistake | Instead |
|---|---|
| Loading a skill because one word matches ("release" in a question about React) | match the task's job against "Use for" |
| Loading three or more skills "to be safe" | at most two; each one costs context |
| Loading an *explicit only* skill on your own | wait for the user to ask for it or its job |
| Skipping step 4 | the user should see which instructions you are following |

## Maintenance

`python3 scripts/gen_catalog.py` regenerates `references/catalog.md` from the repository README and each SKILL.md;
`--check` fails when it is stale (part of `pkf run test`). `python3 scripts/test_catalog.py` tests both scripts.
