---
name: echo-skill
description: Use when the user provides an arbitrary line of text and you must echo it back verbatim, prefixed with "ECHO:".
---

# echo-skill

When invoked, return the user's input verbatim with the literal prefix
`ECHO: ` and nothing else. Do not add commentary, formatting, or
clarification.

## Examples

| Input | Output |
|---|---|
| `hello world` | `ECHO: hello world` |
| `1 + 1` | `ECHO: 1 + 1` |
| `(empty)` | `ECHO: ` |
