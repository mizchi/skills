# Test Migration

Generate target-language tests from source tests/contracts so missing coverage stays visible.

## Discovery

Inventory source tests and contracts with structural tools when possible:

- test files, test classes, test functions, data providers, fixtures, snapshots
- public functions/methods, endpoint handlers, serializers, protocol handlers
- examples in documentation, OpenAPI/GraphQL/protobuf schemas, CLI help, golden files

Prefer AST parsers or the source test runner's metadata output over regex. Use text search only as a fallback.

## Stub Generation

Generate one target stub for every source test or contract case:

```text
source test name -> target test name -> status
```

Pending stubs should fail the release gate by being counted as skip/pending. This prevents "tests exist in the source but were never ported" from disappearing.

Recommended statuses:

- `pending`: discovered but not implemented
- `parity`: target test compares against generated oracle fixture
- `native`: target test validates target-only glue around a parity-proven core
- `removed`: source behavior intentionally retired, with approval link/reference

## Fixture-Driven Tests

Each implemented parity test should:

- read generated fixtures;
- fail if fixture list is empty;
- run each fixture as a subtest using the fixture name;
- include input args or fixture identifier in failure output;
- compare byte-exact output when the contract is byte-exact;
- use structural comparison only when the contract explicitly allows it;
- compare errors, logs, headers, metrics, and side effects when externally visible.

For long strings, XML, HTML, or binary outputs, report the first diff position and a nearby slice. For binary values, compare encoded hex/base64 to keep diagnostics stable.

## Branch-Oriented Oracle Growth

When a port fails, do not only fix the implementation. Add a new oracle case that explains the branch:

- boundary value that failed;
- runtime conversion that differed;
- malformed input;
- missing/empty/null branch;
- duplicate or ordered-key branch;
- error branch;
- side-effect branch.

This converts debugging discoveries into durable coverage.

## Drift Gates

Add CI gates for:

- regenerated stubs match committed stubs;
- regenerated fixtures match committed fixtures;
- pending/skip count is zero for release;
- source test deletion/rename is reflected in target test metadata;
- target-only tests do not replace required parity tests without an explicit retirement note.

## Avoid

- Do not translate test assertions manually while also translating implementation manually; this duplicates human mistakes.
- Do not loosen byte-exact assertions to structural assertions because a test is hard to pass.
- Do not hide unported cases behind broad skips.
- Do not store domain secrets or production-specific identifiers in reusable skill docs or public fixtures.
