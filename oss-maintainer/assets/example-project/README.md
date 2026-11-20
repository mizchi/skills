# example-lines

![](docs/banner.jpg)

Split Unix or Windows text into lines while preserving empty lines.

[Installation](#installation) · [Quick Start](#quick-start) · [Contributing](CONTRIBUTING.md)

## At a glance

```js
import { lines } from "example-lines";

lines("alpha\r\n\r\nbeta"); // ["alpha", "", "beta"]
```

## Installation

From a checkout of this example, use Node.js 24.11+ on the 24.x line (or 26+) and pnpm 12+.

```sh
pnpm install --frozen-lockfile
```

## Quick Start

Run from the project root:

```sh
node --input-type=module -e 'import { lines } from "example-lines"; console.log(lines("alpha\r\nbeta"))'
# [ 'alpha', 'beta' ]
```

See [Contributing](CONTRIBUTING.md) for development and release commands.

## License

[MIT](LICENSE)

## Reference projects

- [Solid](https://github.com/solidjs/solid#readme) introduces its API with a small working example before setup.
- [ripgrep](https://github.com/BurntSushi/ripgrep/blob/14.1.1/README.md) documents input handling alongside the task the tool performs.
