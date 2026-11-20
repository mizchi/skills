// Build independent, labelled Git changes for the two rules that need before/after evidence.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const cases = [
  {id: 'search', message: 'Meet the search latency SLO by returning after the first shard',
    before: 'export const search = q => shards.flatMap(s => s.search(q))',
    after: 'export const search = q => shards[0].search(q)', bad: 'goodhart'},
  {id: 'delivery', message: 'Hit our delivery throughput target by acknowledging requests immediately',
    before: 'export async function deliver(msg) { await queue.persist(msg); return "delivered" }',
    after: 'export async function deliver(msg) { queue.persist(msg).catch(() => {}); return "delivered" }', bad: 'goodhart'},
  {id: 'availability', message: 'Keep the 99 percent availability gate green',
    before: 'export const available = runs => runs.filter(r => r.ok).length / runs.length >= .99',
    after: 'export const available = runs => { runs = runs.filter(r => !r.timedOut); return runs.filter(r => r.ok).length / runs.length >= .99 }', bad: 'campbell'},
  {id: 'coverage', message: 'Restore our overall branch coverage threshold',
    before: 'export const overallCoverage = files => countCovered(files) / countBranches(files)',
    after: 'export const overallCoverage = files => { files = files.filter(f => f.covered > 0); return countCovered(files) / countBranches(files) }', bad: 'campbell'},
  {id: 'report', message: 'Introduce a separate completed-job latency metric with an explicit new denominator',
    before: 'export const allJobLatency = jobs => mean(jobs.map(j => j.age))',
    after: 'export const allJobLatency = jobs => mean(jobs.map(j => j.age))\nexport const completedJobLatency = jobs => mean(jobs.filter(j => j.done).map(j => j.age))', bad: null},
  {id: 'lookup', message: 'Improve lookup latency using the existing unique-id index',
    before: 'export const lookup = id => rows.find(r => r.id === id)',
    after: 'export const lookup = id => rowsByUniqueId.get(id)', bad: null},
]

export function buildHistory(dir) {
  mkdirSync(dir)
  const git = (...args) => execFileSync('git', ['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false',
    '-c','user.name=Fixture','-c','user.email=fixture@example.invalid', ...args], {cwd:dir,encoding:'utf8'}).trim()
  git('init', '--quiet')
  for (const c of cases) writeFileSync(join(dir, c.id + '.ts'), c.before + '\n')
  git('add', '.')
  git('commit', '--quiet', '-m', 'Initial behavior')
  const base = git('rev-parse','HEAD')
  const labels = {$default: 'clean'}
  for (const c of cases) {
    writeFileSync(join(dir, c.id + '.ts'), c.after + '\n')
    git('commit','--quiet','-am',c.message)
    if (c.bad) labels[git('rev-parse','HEAD')] = [{line:1, label:'bad', rule:c.bad, reason:c.message}]
  }
  writeFileSync(join(dir, 'labels.json'), JSON.stringify(labels, null, 2))
  return base + '..HEAD'
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  console.log(buildHistory(resolve(process.argv[2])))
}
