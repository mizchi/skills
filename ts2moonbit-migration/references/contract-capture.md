# Contract Capture (Phase 0)

The TypeScript public surface is the migration oracle. Capture it before touching MoonBit, and treat any later deviation as a regression.

## 1. Inventory exported symbols + signatures

Generate the authoritative declaration from the source as it ships today:

```bash
# If the package already ships .d.ts, snapshot it as-is:
cp dist/index.d.ts contract/index.d.ts

# Otherwise emit declarations from source:
npx tsc --declaration --emitDeclarationOnly --outDir contract/ src/index.ts
```

Also record the *entry map* — what consumers actually import:

```bash
node -e 'const p=require("./package.json"); console.log(JSON.stringify({main:p.main,module:p.module,types:p.types,exports:p.exports},null,2))'
```

Keep `contract/` under version control. The Phase 6 diff is `generated .d.ts` vs this snapshot.

## 2. Classify each export's contract level

Tag every export so you know how strict parity must be:

| Level | Meaning | Typical exports |
|---|---|---|
| **byte-exact** | output bytes/string must match exactly | hashers, serializers, encoders, formatters |
| **structural** | same object/JSON shape, field order may not matter | most data-returning functions |
| **semantic** | a value that round-trips / is observationally equal | parsers paired with their serializer |

Write the level next to each symbol in `contract/levels.md`. It decides how you write the parity assertion in Phase 7.

## 3. Freeze the test suite as the oracle

The existing TS tests are the cheapest, highest-signal parity gate. Two moves:

- **Keep them runnable against a built artifact.** Note how they import the module (`import {x} from "../src"` vs `from "../dist"`). In Phase 7 you will repoint that import at the `moon build` output.
- **Generate fixtures from the *source* runtime**, never by hand. Pin the runtime version. Cover: ordinary cases, boundary values (0, empty, max-int, 2^53 ±1), malformed input, error paths, and side effects.

```bash
# Example: snapshot real outputs from the current implementation as fixtures
node scripts/gen-fixtures.mjs > contract/fixtures.json   # calls the TS impl, writes {input, output} pairs
```

These fixtures port directly into MoonBit `inspect`/`assert_eq` tests during Phase 3.

## 4. Record runtime + format facts

Capture the things that silently break consumers if changed:

- Module format(s): ESM, CJS, or dual (check `package.json` `type`, `exports` conditions).
- Node/Deno/Bun/browser/Worker target(s).
- Error contract: does it `throw Error`, reject a Promise, or return a discriminated result? With what message/shape?
- Async-ness of each export (sync vs returns `Promise`).
- Numeric expectations: which `number` fields can exceed 2^53, which are really `bigint`.

## Output of Phase 0

A `contract/` directory containing:

```
contract/
├── index.d.ts        # frozen signature snapshot — Phase 6 diffs against this
├── levels.md         # per-export contract level (byte/structural/semantic)
├── fixtures.json     # source-generated input/output pairs — Phase 3 tests
└── runtime.md        # formats, targets, error/async/numeric facts
```

You do not start Phase 1 until this exists.
