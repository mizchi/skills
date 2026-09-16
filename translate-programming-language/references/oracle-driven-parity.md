# Oracle-Driven Parity

Use oracles to preserve externally visible behavior while moving implementation across languages.

## Oracle Types

| Oracle | Use when | Notes |
|---|---|---|
| Source runtime oracle | The old implementation is the production contract | Pin runtime, dependencies, locale, timezone, and environment. |
| Standards oracle | A public spec defines the behavior | Use RFCs, ECMA/ISO specs, protocol specs, or official conformance data where possible. |
| Differential oracle | Source, target, and standard may disagree | Record the disagreement and make an explicit compatibility decision. |
| Real traffic oracle | Unit examples miss production-shaped input | Replay sanitized requests/events and compare outputs and side effects. |

## Build Oracle Fixtures

1. Create human-authored input cases. Do not hand-write expected outputs.
2. Execute the source runtime against those cases.
3. Write expected outputs into fixture files committed with the target implementation.
4. Re-run fixture generation in CI and fail if committed fixtures drift unexpectedly.

Fixture schema should be boring and diagnostic:

```json
[
  {
    "name": "case name",
    "args": {},
    "env": {},
    "expected": {},
    "expected_hex": null,
    "error": null
  }
]
```

Use `expected_hex` or base64 for binary outputs. For ordered maps, preserve order explicitly as arrays of key/value pairs or use a target-language ordered representation in tests.

## Case Design

Cover both domain examples and runtime boundary classes:

- `null`/missing/empty values
- numeric boundaries: `0`, `-0`, min/max integer, overflow, decimals, exponent notation, `NaN`, infinities
- string boundaries: empty, Unicode, invalid bytes, control characters, normalization, escaping
- collection boundaries: empty, duplicate keys, numeric string keys, insertion order, sparse arrays
- serialization boundaries: JSON object order, XML whitespace, binary payloads, protocol defaults
- URL/HTTP boundaries: query encoding, repeated parameters, header casing, cookies
- time boundaries: timezone, DST, leap day, Unix epoch, monotonic vs wall clock
- regex boundaries: unsupported syntax, backtracking behavior, named groups
- error boundaries: exception class/message/code, partial output, logs, metrics

## Standards Before Folklore

When a behavior has a standard:

1. Find the normative spec or official compatibility reference.
2. Add cases that exercise the standard edge behavior.
3. Compare source runtime, target runtime, and standard behavior.
4. Choose one:
   - follow source behavior because production already depends on it;
   - follow the standard because the source behavior was an unobservable bug;
   - support both during transition, then remove legacy behavior after cutover.

Document the choice in the compatibility knowledge catalog. Do not silently accept the target standard library's behavior just because tests pass for common cases.

## Source Runtime Harness

Keep oracle runners self-contained:

- load the source application/runtime explicitly;
- reset global state between cases;
- set timezone/locale/environment per case;
- capture stdout/stderr/headers/logs when they are part of the contract;
- start a real server/process when CLI mode cannot reproduce behavior;
- avoid network calls unless the fixture is explicitly an integration oracle.

## Drift Check

Add a command that regenerates every fixture and fails on diff:

```sh
make oracle-refresh
git diff --exit-code -- path/to/fixtures
```

If drift appears, decide whether the source behavior changed intentionally. Commit fixture updates and target changes together so the diff explains the new contract.
