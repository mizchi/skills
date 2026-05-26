---
name: k8s-crd-from-typed-schema
description: Use when generating Kubernetes CustomResourceDefinitions from a typed schema source (zod / TypeBox / Valibot / json-schema). Covers the Structural Schema dialect's restrictions, the /status subresource trap, the metadata-prohibition rule, and plural inflection — the four pitfalls that bite on first attempt.
---

# k8s CRDs from a typed schema

Generating CRDs from typed schemas (zod / TypeBox / Valibot / hand-written JSON Schema) looks straightforward — convert to OpenAPI v3, embed as `openAPIV3Schema`, done. It isn't. CRDs use a **subset of OpenAPI v3 plus k8s-specific extensions** ("Structural Schema"), and several common JSON-Schema features are silently incompatible. Plus there are two non-schema gotchas (`status` subresource, `metadata` prohibition) that don't show up until you try to use the CRD.

This skill is the punch list of what to fix before `kubectl apply -f crd.yaml` succeeds and the operator actually works.

## When to use

- Building an operator / controller and writing your own CRDs.
- Generating CRDs from a typed source rather than hand-authoring YAML.
- Hitting `kubectl` errors like `unknown field "$schema"` / `must not have "oneOf"` / `must not specify anything other than name and generateName` / `cannot have both "additionalProperties" and "properties"`.
- Operator works once but then reconciles forever in a loop after the first status write.

## Workflow

### 1. Convert typed schema → JSON Schema (OpenAPI v3 dialect)

For zod:

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';

const json = zodToJsonSchema(specSchema, {
  target: 'openApi3',
  $refStrategy: 'none',  // CRDs forbid $refs across the document
});
```

`$refStrategy: 'none'` is mandatory — k8s' Structural Schema does not resolve cross-document `$ref`. Inline everything.

For TypeBox: pass the schema through as-is, then run the adapter below.

### 2. Run the Structural-Schema adapter

The Structural Schema dialect rejects several JSON Schema features. Strip / rewrite them:

| JSON Schema feature | What to do | Why |
|---|---|---|
| `$schema` meta keyword | drop | kubectl rejects unknown root keys |
| `oneOf` / `anyOf` / `allOf` | replace the node with `{ x-kubernetes-preserve-unknown-fields: true }` | structural schema forbids schema-form unions outside `x-kubernetes-validations` |
| tuple `items` (array of schemas) | collapse to a single schema (use `items[0]`) | k8s only supports a single item schema |
| `format` other than `uri` / `date-time` | drop the `format` key | apiserver only honors a small whitelist; unknown formats fail validation |
| `additionalProperties: false` co-located with `properties` | drop the `additionalProperties` key | structural schema forbids both at once; declared `properties` already implies closed |
| empty leaf `{}` (e.g. from `z.unknown()`) | replace with `{ x-kubernetes-preserve-unknown-fields: true }` | structural schema requires every node to declare a `type` or use the escape hatch |

A reference adapter (TypeScript, ~40 lines) lives at `examples/adapter.ts` in this skill (or copy from [k1c/src/cli/export-crds.ts](https://github.com/mizchi/k1c/blob/main/src/cli/export-crds.ts)).

### 3. Wrap the spec schema in the CRD envelope

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: <plural>.<group>     # e.g. r2buckets.cloudflare.k1c.io
spec:
  group: <group>
  scope: Namespaced
  names:
    kind: <Kind>
    singular: <kind>
    plural: <plural>
    listKind: <Kind>List
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            apiVersion: { type: string }
            kind:       { type: string }
            spec:       <your adapted schema here>
            status:
              type: object
              x-kubernetes-preserve-unknown-fields: true
          required: [spec]
      subresources:
        status: {}            # <-- mandatory if your operator writes status
```

### 4. Compute the plural correctly

`spec.names.plural` ends up in the kubectl URL (`/apis/<group>/<version>/<plural>`). Don't `kind.toLowerCase() + 's'` — handle the regular-verb cases:

```ts
function pluralize(kind: string): string {
  const lower = kind.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z')) return `${lower}es`;
  if (lower.endsWith('y')) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}
```

This matches the inflection Cloudflare and most k8s API authors use. Irregular kinds (`Endpoints`, `Quota` → `quotas`) need a manual override map.

### 5. Verify with kubectl in dry-run mode

```sh
kubectl apply --dry-run=server -f crd.yaml
kubectl apply --dry-run=server -f sample-cr.yaml   # after CRD is registered
```

Server-side dry-run catches structural-schema violations that local dry-run misses (e.g. `additionalProperties` + `properties` is only enforced server-side).

## Pitfalls

### Pitfall 1: declaring `metadata` in `openAPIV3Schema.properties`

```yaml
# ❌ kubectl rejects this:
openAPIV3Schema:
  type: object
  properties:
    metadata: { type: object, properties: { name: { type: string } } }
    spec: ...
# error: must not specify anything other than name and generateName for metadata
```

**Fix**: don't list `metadata` at all. The apiserver auto-applies the standard `ObjectMeta` schema. Only declare `apiVersion` / `kind` / `spec` / `status`.

### Pitfall 2: missing `subresources.status: {}` causes infinite reconcile loops

Without this, every `kubectl patch --subresource=status` call:

1. Bumps `.metadata.generation`.
2. Wakes up the watch.
3. Operator re-reconciles → patches status again.
4. Goto 1.

**Symptom**: operator looks healthy but logs show `reconcile loop` lines firing every few hundred ms forever. CPU climbs slowly. Apiserver QPS budget burns.

**Fix**: always include `subresources: { status: {} }` in every served version.

### Pitfall 3: `oneOf` from discriminated unions

`z.discriminatedUnion(...)` and `Type.Union(...)` lower to `oneOf`. Structural schema rejects this outside `x-kubernetes-validations` (CEL). Two fixes:

1. **Permissive escape**: replace the node with `x-kubernetes-preserve-unknown-fields: true` (loses validation).
2. **Strict CEL**: emit `x-kubernetes-validations: [{ rule: "self.type == 'a' && has(self.payload)" }]`. Only apiserver ≥ 1.25 supports this.

The adapter in step 2 picks option 1 by default. Bump to option 2 only when the validation is load-bearing.

### Pitfall 4: structural schema requires `type` on every node

`z.unknown()` lowers to an empty `{}` JSON Schema. Structural schema rejects nodes without `type` (or `enum`, or the escape hatch). Stamp `x-kubernetes-preserve-unknown-fields: true` on every empty leaf during adaptation.

### Pitfall 5: only one schema can be the storage version

`versions[N].storage: true` must be exactly one entry per CRD across all served versions. Multiple `storage: true` → apiserver refuses the CRD on registration. When adding `v1beta1` → `v1`, flip exactly one over.

## Verifying without a real cluster

Stand up [`kind`](https://kind.sigs.k8s.io/) in CI and run:

```sh
kubectl apply -f crd.yaml                              # registers the CRD
kubectl apply --dry-run=server -f every-example.yaml   # validates each CR against the new schema
```

This is exactly what k1c does in `.github/workflows/k8s-validate.yml` — see that workflow for a reference job.

## Why this matters

CRDs are a contract between humans, the apiserver, and your operator. The Structural Schema rules are not arbitrary — they exist so the apiserver can do server-side validation, defaulting, and pruning. But the rules aren't documented in one place: the [official Structural Schema docs](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#specifying-a-structural-schema) cover the dialect, the [subresource docs](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#subresources) cover `/status`, and the `metadata` prohibition only shows up as a runtime apiserver error. This skill collapses all four into one workflow.

## Related skills

- `cloudflare-deploy` — for Cloudflare-specific resource shapes if you're operating on CF (independent of CRD generation).
- `apm-usage` — for shipping the generated CRD bundle as a skill artifact.
