# Sources

Operational rules live in `SKILL.md`. This file holds attribution and author-reported numbers. Treat numbers as in-paper results, not production guarantees. Compare topologies under a fixed token budget before adopting one.

## Distillation source

- Title: マルチエージェント手法調査まとめ
- URL: https://chatgpt.com/share/6aaa90c3-0c50-83e8-9dda-8b6bae13f837
- Date: 2026-09-16
- Note: ChatGPT-shared synthesis. This skill is a transformed workflow, not a copy of that transcript.

## Papers and engineering notes

| Claim used in the skill | Source |
|---|---|
| 260 configs; decomposable finance +80.8% vs sequential planning −70%; no central verifier → error propagation | [Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296) (Kim et al., Google Research / MIT; arXiv:2512.08296) |
| Task-adapted layered DAG; author-reported pass@1 +14.6%, communication density −13%, token cost −68% | [AgentConductor](https://arxiv.org/abs/2602.17100) (Wang et al.; arXiv:2602.17100) |
| Homogeneous role-prompt workflows often match a single agent with KV-cache reuse | [Rethinking the Value of Multi-Agent Workflow (OneFlow)](https://arxiv.org/abs/2601.12307) (arXiv:2601.12307) |
| Prune or cheap-replace redundant agents; author-reported up to 78.9% token reduction | [AgentSlimming](https://arxiv.org/abs/2605.08813) (Chen et al.; arXiv:2605.08813) |
| Mediate shared-workspace writes instead of deferring conflicts to worktree merge; +18.7 on Commit0-Lite vs git-worktree baseline | [STORM: Multi-agent Collaboration with State Management](https://arxiv.org/abs/2605.20563) (Liu et al.; arXiv:2605.20563) |
| Effort scaling (1 vs 2–4 vs 10+); internal eval +90.2% vs single Opus 4; ~15× chat tokens | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (Anthropic, 2025-06-13) |
| Parallel coding succeeds when tests are the queue, write locks exist, CI is frequent, and non-decomposable stages are not forced parallel | [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-a-c-compiler-with-a-team-of-parallel-claudes) (Carlini, Anthropic, 2026-02-05) |

## Flue (runtime mapping)

- [Flue](https://flueframework.com/) — Open Agent Framework (Astro). 2.0 removed `defineWorkflow`.
- [Workflows](https://flueframework.com/docs/guide/workflows/) — a workflow is a program that drives agents (`flue run`, `start`/`init`/`dispatch`/`read`, Agent SDK, Cloudflare/Inngest/Temporal).
- [Subagents](https://flueframework.com/docs/guide/subagents/) — `useSubagent` is model-driven; known candidate sets belong in the parent script.
- [start.md](https://flueframework.com/start.md) — "Do not import or reference `defineWorkflow` — it does not exist."

## Framework docs (not orchestration strategy)

- OpenAI Agents SDK — handoff vs agent-as-tool: [Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- Microsoft Agent Framework — Sequential / Concurrent / Handoff / Magentic: [microsoft/agent-framework](https://github.com/microsoft/agent-framework)
- A2A — agent-to-agent wire protocol, not a topology: [A2A specification](https://a2a-protocol.org)
- MCP — agent-to-tool connection: [Model Context Protocol](https://modelcontextprotocol.io)

## Cited in the distillation, not independently re-verified here

Keep these as leads. Do not treat unnamed numbers as facts until the paper is opened.

- Lemon — generate roles / model capacity / deps as one spec; counterfactual RL on local edits
- Gated-Memory Routing (2026-09) — choose next role / model / stop from compressed run memory; author-reported HumanEval cost −31.9%
- Multi-Agent Deliberation Under Information Asymmetry — closed debate does not add external information; prior work reports >60% error correlation across agents
