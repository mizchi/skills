import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { writeEvidence } from '../audit.mjs'
import { cycleWitnesses, extensions, isTest, packageEdges, packageOf, recurringPairs, referenceCase } from './evidence.mjs'
import { discoverContracts } from './contracts.mjs'

const hash=s=>createHash('sha256').update(s).digest('hex')
const js=file=>/\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file)
const short=(s,limit)=>s.length<=limit?s:s.slice(0,limit)+'\n[remaining excerpt omitted]'
const compare=(a,b)=>a<b?-1:a>b?1:0

function readBlobs(git,items) {
  const hashes=[...new Set(items.map(x=>x.oid))]
  if(!hashes.length) return new Map()
  const data=git(['cat-file','--batch'],{input:hashes.join('\n')+'\n',encoding:null})
  const blobs=new Map()
  let offset=0
  for(const oid of hashes) {
    const end=data.indexOf(10,offset)
    const [key,type,len]=data.toString('ascii',offset,end).split(' ')
    assert.ok(key===oid && type==='blob')
    const next=end+1+Number(len)
    blobs.set(oid,data.toString('utf8',end+1,next))
    offset=next+1
  }
  return new Map(items.map(i=>[i.file,blobs.get(i.oid)]))
}

function pathMatches(dir,pattern) {
  const xs=dir.split('/')
  const ps=pattern.split('/')
  return ps.length===xs.length && ps.every((p,i)=>p==='*' || p===xs[i])
}

export function scan(repo,spec) {
  const git=(args,opts={})=>execFileSync('git',['-c','core.abbrev=12','--no-pager',...args],{
    cwd:repo,encoding:'utf8',maxBuffer:256*1024*1024,...opts})
  assert.match(spec.revision,/^[0-9a-f]{40}$/)
  assert.ok(Number.isInteger(spec.historyDepth) && spec.historyDepth>=0)
  const tree=git(['ls-tree','-rz',spec.revision]).split('\0').filter(Boolean).map(entry=>{
    const tab=entry.indexOf('\t')
    const [mode,,oid]=entry.slice(0,tab).split(' ')
    return {mode,oid,file:entry.slice(tab+1)}
  }).filter(e=>/^100/.test(e.mode))
  const manifests=readBlobs(git,tree.filter(e=>e.file.split('/').at(-1)==='package.json' &&
    spec.packages.some(pattern=>pathMatches(dirname(e.file),pattern))))
  const dirs=new Map()
  const roots=[]
  const aliases={}
  for(const [file,body] of manifests) {
    const dir=dirname(file)
    const {name,exports:entries}=JSON.parse(body)
    assert.ok(name && ![...dirs.values()].includes(name),'missing or duplicate package name in '+file)
    dirs.set(dir,name)
    for(const sourceDir of spec.sourceDirs) {
      const root=join(dir,sourceDir)
      roots.push(root==='.'?'':root+'/')
    }
    for(const [key,entry] of Object.entries(entries ?? {})) {
      const target=typeof entry==='string'?entry:entry?.import
      if(typeof target!=='string' || !key.startsWith('.')) continue
      const source=target.replace(/^\.\/dist\//,'src/').replace(/\.mjs$/,'.ts')
      aliases[name+key.slice(1)]=[join(dir,source)]
    }
  }
  assert.ok(roots.length,'no matching package manifests')
  const selected=f=>roots.some(r=>f.startsWith(r)) && js(f)
  const files=readBlobs(git,tree.filter(e=>selected(e.file)))
  assert.ok(files.size,'no source files')
  const semantic=discoverContracts(files,{...aliases,...spec.paths})
  const evidence=new Map()
  const candidates=[]
  const insufficient=[...semantic.insufficient]
  function add(rule,id,body,revision=spec.revision) {
    const text=short('Revision '+revision+'\n'+body,40000)
    const file=hash(JSON.stringify([rule,id,revision,hash(text)])).slice(0,24)+'.'+extensions[rule]
    assert.ok(!evidence.has(file),'duplicate subject: '+id)
    evidence.set(file,text)
    candidates.push({file,rule,id,revision,sha256:hash(text)})
  }
  for(const c of semantic.cases) add(c.rule,c.id,c.text)
  for(const item of spec.cases ?? []) {
    const rev=item.revision ?? spec.revision
    assert.match(rev,/^[0-9a-f]{40}$/)
    const c=referenceCase(item,file=>git(['cat-file','blob',rev+':'+file]))
    if(c.missing.length) insufficient.push({id:item.id,rule:item.rule,revision:rev,missing:c.missing})
    else add(item.rule,item.id,c.text,rev)
  }
  const edges=packageEdges(dirs,files)
  const cycles=cycleWitnesses(edges)
  for(const cycle of cycles) {
    const names=cycle.edges.map(e=>e.from).concat(cycle.edges.at(-1).to)
    const parts=['Cycle tier: '+cycle.kind+'\n'+names.join(' -> ')]
    for(const e of cycle.edges) {
      const all=edges.filter(x=>x.from===e.from && x.to===e.to && x.kind===e.kind)
      parts.push(e.from+' -> '+e.to+' ('+e.kind+', '+all.length+' import sites of this kind, showing up to 3)')
      for(const site of all.slice(0,3)) parts.push(site.file+':'+site.line+'\n'+site.code+'\n'+semantic.describeEdge(site))
    }
    add('acyclic-dependencies',names.join(' -> '),parts.join('\n'))
  }
  const range=spec.historyDepth ? git(['log','--first-parent','--no-merges','-n',String(spec.historyDepth),'--format=%H',spec.revision]).trim() : ''
  const changes=range.split('\n').filter(Boolean).map(sha=>{
    const changed=git(['diff-tree','--root','-r','--no-commit-id','--no-renames','--name-only','-z',sha]).split('\0')
    const packages=Map.groupBy(changed.filter(f=>selected(f) && !isTest(f)),f=>packageOf(f,dirs))
    return {sha,packages}
  })
  const pairs=recurringPairs(changes)
  for(const pair of pairs) {
    const samples=pair.commits.slice(0,3)
    const parts=['Packages '+pair.names.join(' / ')+' changed together in '+pair.commits.length+' commits. Showing '+samples.length+'.']
    for(const {sha,packages} of samples) {
      parts.push('Commit '+sha+' '+git(['show','-s','--format=%s',sha]).trim())
      for(const name of pair.names) {
        const paths=packages.get(name)
        parts.push(name+': '+paths.length+' source files; first two patches follow.')
        for(const file of paths.slice(0,2)) {
          const diff=git(['show','--format=','--no-ext-diff','--no-textconv','--no-color','--no-renames','--unified=2',sha,'--',file])
          parts.push(short(diff,1700))
        }
      }
    }
    add('common-closure',pair.names.join(' / '),parts.join('\n'))
  }
  candidates.sort((a,b)=>compare(a.file,b.file))
  return {evidence,report:{schema:1,repository:spec.repository,revision:spec.revision,files:files.size,packages:[...dirs.values()],
    commits:changes.map(c=>c.sha),consumers:semantic.consumers,cycles,candidates,insufficient}}
}

if(process.argv[1] && resolve(process.argv[1])===import.meta.filename) {
  const [repo,manifest,out]=process.argv.slice(2)
  assert.ok(out,'usage: scan.mjs <git checkout> <spec.json> <new directory>')
  const {report,evidence}=scan(repo,JSON.parse(readFileSync(manifest,'utf8')))
  writeEvidence(out,report,evidence)
  console.log(JSON.stringify({subjects:evidence.size,insufficient:report.insufficient.length,
    byRule:Object.fromEntries([...Map.groupBy(report.candidates,c=>c.rule)].map(([r,rows])=>[r,rows.length]))}))
}
