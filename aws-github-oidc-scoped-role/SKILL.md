---
name: aws-github-oidc-scoped-role
description: Configure GitHub Actions OIDC trust in AWS IAM using audience and exact subject conditions, including custom subjects for reusable workflows, Bedrock inference-profile permissions and explicit Deny guardrails. Use when designing or reviewing AWS roles assumed by GitHub Actions.
---

# AWS GitHub Actions OIDC — Scoped IAM Role

## OIDC Provider Setup

```hcl
data "tls_certificate" "github_oidc" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_oidc.certificates[0].sha1_fingerprint]
}
```

One provider per AWS account. If it already exists, use a `data` source instead.

## Scope trust through `aud` and `sub`

AWS IAM does not expose GitHub's custom JWT claims as arbitrary condition keys.
Use `token.actions.githubusercontent.com:aud` and an exact
`token.actions.githubusercontent.com:sub`; a direct `:job_workflow_ref` condition
is not a supported way to scope AWS trust. Checked against the
[GitHub AWS guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
on 2026-11-16.

For a repository using the legacy default subject, a branch-bound policy is:

```hcl
condition {
  test     = "StringEquals"
  variable = "token.actions.githubusercontent.com:aud"
  values   = ["sts.amazonaws.com"]
}
condition {
  test     = "StringEquals"
  variable = "token.actions.githubusercontent.com:sub"
  values   = ["repo:ORG/REPO:ref:refs/heads/main"]
}
```

The exact subject is repository-specific. New repositories using immutable
subjects include owner/repository IDs. Environment jobs use an environment
subject rather than the branch subject. Check the repository's subject settings
and the actual claim format; preserve environment protection rules.

To bind a reusable workflow, first configure GitHub to include
`job_workflow_ref` inside the **subject**, then compare that complete subject in
AWS. For the legacy-name format, a corresponding example is:

```hcl
condition {
  test     = "StringEquals"
  variable = "token.actions.githubusercontent.com:sub"
  values   = ["repo:ORG/REPO:environment:production:job_workflow_ref:ORG/REPO/.github/workflows/deploy.yml@refs/heads/main"]
}
# Keep the aud condition above as well.
```

This requires the matching GitHub subject template; it does not work with the
default subject. `job_workflow_ref` describes the called reusable workflow, not
an arbitrary normal workflow. Do not broaden `sub` to `repo:ORG/REPO:*` to make
an absent claim pass. Read [subject customization and migration](references/oidc-subjects.md)
before changing an existing trust configuration.

## AI Agent Role Pattern (ReadOnlyAccess + Bedrock + Deny overrides)

For an AI triage/analysis role that can read AWS resources and invoke Bedrock models:

```hcl
resource "aws_iam_role" "ai_agent" {
  name               = "myapp-ai-agent"
  assume_role_policy = data.aws_iam_policy_document.ai_agent_assume.json
}

# Broad read access to inspect infrastructure
resource "aws_iam_role_policy_attachment" "ai_agent_readonly" {
  role       = aws_iam_role.ai_agent.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Bedrock model invocation
resource "aws_iam_role_policy" "ai_agent_bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.ai_agent.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
        ]
        Resource = [
          # Direct foundation model ARNs
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          # Cross-region inference profiles (jp.anthropic.*, us.anthropic.*, global.anthropic.*, etc.)
          "arn:aws:bedrock:*:*:inference-profile/*anthropic.*",
        ]
      },
      # Anthropic models on Bedrock are AWS Marketplace SaaS products.
      # Even when already subscribed at the account level, the *assuming role*
      # must have Marketplace view/subscribe permissions or Bedrock returns
      # AccessDenied regardless of the subscription status.
      {
        Effect = "Allow"
        Action = [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe",
        ]
        Resource = "*"
      },
    ]
  })
}

# ReadOnlyAccess includes secretsmanager:GetSecretValue and kms:Decrypt.
# Deny these explicitly so the agent cannot read secrets or tfstate.
resource "aws_iam_role_policy" "ai_agent_deny" {
  name = "deny-sensitive-reads"
  role = aws_iam_role.ai_agent.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Deny"
        Action   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
        Resource = "*"
      },
      {
        Effect   = "Deny"
        Action   = ["s3:GetObject"]
        Resource = [
          "arn:aws:s3:::${var.tfstate_bucket}",
          "arn:aws:s3:::${var.tfstate_bucket}/*",
        ]
      },
    ]
  })
}
```

## GitHub Actions Workflow Side

```yaml
permissions:
  id-token: write   # required for OIDC token issuance
  contents: read

jobs:
  ai-triage:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_AI_AGENT_ROLE_ARN }}
          aws-region: ap-northeast-1
          role-session-name: ai-triage-${{ github.run_id }}
```

## Common Pitfalls

- **Missing `aws-marketplace` permissions with Bedrock**: Even if the Bedrock subscription is active at the account level, the *assumed role* needs `aws-marketplace:ViewSubscriptions` (and sometimes `Subscribe`) or Bedrock API calls return `AccessDenied`. This is not mentioned in most Bedrock IAM documentation.

- **Cross-region inference profile ARNs**: Bedrock cross-region inference uses `inference-profile` resource type with region-prefixed model IDs (`jp.anthropic.*`, `us.anthropic.*`, `global.anthropic.*`). The standard `foundation-model/anthropic.*` ARN only covers same-region invocations. You need **both** ARNs.

- **`sub` condition must not be empty**: AWS OIDC validation requires at least one `sub` condition even when using `job_workflow_ref`. Use a wildcard (`repo:ORG/REPO:*`) as a fallback — the real scoping comes from `job_workflow_ref`.

- **`job_workflow_ref` includes the full ref**: the value is `ORG/REPO/.github/workflows/FILE.yml@refs/heads/main` — not just the file path. Omitting the `@refs/heads/main` suffix means any branch can trigger the assume.

- **ReadOnlyAccess includes sensitive read actions**: `secretsmanager:GetSecretValue`, `kms:Decrypt`, `s3:GetObject` are all included in ReadOnlyAccess. For agent roles that only need infrastructure inspection, add explicit Deny statements to prevent credential leakage.
