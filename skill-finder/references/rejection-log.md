# Rejection log

Skills evaluated through the `skill-finder` workflow and rejected for catalog promotion. Recorded so the same candidate is not re-evaluated quarterly.

Format: one entry per candidate, dated. Include the rubric axis that failed and the rationale. If the candidate becomes promotable later (license added, redundancy resolved by removing an overlapping skill), note the date and condition.

---

## anthropics/skills/skills/skill-creator

- **Date evaluated**: 2026-05-10
- **Source tier**: Tier 1 (`anthropics/skills` official)
- **License**: Apache 2.0 (passes)
- **Maintenance**: passes (last touch 2026-04-20, ~3 weeks before evaluation)
- **Frontmatter health**: passes (354 chars, triggering-condition-shaped, 5 enumerated triggers)
- **Body quality**: borderline — 485 lines (right at the SKILL.md ≤500 guideline), no dedicated "When NOT to use" section (negative triggers delegated to description-optimization loop instead)
- **Footprint**: borderline — body + `agents/` + `eval-viewer/` + `scripts/` + `references/` cross-references, demand-loaded but heavy
- **Fit**: passes (matches "create / edit / optimize / eval / benchmark a skill" use cases)
- **Non-redundancy**: **FAILS** — overlaps with the existing mizchi/skills stack:
  - skill creation TDD frame → `superpowers:writing-skills`
  - skill iteration methodology → `empirical-prompt-tuning`
  - eval loop CLI / scenarios / ledger → `waxa-eval` + `tools/waxa/`
  - description-optimization loop → covered by the `empirical-prompt-tuning` Iter 0 description / body consistency check
- **Decision**: **Reject for catalog promotion**.
- **Project-pin escape hatch**: a project that produces large numbers of skills *and* has no `superpowers` plugin / `empirical-prompt-tuning` skill installed could project-pin this with `apm install <repo>/skills/skill-creator#b9e19e6f4477`. mizchi's typical stack has all three coverage skills, so this exception is unlikely.
- **Re-evaluate trigger**: only if mizchi removes one or more of `superpowers:writing-skills` / `empirical-prompt-tuning` / `waxa-eval` from the global stack. Otherwise this entry stands indefinitely.
