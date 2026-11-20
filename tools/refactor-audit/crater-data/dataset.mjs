import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { loadRules, ruleTextHash } from 'jev-lint/rules'
import { scanWorkspace } from '../moon-workspace.mjs'

const dist = new URL('dist/', import.meta.resolve('jev-lint/package.json'))
const { textSubjects } = await import(new URL('text.js', dist))
const { commitSubjects } = await import(new URL('commits.js', dist))
const here = import.meta.dirname
const revision = '6a1c6a840f72a129d8254b65ee5f743e59107bad'
const repository = 'mizchi/crater'
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const sha = value => createHash('sha256').update(value).digest('hex')
const jsonl = rows => rows.map(r => JSON.stringify(r) + '\n').join('')
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0

export function groupSplit(group, reserved = new Set()) {
  if (reserved.has(group)) return 'test'
  const bucket = Number.parseInt(sha(group).slice(0, 8), 16) % 10
  return bucket === 0 ? 'test' : bucket === 1 ? 'validation' : 'train'
}

export function joinVerdicts(record, rules, expected, reserved, origin = {repository, revision}) {
  const key = (file, rule) => JSON.stringify([file, rule])
  const index = new Map(expected.map(({subject, rule}) => [key(subject.file, rule.id), subject]))
  assert.equal(index.size, expected.length, 'duplicate planned subject')
  const byRule = new Map(rules.map(r => [r.id, r]))
  const rows = []
  for (const answer of record.answers) {
    const id = key(answer.file, answer.rule)
    const subject = index.get(id)
    assert.ok(subject, 'duplicate or unexpected answer: ' + id)
    index.delete(id)
    assert.ok(Number.isFinite(answer.value) && answer.value >= 0 && answer.value <= 1, 'missing or invalid score: ' + id)
    const rule = byRule.get(answer.rule)
    rows.push({id: subject.file + '#' + rule.id, repository:origin.repository, revision:subject.revision ?? origin.revision,
      source:subject.source, group:subject.group, split:groupSplit(subject.group,reserved), task:rule.id,
      question:rule.ask, criteria:rule.criteria, input:subject.input, truncated:subject.truncated,
      labelSource:'jev', model:record.model, threshold:rule.at, score:answer.value,
      label:answer.value >= rule.at ? 'bad' : 'clean'})
  }
  assert.equal(index.size,0,'missing verdicts')
  return rows
}

function git(repo, args, options) {
  return execFileSync('git', args, {cwd:repo, encoding:'utf8', maxBuffer:128 * 1024 * 1024, ...options})
}

// Read immutable blobs in one process; working-tree files and untracked builds never enter the data.
function snapshot(repo) {
  const paths = new Map()
  const tree = git(repo, ['ls-tree','-rz',revision])
  for (const entry of tree.split('\0').filter(Boolean)) {
    const [header, path] = entry.split('\t')
    if (!/\.(mbt|mbti)$|(^|\/)(moon\.(work|pkg|mod))$/.test(path)) continue
    paths.set(path, header.split(' ')[2])
  }
  const hashes = [...new Set(paths.values())]
  const buffer = git(repo, ['cat-file','--batch'], {input:hashes.join('\n')+'\n', encoding:null})
  let offset = 0
  const blobs = new Map()
  for (const hash of hashes) {
    const end = buffer.indexOf(10, offset)
    const [object, type, size] = buffer.toString('ascii',offset,end).split(' ')
    assert.equal(object,hash)
    assert.equal(type,'blob')
    const next = end + 1 + Number(size)
    blobs.set(hash,buffer.toString('utf8',end + 1,next))
    offset = next + 1
  }
  return scanWorkspace([...paths.keys()],path => blobs.get(paths.get(path)))
}

const extraQuestions = {
  'dependency-boundary':'Does protocol handling directly depend on separable framebuffer or image encoding implementation?',
  'shared-state-lifetime':'Is state specific to one render or tree installed in shared mutable storage for the duration of that operation?',
  'named-export-parity':'Is a named function promised in the shown declarations absent from the public ESM entry?',
}

export function reviewedRows(repo, cases, rules, origin = {repository, revision}) {
  const byTask = new Map(rules.map(r => [r.id,r]))
  return cases.map(c => {
    const rev = c.revision ?? origin.revision
    const refs = c.refs.map(({path,start,end}) => {
      const spec = rev + ':' + path
      const blob = git(repo,['rev-parse',spec]).trim()
      const lines = git(repo,['cat-file','blob',blob]).split('\n')
      assert.ok(start >= 1 && end >= start && end <= lines.length, 'invalid line range: '+spec)
      return {path,blob,start,end,text:lines.slice(start-1,end).join('\n')}
    })
    const rule = byTask.get(c.task)
    const question = rule?.ask ?? extraQuestions[c.task]
    assert.ok(question && ['bad','clean'].includes(c.label), c.id)
    return {id:c.id,repository:origin.repository,revision:rev,split:'test',task:c.task,question,criteria:rule?.criteria ?? null,
      input:refs.map(r => `${r.path} L${r.start}-${r.end}\n${r.text}`).join('\n\n'),
      evidence:refs.map(({text,...ref}) => ref),labelSource:'assistant-source-review',label:c.label,reason:c.reason}
  })
}

export function readRecord(pack, rulesDir, recordDir = join(here,'records'), filename = pack) {
  const record = json(join(recordDir,filename+'.json'))
  const loaded = loadRules(join(rulesDir,pack+'.yml'))
  assert.deepEqual(loaded.errors,[])
  assert.equal(record.schema,'jev-lint-run-1')
  assert.equal(record.model,'jev-1.14.0')
  assert.deepEqual(record.cutoffs ?? {}, {})
  const drafts = new Map(record.rules.map(r => [r.id,r]))
  assert.equal(drafts.size,loaded.rules.length)
  for (const rule of loaded.rules) {
    assert.equal(drafts.get(rule.id)?.draft,ruleTextHash(rule),'rule drift: '+rule.id)
    assert.equal(drafts.get(rule.id).at,rule.at,'threshold drift: '+rule.id)
  }
  return {record,rules:loaded.rules}
}

function materialize(repo) {
  const config = join(here,'../rules')
  const modules = readRecord('modules',config)
  const history = readRecord('history',config)
  const {packages,evidence} = snapshot(repo)
  const sourcePaths = new Map(packages.flatMap(p => p.files.map(f => [f.evidencePath,f.path])))
  const text = textSubjects(modules.rules,['.'],process.cwd(),file => evidence.get(file),{extend:() => [...evidence.keys()]})
  const modulePlan = text.map(s => {
    const source = sourcePaths.get(s.file)
    return {rule:s.rule,subject:{file:s.file, source, group:'pkg:'+dirname(source), input:s.text, truncated:!!s.textCut}}
  })
  const range = revision + '~20..' + revision
  const historyPlan = commitSubjects(history.rules,range,repo).subjects.map(s => ({
    rule:s.rule,subject:{file:s.file,revision:s.file,source:s.file,group:'commit:'+s.file,
      input:JSON.stringify({message:s.text,files:s.commit.files,stat:s.commit.stat,diff:s.commit.diff}),truncated:s.commit.truncated},
  }))

  const cases = json(join(here,'review-cases.json'))
  const reviewed = reviewedRows(repo,cases,[...modules.rules,...history.rules])
  const reserved = new Set(cases.flatMap(c => [
    ...c.refs.map(ref => 'pkg:'+dirname(ref.path)),
    ...(c.revision ? ['commit:'+c.revision] : []),
  ]))
  const teacher = [
    ...joinVerdicts(modules.record,modules.rules,modulePlan,reserved),
    ...joinVerdicts(history.record,history.rules,historyPlan,reserved),
  ].sort((a,b) => compare(a.id,b.id))
  assert.equal(new Set(teacher.map(r => r.id)).size,teacher.length)
  assert.equal(new Set(reviewed.map(r => r.id)).size,reviewed.length)
  const scored = new Map(teacher.map(row => [row.source+'#'+row.task,row]))
  const comparisons = cases.filter(c => c.screen).map(c => {
    const row = scored.get(c.screen+'#'+c.task)
    assert.ok(row && row.split === 'test','missing held-out screen: '+c.id)
    return {id:c.id, screen:row.id, reviewed:c.label, jev:row.label, score:row.score}
  })
  return {teacher,reviewed,comparisons}
}

function summarize({teacher,reviewed,comparisons}) {
  const count = (rows, field) => Object.fromEntries([...Map.groupBy(rows, r=>r[field])].map(([k,v])=>[k,v.length]))
  const tp = comparisons.filter(c=>c.reviewed==='bad' && c.jev==='bad').length
  const fp = comparisons.filter(c=>c.reviewed==='clean' && c.jev==='bad').length
  const fn = comparisons.filter(c=>c.reviewed==='bad' && c.jev==='clean').length
  return {schemaVersion:1,repository,revision,model:'jev-1.14.0',jevLint:'0.8.0',
    dataset:{rows:teacher.length,sha256:sha(jsonl(teacher)),labels:count(teacher,'label'),split:count(teacher,'split')},
    reviewed:{rows:reviewed.length,sha256:sha(jsonl(reviewed)),labels:count(reviewed,'label')},
    records:Object.fromEntries(['modules','history'].map(k=>[k,sha(readFileSync(join(here,'records',k+'.json')))])),
    byRule:Object.fromEntries([...Map.groupBy(teacher,r=>r.task)].map(([k,v])=>[k,count(v,'label')])),
    comparisons, agreement:{tp,fp,fn,tn:comparisons.length-tp-fp-fn}}
}

const baselineDir = join(here,'v1')

export function verifyFiles(dir = baselineDir) {
  const manifest = json(join(baselineDir,'manifest.json'))
  assert.deepEqual(json(join(dir,'manifest.json')),manifest,'manifest mismatch')
  assert.equal(sha(gunzipSync(readFileSync(join(dir,'teacher.jsonl.gz')))),manifest.dataset.sha256,'teacher checksum mismatch')
  assert.equal(sha(readFileSync(join(dir,'reviewed.jsonl'))),manifest.reviewed.sha256,'review checksum mismatch')
  for (const [name,hash] of Object.entries(manifest.records)) {
    assert.equal(sha(readFileSync(join(here,'records',name+'.json'))),hash,'record checksum mismatch: '+name)
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [repo,out] = process.argv.slice(2)
  if (repo === '--verify') {
    const {dataset,reviewed} = verifyFiles(out)
    console.log(`Verified ${dataset.rows} Jev rows and ${reviewed.rows} source reviews`)
  } else {
    if (!repo || !out) throw Error('Usage: node dataset.mjs <crater-git-checkout> <new-output-dir> | --verify [dir]')
    // Keep Git's abbreviated index lines identical even in a shallow clone.
    const n = Number(process.env.GIT_CONFIG_COUNT ?? 0)
    process.env.GIT_CONFIG_COUNT = String(n + 1)
    process.env['GIT_CONFIG_KEY_' + n] = 'core.abbrev'
    process.env['GIT_CONFIG_VALUE_' + n] = '8'
    const rows = materialize(resolve(repo))
    const manifest = summarize(rows)
    assert.deepEqual(manifest,json(join(baselineDir,'manifest.json')),'regenerated dataset differs from v1')
    mkdirSync(dirname(resolve(out)),{recursive:true})
    mkdirSync(out)
    writeFileSync(join(out,'teacher.jsonl.gz'),gzipSync(jsonl(rows.teacher),{level:9}))
    writeFileSync(join(out,'reviewed.jsonl'),jsonl(rows.reviewed))
    writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    verifyFiles(out)
    console.log(JSON.stringify({teacher:manifest.dataset, reviewed:manifest.reviewed, agreement:manifest.agreement}))
  }
}
