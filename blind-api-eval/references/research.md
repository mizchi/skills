# Terminology and primary sources

Checked 2026-11-18. The combination below is a descriptive synthesis for this
skill, not a claim that one published algorithm defines the complete protocol.
Call it **blind agent-based API usability evaluation with reflective improvement**.

| Term / source | What it contributes | Boundary for this skill |
| --- | --- | --- |
| [API usability evaluation — Revisiting Graph Analytics Benchmark](https://arxiv.org/abs/2506.21811) | Introduces an LLM-based API usability evaluation framework for graph analytics platforms. | A close domain-specific precedent; its benchmark does not establish this protocol as a general standard. |
| [Agent-computer interface (ACI) — SWE-agent](https://arxiv.org/abs/2405.15793) | Treats language agents as software end users and evaluates how interface design affects their performance. | Supports changing the interface as the experimental variable; task performance alone does not measure human developer usability. |
| [LLM-as-a-Judge — Zheng et al.](https://arxiv.org/abs/2306.05685) | Studies model-based judging and its position, verbosity and self-enhancement biases. | Use anchored evidence, independent judging and anonymized candidates; executable assertions retain authority over correctness. |
| [Reflective prompt evolution — GEPA](https://arxiv.org/abs/2507.19457) | Uses execution trajectories and natural-language reflection to propose/test prompt changes, with Pareto-based candidate selection. | Closest optimization family for a trace → diagnosis → candidate → re-evaluation loop. A small manual API loop is not GEPA without its algorithm. |
| [Textual gradients — TextGrad](https://www.nature.com/articles/s41586-025-08661-4) ([authors' implementation](https://github.com/zou-group/textgrad)) | Propagates language-model feedback to optimize text-bearing system components. | An optimization analogy; this skill uses diagnostic feedback without claiming differentiability or implementing TextGrad's backpropagation. |
| [Verbal reinforcement learning — Reflexion](https://arxiv.org/abs/2303.11366) | Keeps reflective feedback in an agent's episodic memory to improve later attempts without weight updates. | Deliberately differs from our evaluation consumer: only the controller keeps lessons; each measured consumer starts fresh. |

**Interpretation:** the closest established vocabulary is API usability / ACI for
the object being improved, LLM-as-a-Judge for rubric scoring, and reflective
optimization or feedback-driven optimization for the outer loop. Calling the
whole activity reinforcement learning would obscure what changes: the interface
artifact, rather than trained model weights or a persistent consumer policy.

The local methodological starting points are `empirical-prompt-tuning` (fresh
executors, self-report plus external measurement, failure-pattern ledger) and
`waxa-eval` (repeatable scenarios and grading). Their prompt-optimization framing
is adapted here to real package execution. No external optimizer or specific
evaluation CLI is required to apply the protocol.
