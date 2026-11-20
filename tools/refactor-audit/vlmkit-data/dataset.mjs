import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { joinVerdicts, readRecord, reviewedRows } from '../crater-data/dataset.mjs'
import { revision, inputs } from './inputs.mjs'
import { compactHistory } from './retry-history.mjs'

const dist = new URL('dist/', import.meta.resolve('jev-lint/package.json'))
const { textSubjects } = await import(new URL('text.js', dist))
const { commitSubjects } = await import(new URL('commits.js', dist))
const here = import.meta.dirname
const repository = 'mizchi/vlmkit'
const origin = {repository,revision}
const hash = data => createHash('sha256').update(data).digest('hex')
const json = file => JSON.parse(readFileSync(file,'utf8'))
const jsonl = rows => rows.map(r => JSON.stringify(r)+'\n').join('')
const read = (pack,filename) => readRecord(pack,join(here,'../rules'),join(here,'records'),filename)
const sorted = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0

function publicSurface(entries) {
  const names = es => new Set(es.flatMap(e => e.symbols.map(s => JSON.stringify([s.file,s.line,s.name]))))
  const explicit = entries.filter(e => !e.name.endsWith('.ts'))
  const all = names(entries).size
  return {paths:entries.length,wildcardPaths:entries.length-explicit.length,
    distinctNames:all,wildcardOnlyNames:all-names(explicit).size}
}

function materialize(repo,out) {
  const {report,evidence} = inputs(repo)
  const modules = read('modules')
  const history = read('history')
  const retry = read('history','history-retry')
  const moonRoot = 'packages/vlmkit-markup/'
  const moonPaths = new Map(report.moon.flatMap(p => p.files.map(f => [moonRoot+f.evidencePath,moonRoot+f.path])))
  const modulePlan = textSubjects(modules.rules,['.'],process.cwd(),file => evidence.get(file),{extend:() => [...evidence.keys()]}).map(s => {
    const source = moonPaths.get(s.file) ?? s.file.replace(/\.(surface|impl)$/,'')
    return {rule:s.rule,subject:{file:s.file,source,group:'pkg:'+(source.match(/^packages\/[^/]+/)?.[0] ?? source.split('/')[0]),
      input:s.text,truncated:!!s.textCut}}
  })

  const missing = new Set(history.record.answers.filter(a=>a.value===null).map(a=>a.file+'#'+a.rule))
  const retried = retry.record.answers.map(a=>a.file+'#'+a.rule)
  assert.deepEqual([...missing].sort(),retried.sort(),'retry must cover exactly the original missing verdicts')
  const range = revision+'~20..'+revision
  const historyPlan = commitSubjects(history.rules,range,repo).subjects.map(s => {
    const shortened = missing.has(s.file+'#'+s.rule.id)
    const state = {message:s.text,files:s.commit.files,stat:s.commit.stat,diff:s.commit.diff}
    return {rule:s.rule,subject:{file:s.file,revision:s.file,source:s.file,group:'commit:'+s.file,
      input:JSON.stringify(shortened ? compactHistory(state) : state),truncated:shortened || s.commit.truncated}}
  })
  const records = {...history.record,answers:[...history.record.answers.filter(a=>a.value!==null),...retry.record.answers]}
  const holdout = new Set([...modulePlan,...historyPlan].map(s=>s.subject.group))
  const rows = [...joinVerdicts(modules.record,modules.rules,modulePlan,holdout,origin),
    ...joinVerdicts(records,history.rules,historyPlan,holdout,origin)].sort(sorted)
  const cases = json(join(here,'review-cases.json'))
  const reviewed = reviewedRows(repo,cases,[...modules.rules,...history.rules],origin)
  const comparisons = cases.map(c => {
    const row = rows.find(r=>r.source===c.screen && r.task===c.task)
    assert.ok(row,c.id)
    return {review:c.id,teacher:row.id,score:row.score,jev:row.label,reviewed:c.label}
  })
  const {entries,summary,issues} = report.typescript
  const packages = Map.groupBy(entries,e=>e.name.split('/').slice(0,2).join('/'))
  const manifest = {schemaVersion:1,...origin,model:modules.record.model,jevLint:'0.8.0',split:'test',
    inventory:{typescript:summary,unresolved:issues.length,publicSurface:publicSurface(entries),
      byPackage:Object.fromEntries([...packages].map(([p,es])=>[p,publicSurface(es)])),
      moon:{packages:report.moon.length,files:moonPaths.size,lines:report.moon.reduce((n,p)=>n+p.sourceLines,0)}},
    rows:rows.length,teacherSha256:hash(jsonl(rows)),reviewedSha256:hash(jsonl(reviewed)),comparisons,
    byRule:Object.fromEntries([...Map.groupBy(rows,r=>r.task)].map(([k,rs])=>[k,{rows:rs.length,bad:rs.filter(r=>r.label==='bad').length}])),
    historyRetry:{rows:retried.length,commits:new Set(retry.record.answers.map(a=>a.file)).size},
    records:Object.fromEntries(['modules','history','history-retry'].map(k=>[k,hash(readFileSync(join(here,'records',k+'.json')))]))}
  mkdirSync(out)
  writeFileSync(join(out,'teacher.jsonl.gz'),gzipSync(jsonl(rows),{level:9}))
  writeFileSync(join(out,'reviewed.jsonl'),jsonl(reviewed))
  writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
}

function verify(dir) {
  const baseline = json(join(here,'v1/manifest.json'))
  assert.deepEqual(json(join(dir,'manifest.json')),baseline)
  assert.equal(hash(gunzipSync(readFileSync(join(dir,'teacher.jsonl.gz')))),baseline.teacherSha256)
  assert.equal(hash(readFileSync(join(dir,'reviewed.jsonl'))),baseline.reviewedSha256)
  for (const [k,h] of Object.entries(baseline.records)) assert.equal(hash(readFileSync(join(here,'records',k+'.json'))),h)
  console.log('Verified '+baseline.rows+' scores and '+baseline.comparisons.length+' source reviews')
}

const [repo,out] = process.argv.slice(2)
if (repo === '--verify') verify(out ?? join(here,'v1'))
else {
  assert.ok(repo && out,'Usage: node dataset.mjs <vlmkit-checkout> <new-output-dir> | --verify [dir]')
  // Match the index lines in the original Git diff even when object counts differ.
  const n = Number(process.env.GIT_CONFIG_COUNT ?? 0)
  process.env.GIT_CONFIG_COUNT = String(n+1)
  process.env['GIT_CONFIG_KEY_'+n] = 'core.abbrev'
  process.env['GIT_CONFIG_VALUE_'+n] = '8'
  materialize(resolve(repo),resolve(out))
  verify(out)
}
