// Fresh Node processes, warm filesystem; includes startup and evidence-file I/O.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const manifest = resolve(process.argv[2])
const range = process.argv[3]
const root = dirname(manifest)
const here = import.meta.dirname
const cli = fileURLToPath(new URL('dist/cli.js', import.meta.resolve('jev-lint/package.json')))
const temp = mkdtempSync(join(tmpdir(), 'refactor-benchmark-'))
const timings = {inventory: [], modules: [], history: []}
function run(phase, args, cwd) {
  const start = performance.now()
  const output = execFileSync(process.execPath, args, {cwd, encoding: 'utf8'})
  timings[phase].push(Math.round(performance.now() - start))
  return JSON.parse(output)
}
function plan(phase, command, cwd, ruleFile) {
  const result = run(phase, [cli, ...command, '--no-config', '--cache', 'none', '-R',
    join(here, 'rules', ruleFile), '--dry-run', '--json'], cwd)
  if (!result.subjects || result.silentRules.length) throw new Error(`Missing subjects in ${phase}`)
  return {subjects: result.subjects, requests: result.requests, estimatedTokens: result.tokens,
    estimatedUSD: result.usd, subjectsByRule: Object.fromEntries(result.byRule.map(r => [r.rule, r.subjects]))}
}
try {
  let report, modules, history
  for (let i = 1; i <= 3; i++) {
    const evidence = join(temp, String(i))
    run('inventory', [join(here, 'cli.mjs'), manifest, evidence], here)
    report = JSON.parse(readFileSync(join(evidence, 'inventory.json'), 'utf8'))
    modules = plan('modules', ['check', '.'], evidence, 'modules.yml')
    history = plan('history', ['commits', range], root, 'history.yml')
  }
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim()
  const versions = Object.fromEntries(['typescript','jev-lint'].map(name => [
    name, JSON.parse(readFileSync(fileURLToPath(import.meta.resolve(name + '/package.json')), 'utf8')).version,
  ]))
  console.log(JSON.stringify({
    mode: 'offline-dry-run', node: process.version, platform: process.platform, arch: process.arch, versions,
    package: report.package, revision: git('rev-parse','HEAD'), dirty: Boolean(git('status','--porcelain')),
    historyRange: range, summary: report.summary, issues: report.issues, modules, history, elapsedMs: timings,
    medianMs: Object.fromEntries(Object.entries(timings).map(([k,v]) => [k,v.toSorted((a,b) => a-b)[1]])),
    internalReferences: report.modules.filter(m => m.internalTypeReferences.length)
      .map(m => ({file: m.file, references: m.internalTypeReferences})),
  }, null, 2))
} finally {
  rmSync(temp, {recursive:true,force:true})
}
