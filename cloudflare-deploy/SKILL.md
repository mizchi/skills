---
name: cloudflare-deploy
description: Deploy applications and infrastructure to Cloudflare with the cf CLI and typed cloudflare.config.ts. Use when deploying Workers, migrating a Wrangler project to cf, or setting up Cloudflare resources and CI.
---

# Cloudflare Deploy

Use `cf` for Cloudflare operations. Use the decision trees below to pick a product, then read its runtime/API references and the current [cf CLI guide](references/cf/README.md).

## Prerequisites

- Node.js 24+ and pnpm. Install the npm package **`cf`**, not `@cloudflare/cf`.
- Keep `cf` in project devDependencies and commit the lockfile. The checked example uses `cf@1.0.0-beta.5` and `@cloudflare/vite-plugin@beta`; recheck help and types when upgrading.
- Workers use `cloudflare.config.ts`. For an existing Wrangler project, run `cf migrate --dry-run`, then `cf migrate` and resolve its follow-up items before project commands. Automatic configuration does not import the old bindings.

## Authentication (Required Before Deploy)

Verify auth before publishing or mutating account resources:

```bash
pnpm exec cf auth whoami
```

See [authentication](references/cf/auth.md). Use `pnpm exec cf auth login` locally; cf has its own login credentials. In CI set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. A deploy dry run needs no credentials.

## Discover Commands Before Running Them

```bash
pnpm exec cf cli search "create a D1 database"
pnpm exec cf schema d1 create
pnpm exec cf d1 create --help
```

Describe only the operation and resource type in search queries. Pass names and IDs to the discovered command, not to search. API commands return JSON on stdout and progress on stderr. Resource commands usually use IDs and remote data; inspect `--local` support instead of copying Wrangler's `--remote`, `--env`, `--json`, or `--yes` flags.

## When to Read `references/`

Current CLI, migration, configuration and build guidance lives in `references/cf/`. Product references retain SDK and runtime knowledge; files marked as legacy preserve old CLI/config examples only as migration input. Do not execute those Wrangler examples or generate new Wrangler configuration from them. Translate the intended operation using cf search/schema and typed bindings.

Rules of thumb:
- Picking a product? Use decision trees below, then load `references/<picked-product>/`
- Writing `cloudflare.config.ts`? Read [configuration](references/cf/configuration.md) first.
- CI/CD setup? Read [GitHub Actions](references/ci/github-actions.md).
- Deploy fails? Read [cf gotchas](references/cf/gotchas.md), then the product's runtime gotchas.
- The minimal example below covers Workers + KV + secret — for anything beyond that, descend into references

## Minimal Worker Example (copy-paste starter)

Start with this Worker, one KV binding and one secret. Apply the TypeScript setup from the configuration reference before typechecking:

```ts
// cloudflare.config.ts
import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "my-worker",
    entrypoint,
    compatibilityDate: "2026-09-30", // Today's date for a new Worker
    observability: { enabled: true },
    env: {
      CACHE: bindings.kv({ id: "REPLACE_WITH_KV_ID" }),
      API_SECRET: bindings.secret(),
    },
  },
});
```

```ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [cloudflare()] });
```

```ts
// src/index.ts
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const hit = await env.CACHE.get("greeting");
    return new Response(hit ?? "hello");
  }
} satisfies ExportedHandler<Env>;
```

Bootstrap commands:
```bash
pnpm add -D cf @cloudflare/vite-plugin@beta vite typescript
pnpm exec cf kv namespaces create --title CACHE # Copy the returned ID into config
pnpm exec cf workers types                      # Generates .cloudflare/types/index.d.ts
pnpm exec cf dev                                # Vite reports the local URL
pnpm exec cf deploy --dry-run --secrets-file .env.production
pnpm exec cf deploy --secrets-file .env.production
```

Put `API_SECRET` in an ignored `.env.production` for deployment and `.dev.vars` for local development. Declaring `bindings.secret()` makes that value required at deploy validation; dotenvx values in the CLI process are not automatically Worker secrets. Include `.cloudflare/types` in `tsconfig.json`; see the configuration reference for the full TypeScript setup. Change an existing Worker's compatibility date deliberately.

Live log streaming and legacy Pages asset deployment are not implemented in the checked cf beta, even when a command appears in search/help. Use Workers Logs in the dashboard for inspection and Workers static assets for new web projects. For a legacy Pages project, keep its deployment working while planning migration; do not invent a `cf pages deploy` replacement. See [limitations](references/cf/gotchas.md).

For Pages / D1 / Durable Objects / multi-env / CI — descend into `references/`.

## Quick Decision Trees

### "I need to run code"

```
Need to run code?
├─ Serverless functions at the edge → workers/
├─ Full-stack web app with Git deploys → workers/ (framework) + static-assets/
├─ Maintain or migrate an existing Pages app → pages/ (legacy reference)
├─ Stateful coordination/real-time → durable-objects/
├─ Long-running multi-step jobs → workflows/
├─ Run containers → containers/
├─ Multi-tenant (customers deploy code) → workers-for-platforms/
├─ Scheduled tasks (cron) → cron-triggers/
├─ Lightweight edge logic (modify HTTP) → snippets/
├─ Process Worker execution events (logs/observability) → tail-workers/
└─ Optimize latency to backend infrastructure → smart-placement/
```

### "I need to store data"

```
Need storage?
├─ Key-value (config, sessions, cache) → kv/
├─ Relational SQL → d1/ (SQLite) or hyperdrive/ (existing Postgres/MySQL)
├─ Object/file storage (S3-compatible) → r2/
├─ Message queue (async processing) → queues/
├─ Vector embeddings (AI/semantic search) → vectorize/
├─ Strongly-consistent per-entity state → durable-objects/ (DO storage)
├─ Secrets management → secrets-store/
├─ Streaming ETL to R2 → pipelines/
└─ Persistent cache (long-term retention) → cache-reserve/
```

### "I need AI/ML"

```
Need AI?
├─ Run inference (LLMs, embeddings, images) → workers-ai/
├─ Vector database for RAG/search → vectorize/
├─ Build stateful AI agents → agents-sdk/
├─ Gateway for any AI provider (caching, routing) → ai-gateway/
└─ AI-powered search widget → ai-search/
```

### "I need networking/connectivity"

```
Need networking?
├─ Expose local service to internet → tunnel/
├─ TCP/UDP proxy (non-HTTP) → spectrum/
├─ WebRTC TURN server → turn/
├─ Private network connectivity → network-interconnect/
├─ Optimize routing → argo-smart-routing/
├─ Optimize latency to backend (not user) → smart-placement/
└─ Real-time video/audio → realtimekit/ or realtime-sfu/
```

### "I need security"

```
Need security?
├─ Web Application Firewall → waf/
├─ DDoS protection → ddos/
├─ Bot detection/management → bot-management/
├─ API protection → api-shield/
├─ CAPTCHA alternative → turnstile/
└─ Credential leak detection → waf/ (managed ruleset)
```

### "I need media/content"

```
Need media?
├─ Image optimization/transformation → images/
├─ Video streaming/encoding → stream/
├─ Browser automation/screenshots → browser-rendering/
└─ Third-party script management → zaraz/
```

### "I need infrastructure-as-code"

```
Need IaC? → pulumi/ (Pulumi), terraform/ (Terraform), or api/ (REST API)
```

## Product Index

### Compute & Runtime
| Product | Reference |
|---------|-----------|
| Workers | `references/workers/` |
| Pages | `references/pages/` |
| Pages Functions | `references/pages-functions/` |
| Durable Objects | `references/durable-objects/` |
| Workflows | `references/workflows/` |
| Containers | `references/containers/` |
| Workers for Platforms | `references/workers-for-platforms/` |
| Cron Triggers | `references/cron-triggers/` |
| Tail Workers | `references/tail-workers/` |
| Snippets | `references/snippets/` |
| Smart Placement | `references/smart-placement/` |

### Storage & Data
| Product | Reference |
|---------|-----------|
| KV | `references/kv/` |
| D1 | `references/d1/` |
| R2 | `references/r2/` |
| Queues | `references/queues/` |
| Hyperdrive | `references/hyperdrive/` |
| DO Storage | `references/do-storage/` |
| Secrets Store | `references/secrets-store/` |
| Pipelines | `references/pipelines/` |
| R2 Data Catalog | `references/r2-data-catalog/` |
| R2 SQL | `references/r2-sql/` |

### AI & Machine Learning
| Product | Reference |
|---------|-----------|
| Workers AI | `references/workers-ai/` |
| Vectorize | `references/vectorize/` |
| Agents SDK | `references/agents-sdk/` |
| AI Gateway | `references/ai-gateway/` |
| AI Search | `references/ai-search/` |

### Networking & Connectivity
| Product | Reference |
|---------|-----------|
| Tunnel | `references/tunnel/` |
| Spectrum | `references/spectrum/` |
| TURN | `references/turn/` |
| Network Interconnect | `references/network-interconnect/` |
| Argo Smart Routing | `references/argo-smart-routing/` |
| Workers VPC | `references/workers-vpc/` |

### Security
| Product | Reference |
|---------|-----------|
| WAF | `references/waf/` |
| DDoS Protection | `references/ddos/` |
| Bot Management | `references/bot-management/` |
| API Shield | `references/api-shield/` |
| Turnstile | `references/turnstile/` |

### Media & Content
| Product | Reference |
|---------|-----------|
| Images | `references/images/` |
| Stream | `references/stream/` |
| Browser Rendering | `references/browser-rendering/` |
| Zaraz | `references/zaraz/` |

### Real-Time Communication
| Product | Reference |
|---------|-----------|
| RealtimeKit | `references/realtimekit/` |
| Realtime SFU | `references/realtime-sfu/` |

### Developer Tools
| Product | Reference |
|---------|-----------|
| cf CLI | `references/cf/` |
| Miniflare | `references/miniflare/` |
| C3 | `references/c3/` |
| Observability | `references/observability/` |
| Analytics Engine | `references/analytics-engine/` |
| Web Analytics | `references/web-analytics/` |
| Sandbox | `references/sandbox/` |
| Workerd | `references/workerd/` |
| Workers Playground | `references/workers-playground/` |

### Infrastructure as Code
| Product | Reference |
|---------|-----------|
| Pulumi | `references/pulumi/` |
| Terraform | `references/terraform/` |
| API | `references/api/` |

### Other Services
| Product | Reference |
|---------|-----------|
| Email Routing | `references/email-routing/` |
| Email Workers | `references/email-workers/` |
| Static Assets | `references/static-assets/` |
| Bindings | `references/bindings/` |
| Cache Reserve | `references/cache-reserve/` |

## Troubleshooting

### Escalated Network Access

If deployment fails due to network issues (timeouts, DNS errors, connection resets), rerun the deploy with escalated permissions (use `sandbox_permissions=require_escalated`). The deploy requires escalated network access when sandbox networking blocks outbound requests.

Example guidance to the user:

```
The deploy needs escalated network access to deploy to Cloudflare. I can rerun the command with escalated permissions—want me to proceed?
```
