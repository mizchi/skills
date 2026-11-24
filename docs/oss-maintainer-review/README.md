# Maintainer review cases

[Cases (JSON Lines)](cases.jsonl) records read-only retrospective reviews of public PRs. The initial sample contains six incoming PRs from mutator and two deliberately small, single-file changes from other repositories. The latter contrast an explicitly disclosed AI-assisted FFI migration with a diagnostic fix carrying a bot review. This is a convenience sample for exercising the review skill. It cannot estimate attack frequency or identify malicious contributors.

Append an observation per PR head and review date. Keep the repository, PR URL, base and head SHAs, and source links. Preserve earlier observations after a force push or later integration. Record unavailable facts as unknown. Keep contributor claims, bot reports, PR test runs, and integration test runs attributable in the CI evidence. Links to Checks can evolve after the observation date.

An eligible decision permits isolated testing of the inspected revision. Execution, merge, and publication are separate facts. The trigger field covers workflow text in the two repository trees. External reusable workflows and repository protection settings are outside that field. Provenance covers public disclosures in the reviewed material only.
