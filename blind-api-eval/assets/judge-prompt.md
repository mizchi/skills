Evaluate one anonymized consumer attempt using the supplied frozen rubric.

Public task/materials: {{public_paths}}
Consumer artifact and command trace: {{artifact_and_trace_paths}}
Private rubric: {{rubric_path}}
Controller-verified oracle result: {{oracle_result_path}}
Output record: {{trial_json_path}}

Inspect the artifact and actual trace before scoring. The consumer's report is
diagnostic evidence, not proof of a successful command or an objective verdict.
Do not infer missing runs from prose. Check that the consumer actually uses the
package rather than merely importing it and recreating the behavior itself.

For every rubric criterion output its exact ID, an integer score 0/1/2 using its
anchors, and nonempty evidence locations. State ambiguity or missing evidence to
the controller; do not invent full marks. Preserve the controller's executable
oracle result. Do not change the rubric, critical flags, weights or thresholds.

Use schema_version 1. For a valid attempt, status is completed, oracle_passed is
boolean, and observations contains exactly one {id, score, evidence: [string]}
per criterion. A completed attempt may fail. When the controller confirms a
harness outage or private-material exposure, use status blocked or contaminated
with a reason instead, leaving quality unassessed. An API-caused error or an
exhausted fair trial budget is a measured failure, not an exclusion.

You have no author rationale or preferred candidate. Grade against evidence,
not style, length, confidence or whether a design resembles your own preference.
If a trace path or header reveals version/winner labels, flag that exposure for
the controller so it can sanitize the evidence and dispatch a fresh judge.
