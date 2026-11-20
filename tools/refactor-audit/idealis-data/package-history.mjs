// Add package-level evidence from registered Cargo path dependencies and repeated product changes.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const [checkout,archive,evidenceDir] = process.argv.slice(2)
const inventory=JSON.parse(readFileSync(join(evidenceDir,'inventory.json')))
const { revision }=inventory
const git=(...args)=>execFileSync('git',['-c','core.abbrev=12','--no-pager',...args],{cwd:checkout,encoding:'utf8',maxBuffer:32*1024*1024})
const crates=readdirSync(join(archive,'crates')).sort()
const edges=[]
for (const crate of crates) {
  const dir=resolve(archive,'crates',crate)
  const result=execFileSync('cargo',['metadata','--offline','--locked','--no-deps','--format-version','1'],{cwd:dir,encoding:'utf8'})
  const pkg=JSON.parse(result).packages.find(p=>p.name===crate)
  for(const dep of pkg.dependencies)
    if(dep.path && crates.includes(basename(dep.path))) edges.push({from:crate,to:dep.name,kind:dep.kind??'normal'})
}
// This pinned crate graph is acyclic, so no ADP judgment is submitted.
function visit(name,path) {
  assert.ok(!path.includes(name),'unexpected cycle: '+[...path,name].join(' -> '))
  for(const edge of edges.filter(e=>e.from===name)) visit(edge.to,[...path,name])
}
for(const crate of crates) visit(crate,[])
const owner=file=>{
  if (/^(src|cli)\/.*\.ts$/.test(file)) return '@mizchi/idealis'
  if (/^adapters\/go\/.*\.go$/.test(file) && !file.endsWith('_test.go')) return 'adapters/go'
  const m=file.match(/^crates\/([^/]+)\/src\/.*\.rs$/)
  if (m && crates.includes(m[1]) && !/(?:_tests|\/tests)\.rs$/.test(file)) return m[1]
}
const pairs=new Map()
for(const sha of inventory.commits) {
  const paths=git('diff-tree','--root','-r','--no-commit-id','--no-renames','--name-only','-z',sha).split('\0')
  const groups=Map.groupBy(paths.filter(owner),owner)
  const names=[...groups.keys()].sort()
  for (const [i,a] of names.entries()) for(const b of names.slice(i+1)) {
    const key=JSON.stringify([a,b])
    if (!pairs.has(key)) pairs.set(key,[])
    pairs.get(key).push({sha,groups})
  }
}
const candidates=[]
for (const [key,changes] of pairs) {
  if(changes.length<2) continue
  const names=JSON.parse(key)
  const blocks=['Revision '+revision,'Packages '+names.join(' / ')+' changed together in '+changes.length+' commits. Showing at most three.']
  for(const {sha,groups} of changes.slice(0,3)) {
    blocks.push('Commit '+sha+' '+git('show','-s','--format=%s',sha).trim())
    for(const name of names) for(const file of groups.get(name).slice(0,2)) {
      const patch=git('show','--format=','--no-ext-diff','--no-textconv','--no-renames','--color=never','--unified=2',sha,'--',file)
      blocks.push(name+' '+file+'\n'+(patch.length>1700?patch.slice(0,1700)+'\n[remaining patch omitted]':patch))
    }
  }
  const body=blocks.join('\n\n')
  const sha256=createHash('sha256').update(body).digest('hex')
  const file=sha256.slice(0,24)+'.ccp'
  writeFileSync(join(evidenceDir,file),body,{flag:'wx'})
  candidates.push({file,rule:'common-closure',id:names.join(' / '),revision,sha256})
}
writeFileSync(join(evidenceDir,'package-history.json'),JSON.stringify({revision,edges,candidates},null,2)+'\n')
console.log(JSON.stringify({crates:crates.length,edges:edges.length,cycles:0,pairs:candidates.length}))
