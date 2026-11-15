# GitHub OIDC subjects consumed by AWS

Sources checked 2026-11-16: [AWS setup](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
and [GitHub claim/customization reference](https://docs.github.com/en/actions/reference/security/oidc).

AWS compares the standard audience and subject. GitHub may place extra fields
inside `sub`; that does not create additional AWS IAM condition keys.

For a reusable-workflow deployment using a protected environment, the repository
subject template can include `repo`, `context`, and `job_workflow_ref`. The
repository customization API body is:

```json
{
  "use_default": false,
  "include_claim_keys": ["repo", "context", "job_workflow_ref"]
}
```

Changing this setting changes subjects for affected jobs in the repository.
Inventory all roles consuming those tokens, prepare their exact accepted subjects,
apply the intended template, and validate a permitted deployment and a denied
untrusted workflow before removing a temporary migration allowance. Do not run
the repository API update as part of a read-only documentation check.

The name-based production subject shown in SKILL.md is conditional on this
template and subject format. Immutable subjects contain IDs too; environment
names containing colons are encoded in the subject. Match the emitted value,
not a guessed concatenation. Inspect claim fields in a controlled job without
printing the bearer token. An ordinary workflow lacks the reusable-workflow
claim; use an appropriate supported subject template for that design instead.

Local review can check policy structure and claim/template agreement. It does
not establish that AWS will issue a session; validate that separately in the
intended account and GitHub environment when deployment changes are authorized.
