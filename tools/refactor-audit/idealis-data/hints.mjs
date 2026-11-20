// Build blind paired questions from the hints actually displayed by normal CLI replay.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const [cli,modules,architecture,out]=process.argv.slice(2)
mkdirSync(out)
const labels={}
for (const [group,dir] of [['modules',modules],['architecture',architecture]]) {
  const record=join(import.meta.dirname,'records',group+'.json')
  const result=JSON.parse(execFileSync(process.execPath,[resolve(cli),'replay',record,'--no-config','--json'],{encoding:'utf8'}))
  for(const f of result.findings) {
    assert.equal(f.category,'advisory')
    assert.ok(f.nextCheck)
    const evidence=readFileSync(join(dir,f.file),'utf8')
    for(const [i,hint] of ['Review the relevant code before making a change.',f.nextCheck].entries()) {
      const name=[group,f.rule,f.file.replaceAll('/','__'),i].join('-')+'.hintreview'
      writeFileSync(join(out,name),['Question',f.message,'Evidence',evidence,'Proposed next check',hint].join('\n'))
      labels[name]=[{line:1,label:i?'bad':'clean',reason:'Evaluate whether the instruction gives a discriminating check.'}]
    }
  }
}
assert.equal(Object.keys(labels).length,10)
writeFileSync(join(out,'labels.json'),JSON.stringify(labels,null,2))
