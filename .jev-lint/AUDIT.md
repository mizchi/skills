# Skill Consistency Audit — 2026-11-15

The later [freshness review](../docs/skill-freshness-audit-2026-11-16.md)
checks upstream API and distribution drift separately from these semantic-rule
records. It also aligns maintained Node requirements and examples with Node 24+.
Classifier records describe their recorded source snapshots, not a guarantee
that later changes have passed the same comparisons.

## MoonBit update

Five maintained skills were reviewed against the latest three release articles
(2026-08-19 v0.10.9, 2026-09-21 v0.10.14, and 2026-11-05 v0.10.19):
moonbit-practice, moonbit-js-binding, ts2moonbit-migration,
cloudflare-mbt-worker-bundle, and sqlc-gen-moonbit-safety. Related configuration,
script, FFI, testing, and Marketplace references were updated too.
The [release baseline](../moonbit-practice/reference/updates.md) explicitly gives
newer applicable articles precedence and records the replaced runner, script,
cancellation, derive, configuration, and array guidance. The stale implicit-core
import advice and remaining JSON-deprecation claim were corrected too.

[Focused record](moonbit-current.json): all 15 comparisons answered, no findings
at the MoonBit update snapshot. [Full entrypoint record](skills-current.json):
276 answers, refreshed after the Node 24 alignment; 252 answers came from
the content cache and 24 were reassessed for eight changed source inputs.
The existing upstream-fix-and-pin terminology candidate remains unchanged.
This classifier checks instruction consistency, not MoonBit API correctness.

Compiler checks use `moonc v0.10.20+65efd5b93`, rather than claiming a v0.10.19
execution environment. `just --justfile moonbit.justfile test` passes nine
language/library cases on each of Wasm, JS, and Native, configured script runs
through `moon run` and `moonx`, a native archive/C-host check, and 16 JS binding
tests. The original JS fixture failed when spreading a MoonBit `Array` into
JS; replacing that boundary with `FixedArray` passes, including empty arrays
and ordered Promise results. The JS example now pins external async 0.22.7:
the new cancellation test failed on 0.21.0 because `handle_cancellation` was
unavailable, then passed on the current runtime. It checks cleanup, uncaught
cancellation, persistent task state and protected async work.

Two temporary compiler controls also failed as expected: removing `Type::..`
from an external non-exhaustive match, and adding a known constructor without
an explicit arm. Both produced `partial_match` diagnostics under `--deny-warn`.
The unchanged fixture passes. Older external adapter and Nix overlay integrations
retain explicit verification limits in their references.

The [upgrade procedure](../moonbit-practice/reference/upgrading.md) adds toolchain
selection, manifest migration, dependency compatibility, conditional fix-driver
use, and final API/CI validation. A temporary legacy executable failed its initial
JSON-manifest check, then passed after two formatter runs. The second pass
converted migrated `is-main` to `pkgtype`; the program still returned `42`, and
`--no-mbti` did not write an interface. Upgrade commands were inspected through
help; the shared toolchain and unreleased fix driver were not changed.

## Markdown Link Checks

[The lychee setup](../docs/markdown-links.md) checks maintained Markdown
independently of the semantic classifiers. The local scan covers 559 files,
including references and Japanese companions, with no remaining file or heading
errors. Seven integration tests cover source selection, Markdown parsing, broken
files/fragments, offline isolation, HTTP failures, and stale-report prevention.

The external scan still reports seven failures: six references into the private
`mizchi/mnemo` repository and one Cloudflare community URL returning 403. These
require authenticated or manual review; their HTTP results do not establish
whether the private files exist. No global 403/404 acceptance hides these results.
PR checks run offline; manual and weekly checks retain external failure reports.
The source exclusions cover classifier fixture documents with artificial links,
not ordinary documentation in fixture directories.

## Current Tool Policy

The user subsequently decided that neither devbox nor dotenvx is a default.
[CLAUDE.md](../CLAUDE.md#tool-adoption-policy) now makes existing adoption or
explicit user selection the condition for using either tool. Choosing another
setup no longer requires explaining why devbox was rejected.

The Nix and dotenvx entrypoints, their Japanese companions, the selection catalog,
description example and bootstrap guidance follow this policy. Nix evaluation
scenarios now cover an explicit devbox choice and preservation of an existing
toolchain. CD templates accept ordinary CI environment credentials without
requiring dotenvx, an encrypted file, or its private key.

Current verification:

- [Tool-policy report](tool-policy-audit.json): nine comparisons answered, all
  supporting the policy, with no missing or unassessed comparisons.
- [Updated translation report](translations-current.json): all 32 comparisons
  answered; both Nix and dotenvx pairs and their activation comparisons agree.
  Remaining flags concern other, unchanged skills and require source review.
- [Updated entrypoint scan](skills-current.json): 276 answers, no missing answers;
  the remaining candidate is the previously reviewed upstream-fix-and-pin SHA wording.
- CD credential regression tests: four tests, 34 assertions; the original
  dotenvx-dependent templates failed them, and the updated templates pass.

Run `just --justfile skill-lint.justfile policy-plan` before a live `policy`
check. The following sections retain the initial findings from before this
policy change; their old snapshots are historical and are not current-source
certificates. The earlier recommendation to bring Japanese Nix guidance into
line with a devbox default is superseded by the user's decision.

## Initial Findings

The repository is not fully uniform. Three English/Japanese pairs disagree about
activation conditions, and two canonical entrypoints are primarily Japanese
despite the repository's English-source policy. Follow-up source inspection also
confirms a workflow-policy difference in nix-setup and an ambiguous SHA selection
in upstream-fix-and-pin. Existing skill content was reviewed without rewriting
domain instructions.

## Coverage and Evidence

| Check | Coverage | Result |
| --- | --- | --- |
| Custom semantic rules | 76 maintained skills + 16 Japanese companions; 276 answers | One terminology candidate; no missing answers, silent rules, or suppressions |
| Full translation + focused activation comparisons | 16 pairs, 32 comparisons, 32 answers | Five contradictory comparison results covering four skills; one unassessed comparison |
| Rule calibration | 45 labelled cases × three passes | 17 TP, 0 FP, 0 FN; no decision flips; no blind/unstable suite |
| Source selection | New, tracked, translated, ignored, nested and missing sources | Two automated regression tests pass |
| Canonical prose language | Manual review after excluding code fences | Two policy differences confirmed |

The five translation flags are not five independent defects: apm-usage has both a
full-document and a frontmatter flag. Source inspection confirms activation drift
in three skills and a workflow-policy difference in nix-setup, described below.
The classifier leaves the dotenvx activation comparison unassessed, so its recorded
document report remains `partial`; all 32 requests returned answers. Follow-up
inspection classifies that item as missing activation detail rather than a
contradiction. The raw classifier record is preserved, including its unassessed
result, separately from the source-review conclusion.

- [Current entrypoint answers](skills-audit.json)
- [Current translation report and source digests](translations-audit.json)
- [Earlier three-pass review of initial candidates](skills-review.json)
- Accepted rule records: each rule's `baseline.json` under [rules/text](rules/text/)

Records describe their recorded snapshot. The ordinary `replay` command re-scores
answers; it does not certify later source edits. `docs --replay` checks source
freshness and retains contradictions and unassessed results.

## Confirmed Activation Differences

| Skill | English source | Japanese companion | Suggested alignment |
| --- | --- | --- | --- |
| [apm-usage](../apm-usage/SKILL.md) | Consult for explicit APM/configuration requests or unfamiliar CLI details; avoid automatic invocation on routine related work | [Companion](../apm-usage/SKILL-ja.md) advertises broad skill/dependency management triggers | Carry the English activation restriction into the companion description |
| [empirical-prompt-tuning](../empirical-prompt-tuning/SKILL.md) | Operator-triggered empirical evaluation; explicitly excludes reflexive use after edits | [Companion](../empirical-prompt-tuning/SKILL-ja.md) suggests use after creating or substantially revising prompts/skills | Preserve explicit invocation in the companion |
| [retrospective-codify](../retrospective-codify/SKILL.md) | Explicit request only; do not invoke at every task completion | [Companion](../retrospective-codify/SKILL-ja.md) includes ordinary end-of-task retrospection as an activation condition | Remove the automatic-completion interpretation from the companion |

The canonical bodies also retain broad, older applicability lists:
apm-usage lines 10–16, empirical-prompt-tuning lines 10–14, and
retrospective-codify lines 10–14. These lists should explicitly inherit their
description's invocation gate. Updating only Japanese descriptions would leave
the English bodies open to the same broad interpretation. This is an instruction
consistency concern; the audit does not claim that an unwanted invocation was
observed at runtime.

## Initial Workflow Policy Difference — Resolved

The first audit called nix-setup a summary-scope difference. Checking the bodies
shows a substantive choice rule as well:

- [English source](../nix-setup/SKILL.md), lines 10 and 19, makes devbox the default
  for ordinary new projects. Line 27 requires an explicit reason when choosing
  pure flakes instead.
- [Japanese companion](../nix-setup/SKILL-ja.md), lines 8–16, assumes a flake-based
  setup and includes new-project requests without the devbox selection gate.

For the same ordinary new-project request, the former companion could choose a
different setup. Both versions have now been aligned with the new opt-in policy,
removing the devbox default and the rejection-reason requirement. The earlier
description-only interpretation was too narrow.

## Canonical Language Differences

[CLAUDE.md](../CLAUDE.md) makes SKILL.md the English source of truth and permits
the Japanese-writing skill as an explicit exception. These two entrypoints have
Japanese operative prose outside code examples:

- [extract-glossary/SKILL.md](../extract-glossary/SKILL.md)
- [upstream-fix-and-pin/SKILL.md](../upstream-fix-and-pin/SKILL.md)

They can be aligned by preserving the original as SKILL-ja.md and translating the
canonical entrypoint. This audit does not treat Japanese quotations, code comments,
or the deliberate mizchi-blog-style exception as violations.

## Confirmed SHA Selection Ambiguity

[upstream-fix-and-pin](../upstream-fix-and-pin/SKILL.md) describes the transition
from a branch HEAD SHA to a merge SHA at line 3 and in its flow at line 28.
However, lines 109–111 retrieve the current `origin/main` HEAD, and line 114
calls it a merge SHA without distinguishing later main commits.

A follow-up reproduction used an isolated temporary Git repository: create a
feature branch, merge it with `--no-ff`, save that merge commit, add one later
commit on main, and update the local `origin/main` reference. The saved merge
commit differed from `git rev-parse origin/main`, while `merge-base --is-ancestor`
confirmed that the tip contained the merge. No repository history or remote was
changed. This establishes the possible mismatch independently of a model score.

The text should distinguish the PR's merge commit from a deliberately selected
later main commit and make the retrieval procedure match that choice. The
classifier scored 0.36 at a 0.35 cutoff, versus 0.32 in the earlier three-pass
review; its instability does not remove the source-level ambiguity.

## Initial Classifier Uncertainty: dotenvx — Superseded

[dotenvx/SKILL.md](../dotenvx/SKILL.md), line 3, names detailed trigger topics.
The [companion](../dotenvx/SKILL-ja.md), line 3, only summarizes the tool and its
encryption, environment-management, and GitHub Actions examples. It does not
prohibit those triggers or state an incompatible invocation gate. The bodies
cover the same operations, including the matching key-rotation sequence at
lines 92 onward.

The source-review conclusion for that snapshot was **summary detail omitted,
no demonstrated contradiction**. The new descriptions in both languages now
explicitly require existing adoption or user selection; the current translation
comparison agrees. The original partial report remains unchanged as historical
evidence, rather than fabricating agreement for an old question.

## False Positives Used to Improve the Rules

The initial description rule flagged gh-fix-ci, multi-agent-orchestration's
Japanese companion and retrospective-codify's Japanese companion. Those
within-file findings did not demonstrate description/body contradictions:
authorization can gate an advertised fix, a delegation decision can default to
one agent, and both parts of the old Japanese retrospective version share its
own activation policy. Cross-language drift is a different comparison.

The three complete documents are now labelled controls in the description rule's
fixtures. Narrowing the predicate to an actual description/body contradiction
removed those false positives without ignore directives. The final three-pass
calibration keeps all seven description defects and all fourteen controls correct.

## Freshness corrections — 2026-11-16

The [freshness follow-up](../docs/skill-freshness-audit-2026-11-16.md#修正と自動検知--追補)
resolves F01–F09 and records the executable checks and their limits.
The latest `skills-current.json` contains 276 answered subjects for 92 maintained
English/Japanese documents, with no candidates. The current translation record
contains 32 answered comparisons with no contradictions or unassessed pairs.
The previous SHA terminology and three activation differences were corrected;
the old records above remain historical snapshots.

[Upstream freshness](../docs/skill-freshness.md) is a separate gate: 82 official
source snapshots, 66 watched files across 38 skills, and 32 explicit document
comparisons in ten groups. The accepted initial snapshot has no missing or
unassessed comparisons. Source drift independently requires review even if the
model agrees. No automatic content rewrite or baseline acceptance is enabled.
The categorical document controls (4 defects, 5 clean, 1 insufficient-context)
were measured three times without a label flip. These controls are a small
regression set, not an API-wide accuracy claim.
