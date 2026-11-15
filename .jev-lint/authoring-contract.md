# Skill Authoring Contract

These conventions preserve the behavior of the repository's existing skills.
They do not require all skills to use the same headings or the same tools.

- Frontmatter describes the actual capability and activation conditions taught
  by the body. An explicit-only workflow must not advertise automatic activation.
  Do not advertise an action the body prohibits or a guarantee its procedure
  cannot provide. A summary need not enumerate every supporting example.
- Required actions must be compatible for the same situation. A narrower scope,
  explicit exception, precedence rule, or choice of alternative workflows can
  legitimately change a general recommendation.
- Use a term consistently for a given concept. Define aliases and distinguish
  concepts when confusing them would change what the agent executes or reports.
  Ordinary synonyms and different names for different platforms are acceptable.
- SKILL.md is the English source of truth; SKILL-ja.md is a Japanese companion.
  mizchi-blog-style is intentionally Japanese because it teaches Japanese prose.
  Code examples, Japanese quotations and original API names are allowed.
- A skill is an instruction manual. Tables, lists, checklists, repeated command
  names and references are appropriate when they help execution. Do not apply
  essay-style prose norms or demand identical section layouts.

Naming/frontmatter syntax, file existence and generated README drift belong to
deterministic checks. Model findings remain suggestions to inspect against the
actual instructions. Calibration fixtures are examples, not repository policy.
