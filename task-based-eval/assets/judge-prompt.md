Evaluate one anonymized task attempt using the frozen rubric.

Public task, inputs, resource and condition constraints: {{public_material_paths}}
Observed interaction and resulting output/state: {{evidence_paths}}
Private rubric: {{rubric_path}}
Controller-verified goal result and verification method: {{verification_record}}
Output grade record: {{trial_json_path}}

Inspect the actual evidence before scoring. The executor's self-report helps
diagnose the attempt, but is not proof of successful external action. A text-only
answer may itself be the requested result; evaluate the modality declared by the
task. If target use was required, check its evidence. In an intentional no-resource
baseline, do not penalize the absence of that resource.

For each criterion output its exact ID, an integer 0/1/2 using the frozen anchors,
and nonempty evidence locations. Note missing evidence/ambiguity to the controller;
do not invent full marks. Do not alter weights, critical flags or thresholds.
Preserve the controller's goal result and declared verification method. Programmatic
checks, environment observations, rubric judgments and human review are different
forms of verification; do not mislabel one as another.

Use schema_version 1. A valid completed attempt has status completed, boolean
oracle_passed (the verified goal result), verification_method, and observations
with one {id, score, evidence: [string]} per criterion. Completed attempts can fail.
A confirmed harness outage or private-answer exposure uses blocked/contaminated
with a reason instead and remains unassessed. Resource-caused failure or exhausting
a fair budget is a measured failure, not an exclusion.

Grade evidence rather than style, length, confidence or your preferred design.
Flag version/winner labels inside paths, headers or observations so the controller
can sanitize them and replace this judgment with a fresh judge.
