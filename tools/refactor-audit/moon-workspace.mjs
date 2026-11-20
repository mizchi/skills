// Snapshot audit of a MoonBit DSL workspace. Counts the checked-in interfaces across targets.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import { writeEvidence } from './audit.mjs'

const quoted = text => [...text.matchAll(/"([^"]+)"/g)].map(m => m[1])
const stripComments = text => text.replace(/\/\/[^\n]*/g, '')
const publicLine = /^pub(?:\(\w+\))?\s+/

function imports(manifest) {
  const names = new Set()
  for (const block of stripComments(manifest).matchAll(/\bimport\s*\{([^}]*)\}(?:\s+for\s+"([^"]+)")?/g)) {
    if (!block[2]) for (const name of quoted(block[1])) names.add(name)
  }
  return [...names].sort()
}

export function scanWorkspace(paths, read) {
  const tracked = new Set(paths)
  const memberList = stripComments(read('moon.work')).match(/\bmembers\s*=\s*\[([^\]]+)\]/)
  if (!memberList) throw new Error('Expected explicit moon.work members')
  const members = new Set(quoted(memberList[1]).map(p => normalize(p)))
  const groups = Map.groupBy(paths, dirname)
  const packages = []
  const excludedPackages = []
  const evidence = new Map()
  const otherModuleRoots = new Set(paths.filter(p => p === 'moon.mod' || p.endsWith('/moon.mod')).map(dirname))

  for (const manifest of paths.filter(p => p === 'moon.pkg' || p.endsWith('/moon.pkg'))) {
    const dir = dirname(manifest)
    let moduleDir = dir
    while (!otherModuleRoots.has(moduleDir) && moduleDir !== '.') moduleDir = dirname(moduleDir)
    if (!members.has(moduleDir)) {
      excludedPackages.push(dir)
      continue
    }
    const moduleName = read(join(moduleDir, 'moon.mod')).match(/^name\s*=\s*"([^"]+)"/m)?.[1]
    if (!moduleName) throw new Error(`Missing module name in ${moduleDir}`)
    const name = join(moduleName, relative(moduleDir, dir))
    const iface = join(dir, 'pkg.generated.mbti')
    const signatures = tracked.has(iface) ? read(iface).split('\n').filter(s => publicLine.test(s)) : null
    const p = {dir, name, publicDeclarations: signatures?.length ?? null,
      publicRefs: signatures?.filter(s => /^pub let \w+\s*:\s*(?:@\w+\.)?Ref\[/.test(s)) ?? null,
      dependencies: imports(read(manifest)), importedBy: [], files: [], sourceLines: 0, privateRefs: []}
    for (const file of groups.get(dir).filter(f => f.endsWith('.mbt') && !/_(?:wb)?test\.mbt$/.test(f))) {
      const text = read(file)
      const lines = text.split('\n')
      if (lines.at(-1) === '') lines.pop()
      const declarations = []
      for (const [index, line] of lines.entries()) {
        if (publicLine.test(line)) declarations.push(`${index + 1}: ${line}`)
        const state = line.match(/^(?:priv\s+)?let\s+(\w+)\s*:\s*(?:@\w+\.)?Ref\[/)
        if (state) p.privateRefs.push({name: state[1], file, line: index + 1})
      }
      const adjacent = ['_test.mbt','_wbtest.mbt'].map(s => file.slice(0,-4) + s).filter(f => tracked.has(f))
      const body = [
        `MoonBit package: ${name}; source: ${file}`,
        'Package-public source declarations in this file (all tracked target variants):',
        ...declarations, 'Same-stem test excerpts (other tests may exist):',
        ...adjacent.map(f => f + '\n' + read(f).slice(0, 2400)), 'Source starting at line 1:', text,
      ].join('\n')
      // A source package may be named build, which jev-lint skips during its walk.
      const parts = file.split('/')
      const filename = parts.pop()
      const evidencePath = join(...parts.map(d => 'pkg-' + d), filename + (declarations.length ? '.surface' : '.impl'))
      evidence.set(evidencePath, body)
      p.files.push({path: file, evidencePath, lines: lines.length, evidenceOver48000: body.length > 48000})
      p.sourceLines += lines.length
    }
    packages.push(p)
  }
  const byName = new Map(packages.map(p => [p.name, p]))
  for (const p of packages) {
    p.workspaceDependencies = p.dependencies.filter(name => byName.has(name))
    for (const name of p.workspaceDependencies) byName.get(name).importedBy.push(p.name)
  }
  return {packages, excludedPackages, evidence}
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [repo, output] = process.argv.slice(2)
  if (!repo || !output) throw new Error('Usage: node moon-workspace.mjs <repository> <new-directory>')
  const git = (...args) => execFileSync('git', args, {cwd:repo, encoding:'utf8', maxBuffer:64*1024*1024})
  const paths = git('ls-files','-z','--','*.mbt','*.mbti','moon.work','*moon.mod','*moon.pkg').split('\0').filter(Boolean)
  const {packages, excludedPackages, evidence} = scanWorkspace(paths, file => readFileSync(join(repo,file),'utf8'))
  const files = packages.flatMap(p => p.files)
  const summary = {packages:packages.length, interfaces:packages.filter(p => p.publicDeclarations !== null).length,
    publicDeclarations:packages.reduce((n,p) => n + (p.publicDeclarations ?? 0),0), sourceFiles:files.length,
    sourceLines:packages.reduce((n,p) => n + p.sourceLines,0), privateRefDeclarations:packages.reduce((n,p) => n + p.privateRefs.length,0),
    evidenceOver48000:files.filter(f => f.evidenceOver48000).length}
  writeEvidence(output, {schema:'moon-workspace-inventory-1', revision:git('rev-parse','HEAD').trim(),
    trackedChanges:git('status','--porcelain','-uno').trim(), summary, excludedPackages, packages}, evidence)
  console.log(JSON.stringify(summary))
}
