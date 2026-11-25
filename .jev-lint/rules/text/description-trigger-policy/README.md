# Description trigger policy

This local rule implements the [description activation policy](../../../description-trigger-contract.md).
It reads a skill's own description and operative body.

Meta descriptions need an explicit relevant user-request boundary. Project
descriptions can accept related symptoms without requiring their exact skill
name. A catalog router can select skills for an in-scope task while preserving
the activation conditions of each skill. Existing optional-tool adoption and
authorization before a mutation are allowed.

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
`expect.yml` has the expected labels and reasons. `freeze.json`,
`evaluation.json` and `acceptance.json` document the original 16-case evaluation.
The 2026-11-25 evaluation after the router exception ran all 19 cases three
times at the existing cutoff. It returned TP 8, FP 0, FN 0 and zero decision
flips. The last three cases cover routing, automatic maintenance, and an
unrelated build note. `baseline.json` contains the accepted 19-case run.

This corpus is self-authored, small and wide-margin. It does not establish
cutoff-boundary accuracy, statistical independence from every nuisance, actual
agent trigger rates, or full-skill equivalence. Inspect all live findings before
editing a skill. Do not retune the cutoff on these evaluation labels.
