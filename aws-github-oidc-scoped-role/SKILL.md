---
name: aws-github-oidc-scoped-role
description: OpenTofu/Terraform pattern for GitHub Actions OIDC trust with AWS IAM. Covers the non-obvious `job_workflow_ref` condition (vs just `sub` for repo+branch), the Bedrock inference profile ARN patterns, required `aws-marketplace` permissions alongside Bedrock, and the ReadOnlyAccess + explicit Deny pattern for AI agent roles. Use when wiring GitHub Actions to AWS via OIDC.
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

## Scope: `sub` (repo+branch) vs `job_workflow_ref` (specific workflow file)

Most tutorials scope the OIDC trust to a repo+branch using the `sub` claim:

```hcl
# Minimal scope — any workflow in the repo on main can assume this role
condition {
  test     = "StringLike"
  variable = "token.actions.githubusercontent.com:sub"
  values   = ["repo:ORG/REPO:ref:refs/heads/main"]
}
```

For privileged roles (e.g., AI agents, deploy roles), scope to a **specific workflow file** using `job_workflow_ref`. This prevents any new workflow added to the repo from assuming the role:

```hcl
# Tight scope — only the specific workflow file from main can assume this role
condition {
  test     = "StringLike"
  variable = "token.actions.githubusercontent.com:sub"
  values   = ["repo:ORG/REPO:*"]  # AWS requires sub to be non-empty; use wildcard here
}
condition {
  test     = "StringEquals"
  variable = "token.actions.githubusercontent.com:job_workflow_ref"
  values   = ["ORG/REPO/.github/workflows/my-workflow.yml@refs/heads/main"]
}
```

The `aud` condition is always required:

```hcl
condition {
  test     = "StringEquals"
  variable = "token.actions.githubusercontent.com:aud"
  values   = ["sts.amazonaws.com"]
}
```

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
      - uses: aws-actions/configure-aws-credentials@v4
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
