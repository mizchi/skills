# Cloudflare Workflows

> **Legacy CLI/config examples:** Wrangler commands and JSON/TOML settings below are migration input only. Use [cf commands](../cf/api.md), [typed configuration](../cf/configuration.md) and [migration guidance](../cf/patterns.md) for current operations; do not execute or copy the legacy setup. Runtime/SDK examples remain product references.

Durable multi-step applications with automatic retries, state persistence, and long-running execution.

## What It Does

- Chain steps with automatic retry logic
- Persist state between steps (minutes → weeks)
- Handle failures without losing progress
- Wait for external events/approvals
- Sleep without consuming resources

**Available:** Free & Paid Workers plans

## Core Concepts

**Workflow**: Class extending `WorkflowEntrypoint` with `run` method
**Instance**: Single execution with unique ID & independent state
**Steps**: Independently retriable units via `step.do()` - API calls, DB queries, AI invocations
**State**: Persisted from step returns; step name = cache key

## Quick Start

```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = { MY_WORKFLOW: Workflow; DB: D1Database };
type Params = { userId: string };

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const user = await step.do('fetch user', async () => {
      return await this.env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(event.params.userId).first();
    });
    
    await step.sleep('wait 7 days', '7 days');
    
    await step.do('send reminder', async () => {
      await sendEmail(user.email, 'Reminder!');
    });
  }
}
```

## Key Features

- **Durability**: Failed steps don't re-run successful ones
- **Retries**: Configurable backoff (constant/linear/exponential)
- **Events**: `waitForEvent()` for webhooks/approvals (timeout: 1h → 365d)
- **Sleep**: `sleep()` / `sleepUntil()` for scheduling (max 365d)
- **Parallel**: `Promise.all()` for concurrent steps
- **Idempotency**: Check-then-execute patterns

## Reading Order

**Getting Started:** configuration.md → api.md → patterns.md  
**Troubleshooting:** gotchas.md

## In This Reference
- [configuration.md](./configuration.md) - wrangler.jsonc setup, step config, bindings
- [api.md](./api.md) - Step APIs, instance management, sleep/parameters
- [patterns.md](./patterns.md) - Common workflows, testing, orchestration
- [gotchas.md](./gotchas.md) - Timeouts, limits, debugging strategies

## See Also
- [durable-objects](../durable-objects/) - Alternative stateful approach
- [queues](../queues/) - Message-driven workflows
- [workers](../workers/) - Entry point for workflow instances
