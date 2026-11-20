import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { loadRules, ruleTextHash } from 'jev-lint/rules'

export function labeledRows(dir,record) {
  const {rules,errors}=loadRules(join(import.meta.dirname,'../rules/architecture.yml'))
  assert.deepEqual(errors,[])
  assert.equal(record.schema,'jev-lint-run-1')
  assert.equal(record.model,'jev-1.14.0')
  assert.deepEqual(record.cutoffs ?? {},{})
  const inventory=JSON.parse(readFileSync(join(dir,'inventory.json'),'utf8'))
  const answers=new Map(record.answers.map(a=>[a.file,a]))
  assert.equal(answers.size,record.answers.length,'duplicate answers')
  for(const rule of rules) {
    const saved=record.rules.find(r=>r.id===rule.id)
    assert.equal(saved?.draft,ruleTextHash(rule),'rule drift')
    assert.equal(saved.at,rule.at,'cutoff drift')
  }
  const rows=inventory.candidates.map(c=>{
    const a=answers.get(c.file)
    const rule=rules.find(r=>r.id===c.rule)
    assert.equal(a?.rule,c.rule,'missing or unexpected answer')
    assert.ok(Number.isFinite(a.value) && a.value>=0 && a.value<=1,'incomplete answer')
    answers.delete(c.file)
    const input=readFileSync(join(dir,c.file),'utf8')
    assert.equal(createHash('sha256').update(input).digest('hex'),c.sha256,'evidence drift')
    return {...c,repository:inventory.repository,question:rule.ask,criteria:rule.criteria,input,
      model:record.model,labelSource:'jev',threshold:rule.at,score:a.value,label:a.value>=rule.at?'bad':'clean'}
  })
  assert.equal(answers.size,0,'unplanned answers')
  return rows
}

if(process.argv[1] && resolve(process.argv[1])===import.meta.filename) {
  const [dir,record,out]=process.argv.slice(2)
  const rows=labeledRows(dir,JSON.parse(readFileSync(record,'utf8')))
  const data=rows.map(r=>JSON.stringify(r)+'\n').join('')
  writeFileSync(out,gzipSync(data,{level:9}),{flag:'wx'})
  console.log(JSON.stringify({rows:rows.length,sha256:createHash('sha256').update(data).digest('hex')}))
}
