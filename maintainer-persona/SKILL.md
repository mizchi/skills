---
name: maintainer-persona
description: Write an issue or PR for a repository you do not own so its maintainers can triage it. Measures the target's own history (reviewers, gates, body length, headings, language, how first-time PRs fare) into an editable persona file, branches by context (OSS first-time / OSS returning / another team inside your org), drafts in Japanese and translates only after approval when the target writes English, checks with a fresh reader and a slop lint baselined on the maintainers' own PRs, and gates the send. Use when filing upstream issues, sending a fix or failing-test PR to another project or team, or rewriting a submission that was ignored.
---

# Maintainer Persona

The shape of a submission is a property of the target repository, not of the
finding. Body length, title convention, whether a test is expected, who reviews
and how outsiders are treated all differ between repositories, and all of them
are measurable from the target's own history. In one large OSS project the
median merged PR body was 1,683 characters, every title carried a
conventional-commit prefix, and 17 of the 18 PRs from first-time authors were
closed without a human reply. Measure the target, keep the numbers in a file,
and write to them.

## When to use

- Filing an issue or PR in a repository whose maintainers are not you.
- Sending a failing test or a fix to another team inside your organisation.
- A submission was ignored, split, or asked to be rewritten, and you want to
  know why before the next one.

Not for: your own repositories, or deciding whether a finding is true. Verify
the finding first (§3); a readable wrong mechanism does more harm than an
unreadable one, because the reader believes it.

## Paths

Set `SK` to the directory containing this `SKILL.md`, and run every command
from your working repository (where `personas/` lives):

```bash
SK=<directory of this SKILL.md>      # e.g. ~/.claude/skills/maintainer-persona
S=$SK/scripts
A=$SK/../ai-index/scripts/slopscore.py
```

`ai-index`, `natural-writing-ja` and `natural-writing-en` are sibling skills
(`$SK/../<name>`). If one is missing, install it (`apm install -g
mizchi/skills/<name>`); if that is not possible, report the step as skipped.
Never substitute your own judgement for a missing lint.

## The pipeline

| Step | Output | Stop if |
|---|---|---|
| 0. Measure | `personas/<owner>/<repo>.md`, context line | `gh` cannot read the repo |
| 1. Complete the persona by hand | sections 1-7 of the file | — |
| 2. Branch by context | which rules of §2 apply | the code belongs to another repo or team: measure that one from step 0 |
| 3. Verify the facts | pinned version, re-read lines | a claim fails re-verification |
| 4. Draft (working language) | `draft.ja.md` | — |
| 5. User approves the draft | explicit OK on content | not approved |
| 6. Translate if the target writes English, then slop check | `draft.en.md` | lint fails the corpus baseline |
| 7. Fresh reader | pass / rewrite | any pre-set failure criterion hits |
| 8. Gate and send | the issue / PR | `check-draft.ts` errors, or no final OK |

Every step that sends text outside (step 8, and any comment or edit later) needs
the user's confirmation at that moment. Approval of the Japanese draft is not
approval to send.

## 0. Measure

```bash
node $S/measure.ts acme/widget --corpus personas/acme/widget.corpus
# -> created personas/acme/widget.md (oss, first-time, public, en)
```

Node 24+, an authenticated `gh`, read-only. It writes a measured block into the
persona file and, with `--corpus`, the bodies of the merged PRs it sampled.
Options: `--prs 100 --issues 50` sample size, `--relation oss|internal` to
override the guess, `--as <login>` to measure standing for another account,
`--out` for another path.

The context line has four values:

- **relation**: `internal` when the repository is private/internal or you are a
  member of the owning organisation, otherwise `oss`. A public repository of
  your own company is `internal` — override it if the readers really are
  outsiders.
- **standing**: `first-time` until you have a merged PR there.
- **exposure**: `public` or `private`. This decides what may appear in the
  text, independently of relation.
- **language**: `ja` / `en` / `mixed`, from the share of merged PR and issue
  bodies containing kana (kanji alone is not counted; it may be Chinese).

Read the measured block before writing anything. The rows that most often
change the plan:

- **author association table.** `NONE` is an author with no prior contribution.
  In one large OSS project, 18 of 18 such PRs in the sample were closed
  unmerged and 17 never got a human response, while `CONTRIBUTOR` PRs had a
  10-hour median first response. That row decides whether to open a PR at all.
- **p90 body length.** The ceiling for your visible text. Evidence beyond it
  goes in one `<details>`.
- **headings.** The skeleton they actually use. A PR template shows as a heading
  counted in almost every PR.
- **touches a test file / links a closing issue / signed-off.** Whether a PR
  without a test, without `Closes #N`, or without DCO sign-off looks normal.
- **rules.** Required approvals and checks. Zero required checks does not mean
  they merge red.

Re-run the same command to refresh. Only the measured block is replaced;
everything you wrote by hand is kept. If the markers were deleted, the script
refuses rather than overwrite.

## 1. Complete the persona by hand

The script cannot see meaning. Fill sections 1-7 of the file from their
artifacts, not from your impression of the field:

1. **Readers**: who triages, who reviews which directory (CODEOWNERS, assignees,
   `git log --format=%an -- <dir>`), what they care about.
2. **Vocabulary usable bare**: terms that occur in their README, labels, issues.
   Cite where.
3. **Needs translating**: your terms, with their terms. Grep each of your key
   words in their repo; a word with zero hits goes here. This table is what
   stops coinages.
4. **Issue conventions** and 5. **PR conventions**: from 5-10 recent merged
   items and their review comments. The same person asks for the mechanism in an
   issue and for test counts and green CI in a PR; measure them separately.
6. **Landmines**: what gets a submission closed or deferred there.
7. **Evidence and weak spots**: commands run, items read, rows resting on two
   examples.

**Measurements transfer; prescriptions do not.** Who reviews and what gates
exist do not depend on your finding. What to add and where scope ends do. A
persona built with a hypothesis in its brief returned that hypothesis as advice,
and it was false. If a subagent builds the persona, do not put your hypothesis
in the brief, and when you pass a quote, pass what it was the result of
("grep of one file found nothing", not "the mechanism does not exist").

The persona file lives in your working repository (commit it there), never in
the target. Edit it whenever a submission teaches you something; that is what
it is for.

## 2. Branch by context

| | OSS, first-time | OSS, returning | Another team, same org |
|---|---|---|---|
| Read first | CONTRIBUTING in full, the issue templates, the `NONE` / `FIRST_TIME_CONTRIBUTOR` rows | your own past PRs there and what reviewers asked you to change | CODEOWNERS / assignees per directory; which tracker the team actually uses |
| Open with | an issue, when first-time PRs go unanswered or CONTRIBUTING asks for one; a PR on an issue labelled `help wanted` / `good first issue` otherwise | a PR, if their norm is PR-first | their tracker, not yours; name the addressee when there is no single owner |
| CI | fork PRs from first-time contributors wait for a maintainer to approve workflow runs, so run their CI locally and paste the result | as measured | required checks from the rules row; paste known reds before they see them |
| Legal | CLA bot or `Signed-off-by` ratio; sign before opening | already done | none usually |
| Size | below their median; one change per PR | their median | their median |
| Drafts | avoid; outsider drafts are rarely reviewed | as measured | as measured; check whether their ruleset reviews drafts at all |
| Links | public only | public only | links into your private repos may be unreadable to them (`check-draft.ts` warns) |
| Tone | no @-mentions of maintainers, no "urgent", no severity words they do not use | same | no priority labels; they own priority |

Exposure overrides relation: an internal team's **public** repository publishes
every word. Internal hostnames, customer and project code names, private
repository names and links stay out, and `check-draft.ts` fails on the last two.

## 3. Verify the facts before writing

1. Fetch every clone you cite and pin the version (`branch @ short-sha`, line
   numbers of that version) in the same sentence. A stale clone agrees with
   itself, so citation checks cannot catch it.
2. Search their tracker for the mechanism: issues **and open PRs**, unmerged
   branches, design docs. Fixes sit in open PRs for weeks.
3. Every "X does not exist" is re-searched case-insensitively across the whole
   tree, including other layers, dependencies and branches. The absence claim is
   where the defect usually is.
4. Before proposing a fix, look for code that declares the state you are about
   to allow impossible (grep the type or variant name, not `unwrap`).
5. State one confidence level for the whole text: reproduced in the target's
   own environment / reproduced locally / not reproduced, static reading only.

## 4. Draft

Draft in the user's working language (Japanese) into `draft.ja.md`, already in
the target's shape.

- **Title**: `[scope] <what breaks, no identifiers> — <mechanism, shortest>`.
  The first half decides whether a reader thinks it is theirs.
- **First two lines**, before any heading:
  `**Problem**: <what breaks, one sentence, no identifiers>` and
  `**Impact**: <who and what, in their severity vocabulary>`.
- Then their skeleton (persona §4/§5, measured headings) in this order:
  version pin and confidence; what you searched for duplicates; mechanism in
  their `file:line` and their words; consequence; scope and how it was counted;
  2-4 options, recommended first, each with its cost, asking for **one**
  decision; the close condition; one `<details>` with the evidence.
- The visible part must be enough to decide. `<details>` is for evidence, not
  for anything more important than the body.

Writing rules that apply in both languages:

- No coinages, including English-flavoured ones. Only persona §2 words go bare;
  persona §3 gives the translations.
- No vocabulary from your own project, tooling or process.
- Tools are not the subject: "with this input, X happens", not "the model
  found a counterexample".
- No investigation history or correction log in the body. Replace wrong text
  with right text; keep your audit trail in your own repo.
- No blanket guarantees ("all of the below was measured"); readers stop checking.
- If you delegate part of the content to another issue, remove it from this one.

Then apply `natural-writing-ja` and run `python3 $A --lang ja draft.ja.md`, and show it
to the user.

## 5. Approval

Ask the user to approve the **content** of `draft.ja.md`. Apply their edits to
the Japanese draft, not to a translation, so there is one source of truth until
it is approved.

## 6. Translate and slop-check (target language `en` or `mixed`)

Skip to step 7 when the persona says `ja`. For `mixed`, follow the language of
the directory or template you are filing against, and ask when unclear.

1. Translate the approved draft into `draft.en.md`. Rewrite into the target's
   English conventions (their headings, their title prefix) rather than
   mirroring Japanese sentence order. Do not add content that was not approved;
   if the translation needs a new claim, go back to step 5.
2. Apply `natural-writing-en`.
3. Lint against the maintainers' own writing:

   ```bash
   python3 $A --lang en --baseline personas/acme/widget.corpus/*   # their tells: p50, max
   python3 $A --lang en draft.en.md
   ```

   Pass only when the lint exits 0 **and** the draft's tell count is at most the
   corpus maximum. Exit 0 alone is not enough: a deliberately sloppy draft with
   two tells over budget exits 0, while the 32 merged bodies of one project never
   exceeded one.
4. Show the English text to the user together with the lint numbers.

## 7. A fresh reader

Give a new subagent only the persona file and the draft (re-read from disk or,
for an edit, fetched live from the tracker; never an older snapshot). It may read
the target's source; it may not read your notes or other findings. Decide the
failure criteria before running it. Rewrite if the reader:

- cannot tell whether it is theirs without guessing;
- cannot name a concrete next step;
- states a trigger condition that contradicts the body;
- fills in the version, confidence, scope or trigger by guessing;
- objects to something the body already answers (the answer is buried);
- judges severity one level or more away from the Impact line.

Readers often find a heavier defect than the author did. Keep the reader's
measurements; re-verify its explanations the same way you verified your own.
Its correction can point the wrong way.

## 8. Gate and send

```bash
node $S/check-draft.ts --persona personas/acme/widget.md draft.en.md
```

It fails when a public target's text references a repository its readers cannot
open (private, or unresolvable), and warns when the body is longer than the
measured p90 or references another owner's private repository from a private
target.

Then:

- Show the final text and ask for explicit confirmation to send it now.
- Always pass `--repo owner/name` to `gh`. While investigating, the working
  directory is often the upstream clone, and `gh` defaults to it.
- Check the target's visibility at send time (`gh repo view --json visibility`),
  not from memory.
- Write the body from a file checked in the same shell step:
  `node $S/check-draft.ts ... draft.en.md && gh issue create --repo ... --body-file draft.en.md`.
  A check that only prints and lets the command continue publishes the violation.

## When a submission was ignored or rewritten

Re-run `measure.ts` (the block refreshes; your notes stay), then compare the
submission you sent with the measured block, one row at a time: length against
p90, your headings against theirs, your title against their title convention,
and your author-association row (did anyone in that row get a response?). Read
the review or close comment, if any, for what they asked for. Write each
difference you find into persona §6 (Landmines) with the submission's link, then
rewrite from step 4. Do not re-send the same text with a bump comment.

## PRs: extra rules

- Rewrite your reproduction into their test style and commit-message style.
  Your reproduction is for you to read; the PR is for them to read.
- A Red commit (failing test) followed by a Green commit (fix) only where
  test-only PRs are welcome. Where test-only PRs have been closed unmerged
  before, ship the fix with the test, and never mix a new
  test harness into a fix PR.
- Prove the test runs in their CI. A workspace whose default build target
  cannot run on the CI host does not even build tests; if you could not run it,
  say why and what is needed.
- Run their gates locally first (formatter check, linter, workflow lint,
  repo-specific rule scripts) and verify a rule checker actually sees your file
  by planting a violation and removing it.
- Do not commit files generated while verifying: property-test regression seeds
  are replayed forever and turn their CI red.
- Count the cost of the fix (paths no longer covered, values no longer
  recorded, precedent it splits) and ask for that decision in the PR.
- If a Red already exists in their open PR, stack the Green on it instead of
  opening another.
- Label where release notes are generated from labels; reply to automated review
  comments with the commit hash if that is their habit.

## Files

| Path | Role |
|---|---|
| `scripts/measure.ts` | fetch history via `gh`, write/refresh the measured block and corpus |
| `scripts/check-draft.ts` | pre-send gate: unreadable references, length vs p90 |
| `scripts/persona.ts` | pure logic (summaries, classification, rendering, merge) |
| `scripts/*_test.ts` | `node --test 'scripts/*_test.ts'` |

Related skills: `natural-writing-ja`, `natural-writing-en`, `ai-index`
(slop lint and its limits), `upstream-fix-and-pin` (keeping your project moving
while the upstream PR is pending).
