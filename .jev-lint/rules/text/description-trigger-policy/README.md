# Description trigger policy

This local rule implements the semantic Meta/Project activation boundary in
`optimizing-descriptions/SKILL.md`. It reads a skill's own description and
operative body, not invocation logs.

Meta descriptions need an explicit relevant user-request boundary. Project
descriptions can accept related symptoms without requiring their exact skill
name. Existing optional-tool adoption and authorization before a mutation are
allowed. Character counts, YAML validity and unrelated body defects are outside
this rule.

The development-only cutoff is **0.565**, midway between the highest clean
sample (0.19) and the lowest defect sample (0.94) over three passes of seven
development inputs. The previous development attempt missed a capability-only
Meta description; it is retained separately rather than overwritten.

The separate 16-input synthetic evaluation returned TP 7, FP 0, FN 0 and zero
decision flips over three passes. Coverage includes six false-positive-risk
cases, six false-negative-risk cases and four unrelated controls. Two matched
pairs append the same unrelated information to one clean and one bad input;
both retain their original decision.

`case-coverage.json` describes those roles outside the model-visible input.
`expect.yml` has the expected labels and reasons. `freeze.json` and
`evaluation.json` retain the pre-evaluation source hashes and raw API answers.
`baseline.json` is the accepted native Jev record; `acceptance.json` records the
offline acceptance after adding the honest `inconclusive` annotation. That
annotation changes no model-visible question.

This corpus is self-authored, small and wide-margin. It does not establish
cutoff-boundary accuracy, statistical independence from every nuisance, actual
agent trigger rates, or full-skill equivalence. Inspect all live findings before
editing a skill. Do not retune the cutoff on these evaluation labels.
