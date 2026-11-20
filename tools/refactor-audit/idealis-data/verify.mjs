import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here=import.meta.dirname
const read=path=>JSON.parse(readFileSync(path,'utf8'))
const record=name=>read(join(here,'records',name+'.json'))
const sha=data=>createHash('sha256').update(data).digest('hex')
const manifest=read(join(here,'architecture.json'))
const subjects=new Map()
const groups={}
for(const group of ['modules','architecture','history','history-retry']){
  const run=record(group)
  const rules=new Map(run.rules.map(r=>[r.id,r]))
  assert.ok(run.rules.every(r=>r.category==='advisory' && r.nextCheck))
  for(const a of run.answers){
    const key=[group.replace('-retry',''),a.file,a.rule].join('#')
    if(group.endsWith('-retry')) assert.equal(subjects.get(key)?.value,null)
    else assert.ok(!subjects.has(key))
    subjects.set(key,{...a,ruleInfo:rules.get(a.rule)})
  }
}
for(const [key,a] of subjects){
  assert.ok(Number.isFinite(a.value))
  const group=key.split('#')[0]
  groups[group]??={total:0,reported:0}
  groups[group].total++
  if(a.value>=a.ruleInfo.at) groups[group].reported++
}
assert.deepEqual(groups,{modules:{total:456,reported:4},architecture:{total:9,reported:1},history:{total:72,reported:0}})
const review=record('hints'),rows=[]
assert.equal(review.passes.length,3)
for(const [key,a] of subjects){
  if(a.value<a.ruleInfo.at) continue
  const group=key.split('#')[0]
  for(const [id,variant] of ['generic','shipped'].entries()){
    const file=[group,a.rule,a.file.replaceAll('/','__'),id].join('-')+'.hintreview'
    const judges=review.passes.map(pass=>pass.find(r=>r.file===file))
    const input=judges[0].text
    assert.ok(judges.every(r=>r.text===input && Number.isFinite(r.value) && (r.value>=review.rules[0].at)===(variant==='shipped')))
    assert.equal(input.split('\nProposed next check\n').at(-1),id?a.ruleInfo.nextCheck:'Review the relevant code before making a change.')
    rows.push({revision:manifest.revision,group,rule:a.rule,file:a.file,score:a.value,cutoff:a.ruleInfo.at,variant,
      model:review.model,reviewCutoff:review.rules[0].at,reviewScores:judges.map(r=>r.value),labelSource:'jev-hint-review',
      input,inputSha256:sha(input)})
  }
}
assert.equal(rows.length,10)
assert.ok(review.passes.every(p=>p.length===10))
rows.sort((a,b)=>a.file.localeCompare(b.file,'en')||a.variant.localeCompare(b.variant,'en'))
const teacher=rows.map(r=>JSON.stringify(r)).join('\n')+'\n'
if(process.argv[2]==='--write-teacher') writeFileSync(process.argv[3],teacher,{flag:'wx'})
else assert.equal(readFileSync(join(here,'teacher.jsonl'),'utf8'),teacher)
if (process.argv[2]==='--inputs' || process.argv[2]==='--record-inputs') {
  const [, ,mode,modules,arch]=process.argv
  const files=[]
  for (const [group,dir,ext] of [['modules',modules,/\.(surface|impl)$/],['architecture',arch,/\.(lsp|isp|parnas|ccp|adp)$/]]) {
    for (const file of readdirSync(dir,{recursive:true}).filter(f=>ext.test(f)).sort())
      files.push({group,file,sha256:sha(readFileSync(join(dir,file)))})
  }
  assert.equal(files.length,101)
  if(mode==='--record-inputs') writeFileSync(join(here,'inputs.json'),JSON.stringify(files,null,2)+'\n',{flag:'wx'})
  else assert.deepEqual(read(join(here,'inputs.json')),files)
}
console.log(JSON.stringify({groups,teacherRows:rows.length,teacherSha256:sha(teacher)}))
