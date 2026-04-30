# Compatibility Knowledge Catalog

Maintain a living catalog of cross-language behavior differences. This is the memory that keeps later ports from rediscovering the same traps.

## Entry Template

```markdown
### <short behavior name>

- Source behavior:
- Target behavior:
- Standard/spec behavior:
- Decision: source-compatible / standard-compatible / dual-support / retired
- Compatibility helper:
- Tests/fixtures:
- Callers:
- Deletion plan:
- Notes:
```

Keep entries about language/runtime behavior, not domain facts.

## Categories To Check

| Category | Typical differences |
|---|---|
| Numeric conversion | integer overflow, float-to-int, numeric strings, `NaN`, infinities, signed zero |
| Truthiness/nullability | empty string, empty array, zero, missing key, undefined vs null |
| Collections | ordered maps, sparse arrays, duplicate keys, numeric string keys |
| Strings/bytes | Unicode normalization, invalid bytes, control characters, locale-sensitive operations |
| Serialization | JSON escaping/order, XML whitespace, msgpack/protobuf defaults, omitted fields |
| URL/HTTP | query encoding, repeated params, cookie formatting, header casing, form parsing |
| Time | timezone names, DST, locale, monotonic clock, formatting tokens |
| Regex | PCRE-only syntax, RE2 limits, backreferences, lookbehind, catastrophic backtracking |
| Crypto | padding, IV/nonce format, authentication tag layout, base64 variant |
| Errors | exception type, message, code, partial output, panic vs returned error |
| Concurrency/I/O | blocking behavior, cancellation, retries, file modes, network timeouts |

## Compatibility Layer Rules

Create a compatibility helper when:

- source and target standard libraries differ in an externally visible way;
- a protocol requires source-runtime quirks during transition;
- tests need a named boundary to explain why target-native behavior is not used.

Do not put in a compatibility helper:

- business/domain rules;
- target-language idioms that can live in normal code;
- speculative abstractions without an oracle case;
- permanent APIs without a deletion story.

Each helper should have:

- a package/module doc saying it is a temporary compatibility layer;
- parity tests generated from source or standards cases;
- a short migration target after cutover;
- minimal public API;
- no dependency on domain modules.

## Standards References

When possible, cite stable references in the catalog: RFC numbers, W3C/WHATWG pages, ECMA/ISO sections, protocol specs, official language manuals, or official library docs. If standards and production source behavior disagree, record that explicitly.

## Performance Notes

Compatibility can cost CPU and allocations. Keep benchmark notes near the catalog entry when a helper sits in a hot path:

- representative input shape;
- target-native baseline;
- compatibility-helper cost;
- acceptable threshold;
- future removal or typed-boundary plan.
