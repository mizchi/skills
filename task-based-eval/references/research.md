# Terminology and primary sources

Checked 2026-11-18. **Task-based evaluation with fresh agent executors** describes
this protocol. **Extrinsic evaluation** is particularly apt when measuring the
usefulness of a supplied resource through downstream task outcomes. The synthesis
is broader than API usability and is not a claim to implement one named optimizer.

| Term / source | Contribution | Boundary |
| --- | --- | --- |
| [Task-based extrinsic evaluation — Is Summary Useful or Not?](https://aclanthology.org/2024.lrec-main.821/) | Evaluates summaries by their usefulness for downstream tasks rather than only judging the summaries themselves. | Close precedent for evaluating a document or other resource by whether its consumer reaches a goal; this skill extends the pattern beyond summarization. |
| [Behavioral testing — CheckList](https://aclanthology.org/2020.acl-main.442/) | Tests observable capabilities through input/output behavior and systematic case variations. | Useful for case design; passing local behavior checks alone does not establish task-level usefulness or a causal resource benefit. |
| [Tasks — Inspect](https://inspect.aisi.org.uk/tasks.html) | Composes evaluation data, an execution strategy and scoring into a task. | Supports separating goal/data, executor and scorer; this skill does not require Inspect or claim its schema. |
| [LLM-as-a-Judge — Zheng et al.](https://arxiv.org/abs/2306.05685) | Studies model-based judging and position, verbosity and self-enhancement biases. | An independent evidence-backed judge is one verification option, not a replacement for available objective checks. |
| [Reflective prompt evolution — GEPA](https://arxiv.org/abs/2507.19457) | Uses trajectories and natural-language reflection to propose/test changes with Pareto-based selection. | Related outer optimization loop; a manual task evaluation is not GEPA without its algorithm. |
| [Textual gradients — TextGrad](https://www.nature.com/articles/s41586-025-08661-4) ([authors' code](https://github.com/zou-group/textgrad)) | Propagates language-model feedback to optimize text-bearing system components. | Diagnostic feedback is an analogy; the protocol does not implement TextGrad backpropagation. |
| [Verbal reinforcement learning — Reflexion](https://arxiv.org/abs/2303.11366) | Keeps reflective feedback in an agent's episodic memory for later attempts. | Here the controller keeps lessons, while each measured executor starts fresh. |
| [Agent-computer interfaces — SWE-agent](https://arxiv.org/abs/2405.15793) | Evaluates interface design for language agents as software end users. | A specialization for interactive software, not the definition of all resource-use evaluation. |
| [API usability — Revisiting Graph Analytics Benchmark](https://arxiv.org/abs/2506.21811) | Introduces LLM-based API usability evaluation for graph platforms. | An API-specific application alongside document, UI, skill and workflow tasks. |

Name the layers separately: task-based/extrinsic evaluation describes what is
measured, behavioral testing helps vary cases, rubric judging describes a scorer,
and reflective optimization describes how feedback proposes changes. None
requires changing model weights. Resource-use observations are black-box evidence
when internals are excluded, but source-reading tasks may intentionally expose code.

The local starting points are `empirical-prompt-tuning` (fresh executors,
two-sided evidence and failure ledger) and `waxa-eval` (repeatable scenarios and
grading). Their prompt-specific framing is adapted to resource use and observable
goal achievement. See [the protocol](protocol.md) for layout/tool compatibility.
