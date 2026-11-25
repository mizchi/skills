# Description activation policy

This is the semantic activation boundary from
[optimizing-descriptions](../optimizing-descriptions/SKILL.md#two-track-policy).
It evaluates a skill entrypoint as data. It does not invoke skills or rewrite
descriptions.

- Meta skills perform deliberate agent-environment or skill maintenance, such
  as selecting installed skills, changing descriptions, or codifying lessons.
  Their descriptions restrict invocation to an explicit relevant user request.
  Incidental file edits, keyword overlap, ordinary task completion and ambient
  repository events must not provide a second activation route.
- Project skills help with a concrete development domain. A relevant symptom or
  task may select them even when the user does not name the skill. Do not require
  the user to say the exact skill name before recognizing such a problem.
- A catalog router may run at the start of an in-scope project task to find and
  load a matching skill. Apply the Project activation policy to a router whose
  role is limited to task-based selection. It must preserve each routed skill's
  own activation conditions, including explicit intent for Meta skills.
  Installing, updating, enabling, or editing skills remains Meta maintenance
  and requires an explicit relevant request.
- Existing adoption and explicit user selection are legitimate boundaries for
  optional tools. A dotenvx skill need not trigger on every environment-file
  question. Authorization before executing a mutation is also distinct from
  authorization to load the diagnostic skill.
- Classify the operative role, not occurrences of words such as "meta", "only"
  or "explicit" inside quoted mistakes, examples, or unrelated references.
  Semantically equivalent Japanese and English boundaries are acceptable.
- A document with no skill description or no operative activation policy is
  outside this question. Other defects, such as units, missing files, writing
  style, or conflicting implementation steps, do not establish this defect.

This rule checks a description's activation policy. Character counts and YAML
syntax belong to static validation; actual agent trigger rates require an
execution evaluation with user queries.
