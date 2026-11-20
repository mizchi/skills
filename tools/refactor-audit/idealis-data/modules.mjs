// Inputs are an archive of the pinned tree and public rustdoc JSON from that archive.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { auditSources, writeEvidence } from '../audit.mjs'

const [source, docs, output] = process.argv.slice(2)
const root = resolve(source)
const read = path => readFileSync(join(root,path),'utf8')
const json = path => JSON.parse(read(path))
const files = dir => readdirSync(join(root,dir),{recursive:true,withFileTypes:true})
  .filter(e=>e.isFile()).map(e=>relative(root,join(e.parentPath,e.name))).sort()
const pkg = json('package.json')
const entries = Object.entries(pkg.exports).filter(([,entry])=>entry.types).map(([name,entry])=>{
  const file = entry.types.replace(/^\.\/dist\//,'').replace(/\.d\.ts$/,'.ts')
  assert.equal(entry.default,'./dist/'+file.replace(/\.ts$/,'.js'))
  return {name,file:join(root,file)}
})
const tsFiles = [...files('src'),...files('cli')].filter(f=>f.endsWith('.ts'))
const {report:typescript,evidence} = auditSources(root,pkg.name,entries,tsFiles.map(f=>join(root,f)))
assert.equal(evidence.size,tsFiles.length)
const modules = []
function add(path,bindings,language) {
  bindings.sort()
  const text = read(path)
  const file = path+(bindings.length?'.surface':'.impl')
  evidence.set(file,['Module: '+path,'Public bindings observed:',...bindings,'Module source starting at line 1:',text].join('\n'))
  modules.push({file,path,language,bindings:bindings.length})
}
for (const crate of readdirSync(join(root,'crates')).sort()) {
  const dir = 'crates/'+crate
  const doc = JSON.parse(readFileSync(join(docs,crate.replaceAll('-','_')+'.json')))
  const index = doc.index
  const bindings = new Map()
  function bind(item,name) {
    if (!item?.span || item.crate_id!==0) return
    const path = join(dir,item.span.filename)
    if (!bindings.has(path)) bindings.set(path,new Set())
    bindings.get(path).add(name+' (line '+item.span.begin[0]+')')
  }
  // Walk exported module items from the crate root, including renamed reexports.
  function walk(id,name,ancestors) {
    const item=index[id]
    if (!item || item.crate_id!==0 || ancestors.has(id)) return
    const inner=item.inner
    const seen=new Set(ancestors).add(id)
    if (inner.use) { walk(inner.use.id,name,seen); return }
    if (inner.module) {
      for (const childId of inner.module.items) {
        const child=index[childId]
        if (child?.visibility!=='public') continue
        const label=child.name??child.inner.use?.name
        if (label) walk(childId,child.inner.use?.is_glob?name:name+'::'+label,seen)
      }
      return
    }
    bind(item,name)
    for (const implId of Object.values(inner)[0]?.impls??[]) {
      const impl=index[implId]?.inner.impl
      if (!impl || impl.trait) continue
      for (const memberId of impl.items) {
        const member=index[memberId]
        if (member?.visibility==='public') bind(member,name+'::'+member.name)
      }
    }
  }
  walk(doc.root,crate.replaceAll('-','_'),new Set())
  for (const path of files(dir+'/src').filter(f=>f.endsWith('.rs')&&!/(?:_tests|\/tests)\.rs$/.test(f)))
  {
    const names = [...(bindings.get(path)??[])]
    const body = read(path)
    for (const match of body.matchAll(/^#\[unsafe\(no_mangle\)\]\n(pub extern "C" fn (\w+))/gm))
      names.push('C ABI '+match[2]+' (line '+(body.slice(0,match.index).split('\n').length+1)+')')
    add(path,names,'rust')
  }
}
for (const path of files('adapters/go').filter(f=>f.endsWith('.go')&&!f.endsWith('_test.go'))) {
  const lines=read(path).split('\n')
  const bindings=[]
  if (!relative('adapters/go',path).includes('/')) lines.forEach((line,i)=>{
    const m=line.match(/^(?:type|func|const|var)\s+(?:\(\w+\s+\*?([A-Z]\w*)\)\s+)?([A-Z]\w*)\b/)
    if (m) bindings.push((m[1]?m[1]+'.':'')+m[2]+' (line '+(i+1)+')')
  })
  add(path,bindings,'go')
}
assert.ok(existsSync(join(root,'crates/rtlc/Cargo.toml')))
writeEvidence(output,{typescript,modules},evidence)
console.log(JSON.stringify({typescript:typescript.summary,nativeModules:modules.length,total:evidence.size}))
