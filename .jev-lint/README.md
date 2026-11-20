# Skill Consistency Checks

The CLI is pinned to `jev-lint@0.8.0` in package.json and pnpm-lock.yaml.
The upstream user-facing skill is pinned to `mizchi/jev-lint/skills/jev-lint#v0.8.0`
in apm.yml and apm.lock.yaml, deployed to `.agents/skills/` and `.claude/skills/`.
The repository does not maintain a fork of that skill.

```sh
just --justfile skill-lint.justfile install
just --justfile skill-lint.justfile install-skill
just --justfile skill-lint.justfile plan
just --justfile skill-lint.justfile check
just --justfile skill-lint.justfile translations-plan
just --justfile skill-lint.justfile translations
```

Live checks require `TYPESAFE_API_KEY` or `TYPESAFEAI_API_KEY` in the environment.
Keep credentials outside configuration and records. Plan commands make no model
requests. Each live command records its answers; exit 1 means candidates were
reported, while request failures and incomplete document comparisons remain
distinct from a clean result.

## Scope and Conventions

`scripts/skill-lint.mjs` selects top-level SKILL.md and SKILL-ja.md through Git,
including untracked additions. Ignored personal skills, scratch clones, installed
upstream skills and example copies are excluded. A missing tracked skill is an
error. At introduction this selects 76 maintained skills and 16 Japanese companions.

The rules compare each complete entrypoint against the shared
[authoring contract](authoring-contract.md). They do not impose identical headings
on different domains or apply essay-style prose rules to instruction manuals.
Supporting reference files and embedded external documentation are outside this
entrypoint scan. YAML syntax and generated README checks remain deterministic
repository checks.

| Rule | Checks | Cutoff |
| --- | --- | --- |
| text/description-body-contract | An advertised behavior versus a body restriction that makes it impossible | 0.36 |
| text/description-trigger-policy | Meta descriptions require explicit user intent; Project descriptions accept relevant symptoms without the exact skill name | 0.565 |
| text/instructions-consistent | Required actions that conflict under the same conditions | 0.70 |
| text/terminology-consistent | Incompatible meanings of an operational term within one workflow | 0.35 |

All are informational candidates requiring inspection. Read the source before
changing a skill. Do not raise thresholds or add ignore directives to hide a
finding; preserve a demonstrated false positive as a labelled calibration case.

`scripts/lint-translations.mjs` regenerates documents.json from every maintained
English/Japanese pair. Each pair has a complete-document comparison and a focused
frontmatter comparison with the bodies supplied as context. This catches activation
drift that can be overlooked in a comparison dominated by unchanged body text.
The command rejects unpaired Japanese companions and missing frontmatter names.

## Rule Evaluation

```sh
just --justfile skill-lint.justfile test
just --justfile skill-lint.justfile eval    # live, three passes
just --justfile skill-lint.justfile replay  # offline
```

The original three rules' 45 labelled fixtures contain 17 defects and 28 controls, including explicit
exceptions, scoped alternatives, quoted incorrect examples, Japanese text, and
three real false-positive controls. The accepted three-pass records have 17 true
positives, zero false positives, zero false negatives, and no decision flips.
These measurements describe this corpus; the [audit](AUDIT.md) separately reviews
results on repository skills the initial corpus had not seen.

The added description-trigger policy comes from `optimizing-descriptions`.
Its first development run missed a Meta capability summary that omitted the
explicit-request gate. The revised question checks the description itself;
relying on a later body restriction is insufficient for description-based
selection. It does not replace the full skill or measure an installed agent's
actual invocation rate.

Seven development examples, each run three times, separated at clean <= 0.19
and bad >= 0.94. The fixed midpoint is 0.565. A separate synthetic evaluation
suite has 16 cases (7 defects, 9 controls), with TP 7 / FP 0 / FN 0 and no
decision flips over three passes. The unrelated appendices preserve both a
clean and a bad decision. These examples have wide margins, so the rule carries
an explicit `inconclusive` declaration: cutoff-boundary accuracy and drift
sensitivity are not established. The evaluated sources, raw answers and accepted
record are kept in its directory; the two development attempts are under
`development/` and `development-v2/`.

## Mandatory controls when authoring rules

Every new or revised rule must carry `case-coverage.json` with three kinds of
explicitly labelled case:

- `false-positive-risk`: a clean case that resembles a violation, including
  legitimate exceptions or narrower scope.
- `false-negative-risk`: a violation that superficially looks acceptable.
- `unrelated`: a different concern or irrelevant information that must not
  create or repair this rule's defect. Prefer paired variants on both clean
  and bad inputs, preserving their operative prefix and expected label.

The names describe the errors the cases guard against, not invented observed
misclassifications. Scope-only filtering is not evidence that a model ignores
irrelevant material; this rule's appendix controls are actually sent to Jev.
Paired decisions are controls, not statistical proof of zero correlation.

`pnpm lint:rule-cases` and `pnpm test:skill-lint` reject missing categories,
wrong clean/bad labels, missing/duplicate inputs, implicit default labels and
changed operative prefixes in declared pairs. Live/plan skill scans run the
same coverage check first. The `plan`, `check`, `eval` and `replay` recipes also
require it. Expected labels and reasons stay in sidecars, never in fixtures.
This repository stores `expect.yml` in JSON syntax, which is valid YAML, so the
offline coverage checker can read the same explicit labels without a new parser
dependency.

Run evaluation from inside `.jev-lint/`, as the package scripts do: v0.8.0's text
directory matching loses the leading dot of relative hidden-directory roots and
can otherwise produce zero fixture subjects. Verify subject counts before any
claim about a rule's coverage.

CI keeps the offline calibration replay and also runs a separate
[current-content review](../docs/skill-review-ci.md) for changed skill documents
and their English/Japanese pairs. PR inputs are read as blobs by base-branch
tooling; proposed code and configuration do not receive the model secret.
Historical audit records are not used as fresh answers to edited text.
Translation replay validates snapshot freshness:

```sh
pnpm lint:translations --replay .jev-lint/translations-current.json
```

The original [upstream workflow](https://github.com/mizchi/jev-lint/tree/v0.8.0/skills/jev-lint)
defines rule authoring, calibration and record/replay behavior.

## Tool Adoption Policy

Devbox and dotenvx are optional: use them for existing adoption or explicit user
selection, following [CLAUDE.md](../CLAUDE.md#tool-adoption-policy). The policy
manifest binds that instruction to nine affected entrypoints, examples and
templates, independently of the editorial rules:

```sh
just --justfile skill-lint.justfile policy-plan
just --justfile skill-lint.justfile policy
pnpm lint:tool-policy --replay .jev-lint/tool-policy-audit.json
```

The current post-policy translation record is `translations-current.json`.
`translations-audit.json` retains the initial, pre-policy snapshot and is expected
to fail freshness validation after the policy edits.

## Upstream freshness

The [freshness workflow](../docs/skill-freshness.md) fetches official evidence,
checks deterministic source/target drift, then runs shipped `jev-lint docs`
comparisons for declared topics. It does not ask semantic rules to guess remote
API behavior. See `skill-freshness.justfile` for plan/check/test/explicit accept.
The categorical controls and three recorded passes are in `freshness-fixtures/`.
An accepted snapshot is separate from the local text-rule baseline and does not
suppress a changed upstream source.
