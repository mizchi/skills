/** Process exit plumbing and argv helpers shared by the sub-commands. */
export class ExitCode extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

/** Value following `name` in argv, e.g. flagValue(["--task", "t1"], "--task") === "t1". */
export function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
