import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { packageEdges, cycleWitnesses, recurringPairs, referenceCase } from './evidence.mjs'

const dirs = new Map([['apps/a','@ex/a'],['apps/b','@ex/b'],['apps/c','@ex/c']])
test('static imports distinguish runtime, types and tests and preserve the actual witness lines', () => {
  const files = new Map([
    ['apps/a/src/index.ts',"// comment\nexport { x } from '@ex/b/nested'"],
    ['apps/b/src/index.ts',"import { type T } from '@ex/a'\nexport const x=0"],
    ['apps/c/src/index.ts',"export const z = import('@ex/a')"],
    ['apps/a/src/index.test.ts',"import {z} from '../../c/src/index.ts'"],
  ])
  const edges = packageEdges(dirs,files)
  assert.deepEqual(edges.map(e=>[e.from,e.to,e.kind,e.line]).sort(), [
    ['@ex/a','@ex/b','runtime',2],['@ex/a','@ex/c','test',1],
    ['@ex/b','@ex/a','type',1],['@ex/c','@ex/a','runtime',1]])
  const cycles = cycleWitnesses(edges)
  assert.deepEqual(cycles.map(c=>c.kind).sort(),['test','type'])
  for (const c of cycles) assert.equal(c.edges[0].from,c.edges.at(-1).to)
  assert.deepEqual(cycleWitnesses(edges.filter(e=>e.kind==='runtime')),[])
})
test('a runtime loop gets one canonical witness and edges in an acyclic tail are excluded', () => {
  const e = (from,to)=>({from,to,kind:'runtime'})
  const [cycle,...rest]=cycleWitnesses([e('c','a'),e('a','b'),e('b','c'),e('b','d')])
  assert.equal(rest.length,0)
  assert.deepEqual(cycle.edges.map(e=>e.from),['a','b','c'])
})
test('repeated changes require different commits and both packages', () => {
  const change = (sha,names) => ({sha,packages:new Map(names.map(n=>[n,['example.ts']]))})
  assert.deepEqual(recurringPairs([change('1',['a','b']),change('2',['b']),change('3',['b','a'])])
    .map(p=>[p.names,p.commits.map(c=>c.sha)]),[[['a','b'],['1','3']]])
})
test('contracts absent from the evidence stay insufficient and source ranges are checked', () => {
  const item={id:'strings',rule:'liskov-substitution',refs:{implementation:[['src.ts',1,1]]}}
  assert.deepEqual(referenceCase(item,()=> 'fn').missing,['contract','alternative','example'])
  const refs=Object.fromEntries(['contract','implementation','alternative','example'].map(k=>[k,[['src.ts',2,2]]]))
  const full=referenceCase({...item,refs},()=> 'first\nsecond')
  assert.match(full.text,/src.ts:2-2\n2\| second/)
  assert.throws(()=>referenceCase({...item,refs},()=> 'first'),/range/)
})
const here=import.meta.dirname
test('each architecture rule has explicit difficult positive, negative and unrelated controls matched by Jev', () => {
  const cases=JSON.parse(readFileSync(join(here,'controls/case-coverage.json'))).cases
  const labels=JSON.parse(readFileSync(join(here,'controls/labels.json')))
  const cli=new URL('dist/cli.js',import.meta.resolve('jev-lint/package.json'))
  const plan=JSON.parse(execFileSync(process.execPath,[cli.pathname,'check','fixtures','-R',join(here,'../rules/architecture.yml'),'--no-config','--cache','none','--dry-run','--json'],{cwd:join(here,'controls')}))
  assert.equal(plan.byRule.length,5)
  for(const {rule,subjects} of plan.byRule){
    const matches=cases.filter(c=>c.rule===rule)
    assert.equal(subjects,matches.length)
    assert.deepEqual(new Set(matches.map(c=>c.kind)),new Set(['false-positive-risk','false-negative-risk','unrelated']))
    for(const c of matches) {
      assert.equal(labels[c.fixture][0].label,c.label)
      assert.equal(labels[c.fixture][0].rule,rule)
      assert.ok(readFileSync(join(here,'controls',c.fixture),'utf8').trim())
    }
  }
})

test('typed provider substitution, forced stubs and imported mutable layouts produce cross-file evidence',async()=>{
  const {discoverContracts}=await import('./contracts.mjs')
  const files=new Map([
    ['src/api.ts','/** Accepts all string keys, including the empty key. */\nexport interface Store { read(k:string):string; purge():void }\n/** @internal */\nexport const slots = [3, 4]'],
    ['src/reader.ts',"import {type Store, slots} from './api'\nexport const local:Store={read(k){ return k },purge(){ throw Error('immutable') }}\nexport const remote:Store={read(k){ if(!k)throw Error('key');return k },purge(){ reset() }}\nexport function read(s:Store){return s.read('')}\nexport function count(){return slots[0]}"],
  ])
  const {cases:hits,consumers}=discoverContracts(files,{})
  assert.deepEqual(consumers.find(c=>c.name==='Store').clients,[{file:'src/reader.ts',called:['read']}])
  for(const rule of ['liskov-substitution','interface-segregation','parnas-information-hiding']) {
    const item=hits.find(c=>c.rule===rule)
    assert.ok(item,rule)
    assert.match(item.text,/src\/api.ts:/)
    assert.match(item.text,/src\/reader.ts:/)
  }
})

test('scan reads only pinned Git blobs and combines actual patches and import edges across packages',async t=>{
  const {mkdtempSync,mkdirSync,rmSync,writeFileSync}=await import('node:fs')
  const {tmpdir}=await import('node:os')
  const {scan}=await import('./scan.mjs')
  const dir=mkdtempSync(join(tmpdir(),'architecture-fixture-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim()
  git('init','-q')
  for(const pkg of ['alpha','beta']) {
    mkdirSync(join(dir,pkg,'src'),{recursive:true})
    writeFileSync(join(dir,pkg,'package.json'),JSON.stringify({name:pkg,exports:{'.':'./src/main.ts'}}))
  }
  for(const value of [2,5]) {
    for(const [pkg,dep] of [['alpha','beta'],['beta','alpha']]) {
      writeFileSync(join(dir,pkg,'src/main.ts'),"import {x as peer} from '"+dep+"'\nexport const x="+value+"\nexport const read=()=>peer")
    }
    git('add','.')
    git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Adjust shared value to '+value)
  }
  writeFileSync(join(dir,'alpha/src/main.ts'),'this is unrelated dirty content')
  const spec={repository:'example/test',revision:git('rev-parse','HEAD'),historyDepth:2,packages:['*'],sourceDirs:['src']}
  const {report,evidence}=scan(dir,spec)
  assert.deepEqual(new Set(report.candidates.map(c=>c.rule)),new Set(['acyclic-dependencies','common-closure']))
  assert.equal(report.cycles[0].kind,'runtime')
  assert.equal(report.commits.length,2)
  assert.ok([...evidence.values()].every(text=>!text.includes('unrelated dirty content')))
  const patch=[...evidence].find(([k])=>k.endsWith('.ccp'))[1]
  assert.ok(report.commits.every(sha=>patch.includes(sha)))
  assert.match(patch,/\+export const x=5/)
})

test('record join rejects unplanned, stale or missing scores',async t=>{
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs')
  const {tmpdir}=await import('node:os')
  const {createHash}=await import('node:crypto')
  const {loadRules,ruleTextHash}=await import('jev-lint/rules')
  const {labeledRows}=await import('./dataset.mjs')
  const dir=mkdtempSync(join(tmpdir(),'architecture-record-'))
  t.after(()=>rmSync(dir,{force:true,recursive:true}))
  const rules=loadRules(join(here,'../rules/architecture.yml')).rules
  const rule=rules[0], file='unit.lsp'
  const input='an example'
  const candidate={file,rule:rule.id,id:'example',revision:'abc',sha256:createHash('sha256').update(input).digest('hex')}
  writeFileSync(join(dir,file),input)
  writeFileSync(join(dir,'inventory.json'),JSON.stringify({repository:'fixture',candidates:[candidate]}))
  const answer={file,rule:rule.id,value:rule.at}
  const record={schema:'jev-lint-run-1',model:'jev-1.14.0',rules:rules.map(r=>({id:r.id,at:r.at,draft:ruleTextHash(r)})),answers:[answer]}
  assert.equal(labeledRows(dir,record)[0].label,'bad')
  for(const answers of [[],[answer,answer],[{...answer,value:null}],[answer,{...answer,file:'extra'}]]) {
    assert.throws(()=>labeledRows(dir,{...record,answers}))
  }
  writeFileSync(join(dir,file),'changed')
  assert.throws(()=>labeledRows(dir,record),/evidence drift/)
})
