/** Paths in inventory.json are relative to the source manifest. Lines are 1-based. */
export interface Entry {
  name: string
  file: string
  symbols: Array<{ name: string; file: string | null; line: number | null }>
}

export interface Module {
  file: string
  lines: number
  moduleExports: number
  publicBindings: Array<{ entry: string; name: string; line: number }>
  hiddenState: Array<{
    name: string
    line: number
    kind: 'rebindable' | 'container'
    writeLines: number[]
  }>
  internalTypeReferences: Array<{
    api: string
    line: number
    type: string
    targetFile: string
    targetLine: number
  }>
  tests: string[]
}

export interface Inventory {
  schemaVersion: 1
  package: string | null
  summary: {
    entries: number
    publicNames: number
    modules: number
    publicDefinitionModules: number
    sourceLines: number
    internalTypeReferences: number
    hiddenStateWithWrites: number
    hiddenStateCandidates: number
  }
  entries: Entry[]
  modules: Module[]
  issues: string[]
}

export function audit(manifestPath: string): { report: Inventory; evidence: Map<string, string> }
export function writeEvidence(out: string, report: Inventory, evidence: ReadonlyMap<string, string>): void

export function auditSources(root: string, packageName: string | null,
  entries: Array<{name: string; file: string}>, additionalFiles?: string[],
  options?: import('typescript').CompilerOptions): { report: Inventory; evidence: Map<string, string> }
