---
title: "MoonBit Native FFI Reference"
---

# MoonBit Native FFI Reference

## Opaque C Handles (require `#external`)

C `void*` handle types must be declared with `#external`.
Without it, MoonBit treats the value as a refcounted object and may call
`moonbit_decref` on a pointer owned by C, causing crashes.

```moonbit
#external
pub type Engine

extern "C" fn engine_new() -> Engine = "wasm_engine_new"
#owned(engine)
extern "C" fn engine_delete(engine : Engine) = "wasm_engine_delete"
```

### Typical symptoms
- `engine_delete` crashes with `EXC_BAD_ACCESS` / `SIGSEGV`
- tests pass until the delete/free path runs

## Ownership annotation

### `#borrow`
- Borrow only. The callee does not take ownership.
- Use for inputs to constructors like `store_new(engine)`.

```moonbit
#borrow(engine)
extern "C" fn store_new(engine : Engine) -> Store = "wasm_store_new"
```

### `#owned`
- The callee takes ownership (destroy/free functions).

```moonbit
#owned(store)
extern "C" fn store_delete(store : Store) = "wasm_store_delete"
```

Rule of thumb: `destroy/free/delete` are `#owned`; constructor inputs are `#borrow`.

## Native ABI type mapping (C)

These are the practical C-side representations used by MoonBit's native backend.

| MoonBit | C (native) | Notes |
|---------|------------|-------|
| `Int` | `int32_t` | 32-bit signed |
| `UInt` | `uint32_t` | 32-bit unsigned |
| `Int64` | `int64_t` | 64-bit signed |
| `UInt64` | `uint64_t` | 64-bit unsigned |
| `Float` | `float` | 32-bit float |
| `Double` | `double` | 64-bit float |
| `Bool` | `int32_t` | 0/1 |
| `Bytes` | `uint8_t*` | length is tracked by MoonBit; not null-terminated |
| `String` | `moonbit_string_t` | UTF-16, not `char*` |
| `#external type` | `void*` | opaque handle |

If you need C `char*`, expose a `Bytes` buffer and handle encoding/length explicitly.

## `Bytes` vs `FixedArray[Byte]`

- `Bytes` is a managed, variable-length byte buffer (has a runtime length).
- `FixedArray[Byte]` is a fixed-size buffer (often used for stack-like scratch).

Use `Bytes` for:
- data that needs a known length at runtime
- FFI that writes into a buffer and returns a length

Use `FixedArray[Byte]` for:
- fixed-size I/O buffers
- small scratch buffers where size is known upfront

Examples:

```moonbit
// Bytes: length-aware
extern "C" fn read_message(buf : Bytes) -> Int = "read_message"

fn read_message_string() -> String {
  let buf = Bytes::make(256, 0)
  let len = read_message(buf)
  @bytes_util.ascii_to_string(buf[:len])
}
```

```moonbit
// FixedArray: fixed-size buffer
extern "C" fn fill_buffer(buf : FixedArray[Byte], len : Int) = "fill_buffer"

fn read_fixed() -> Bytes {
  let buf = FixedArray::make(256, Byte::default())
  fill_buffer(buf, 256)
  // If you need Bytes, copy explicitly
  let out = Bytes::make(256, 0)
  for i = 0; i < 256; i = i + 1 {
    out[i] = buf[i]
  }
  out
}
```

## C struct patterns

### Preferred: opaque handle + accessors

Expose a `#external` handle and provide C accessors instead of sharing the struct layout.
This avoids ABI/packing issues and keeps ownership clear.

```moonbit
#external
pub type Config

extern "C" fn config_new() -> Config = "config_new"
#owned(cfg)
extern "C" fn config_free(cfg : Config) = "config_free"

extern "C" fn config_get_timeout_ms(cfg : Config) -> Int = "config_get_timeout_ms"
extern "C" fn config_set_timeout_ms(cfg : Config, ms : Int) = "config_set_timeout_ms"
```

```c
// config.c
typedef struct {
  int32_t timeout_ms;
  int32_t flags;
} Config;

Config* config_new(void) { return calloc(1, sizeof(Config)); }
void config_free(Config* cfg) { free(cfg); }
int32_t config_get_timeout_ms(Config* cfg) { return cfg->timeout_ms; }
void config_set_timeout_ms(Config* cfg, int32_t ms) { cfg->timeout_ms = ms; }
```

### If you must share layout

Avoid direct struct sharing unless you fully control both sides.
Prefer serializing into `Bytes`/`FixedArray[Byte]` with explicit offsets.

## Bytes / String patterns

If C returns `uint8_t*`, receive it as `Bytes` and decode on the MoonBit side.

```moonbit
extern "C" fn version_bytes() -> Bytes = "wasmtime_version_bytes"

pub fn version() -> String {
  @utf8.decode_lossy(version_bytes())
}
```

If C writes into a buffer and returns a length, use `#borrow(buf)` and slice.

```moonbit
#borrow(buf)
extern "C" fn read_message(buf : Bytes) -> Int = "read_message"

fn read_message_string() -> String {
  let buf = Bytes::make(256, 0)
  let len = read_message(buf)
  @bytes_util.ascii_to_string(buf[:len])
}
```

## When the C API is macro/inline only

MoonBit cannot call macros or static inline functions directly.
Create a small C stub and bind to that symbol.

```c
// wasmtime_stub.c
#include "wasmtime_version.h"

const uint8_t* wasmtime_version_bytes(void) {
  return (const uint8_t*)WASMTIME_VERSION;
}
```

Then bind it from MoonBit with `extern "C" fn`.

## Build / link (native)

Configure native linking in `moon.pkg`.

```toml
[link]
flags = ["-Ldeps/wasmtime/target/release", "-lwasmtime"]
supported-target = ["native"]

[pre-build]
input = "src/scripts/build-wasmtime.sh"
output = "_build/wasmtime_build.stamp"
command = "bash $input $output"
```

- pre-build builds the C library
- `-L` / `-l` provide the linker path and library name

## Quick checklist

- `#external` for all opaque C handles
- `#owned` / `#borrow` on FFI args are correct
- `extern "C" fn` symbol names match the C API
- run tests in both debug and release
