import assert from 'node:assert/strict'
import { posix as path } from 'node:path'
import ts from 'typescript'

export const extensions = {
  'liskov-substitution':'lsp', 'interface-segregation':'isp', 'parnas-information-hiding':'parnas',
  'common-closure':'ccp', 'acyclic-dependencies':'adp',
}
const required = {
  'liskov-substitution':['contract','implementation','alternative','example'],
  'interface-segregation':['contract','consumer','implementation'],
  'parnas-information-hiding':['decision','representation','consumer'],
}

export function referenceCase(item, read) {
  const roles = required[item.rule]
  assert.ok(roles,'unsupported reference rule: '+item.rule)
  const sections = []
  for (const [role,refs] of Object.entries(item.refs)) {
    for (const [file,start,end] of refs) {
      const lines = read(file).split('\n')
      if (lines.at(-1) === '') lines.pop()
      assert.ok(Number.isInteger(start) && Number.isInteger(end) && start>=1 && end>=start && end<=lines.length,'invalid range: '+file)
      const numbered = lines.slice(start-1,end).map((line,i)=>(start+i)+'| '+line)
      sections.push(role+' '+file+':'+start+'-'+end+'\n'+numbered.join('\n'))
    }
  }
  const missing = roles.filter(role=>!item.refs[role]?.length)
  return {missing,text:sections.join('\n\n')}
}

export function packageOf(file,dirs) {
  let dir=path.dirname(file)
  while (!dirs.has(dir) && dir!=='.' && dir!=='/') dir=path.dirname(dir)
  return dirs.get(dir)
}

export const isTest = file => /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)

function importsOf(source) {
  const imports=[]
  function visit(node) {
    let spec
    let typeOnly=false
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      spec=node.moduleSpecifier
      const clause=node.importClause
      const group=clause?.namedBindings ?? node.exportClause
      const namedTypes=group?.elements?.length && group.elements.every(e=>e.isTypeOnly)
      typeOnly=!!(clause?.isTypeOnly || node.isTypeOnly || (!clause?.name && namedTypes))
    } else if (ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword) {
      spec=node.arguments[0]
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      spec=node.argument.literal
      typeOnly=true
    }
    if (spec && ts.isStringLiteralLike(spec)) imports.push({node,spec:spec.text,typeOnly})
    ts.forEachChild(node,visit)
  }
  visit(source)
  return imports
}

export function packageEdges(dirs,files) {
  const packages=new Set(dirs.values())
  const edges=[]
  for(const [file,body] of files) {
    const from=packageOf(file,dirs)
    if (!from) continue
    const source=ts.createSourceFile(file,body,ts.ScriptTarget.Latest,true)
    const lines=body.split('\n')
    for(const {node,spec,typeOnly} of importsOf(source)) {
      let to
      if (spec.startsWith('.')) {
        const stem=path.join(path.dirname(file),spec)
        const base=stem.replace(/\.(?:js|mjs|cjs)$/,'')
        const target=[stem,...['.ts','.tsx','.js','.mts','.cts','.mjs','.cjs','/index.ts','/index.tsx','/index.js'].map(ext=>base+ext)].find(f=>files.has(f))
        if (target) to=packageOf(target,dirs)
      } else {
        to=spec.split('/').slice(0,spec.startsWith('@') ? 2 : 1).join('/')
      }
      if (!packages.has(to) || to===from) continue
      const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1
      const end=source.getLineAndCharacterOfPosition(node.end).line+1
      edges.push({from,to,file,line,kind:isTest(file)?'test':typeOnly?'type':'runtime',spec,
        code:lines.slice(line-1,Math.min(end+2,line+16)).map((l,i)=>(line+i)+'| '+l).join('\n')})
    }
  }
  return edges
}

// One shortest return path per directed edge at its earliest available dependency tier.
export function cycleWitnesses(edges) {
  const result=new Map()
  const seenEdges=new Set()
  const graph=new Map()
  for(const kind of ['runtime','type','test']) {
    for(const edge of edges.filter(e=>e.kind===kind)) {
      if (!graph.has(edge.from)) graph.set(edge.from,new Map())
      if (!graph.get(edge.from).has(edge.to)) graph.get(edge.from).set(edge.to,edge)
    }
    for(const adjacent of graph.values()) for(const first of adjacent.values()) {
      if(seenEdges.has(first)) continue
      const prev=new Map([[first.to,null]])
      const queue=[first.to]
      for(let i=0;i<queue.length && !prev.has(first.from);i++) {
        for(const edge of graph.get(queue[i])?.values() ?? []) {
          if(prev.has(edge.to)) continue
          prev.set(edge.to,edge)
          queue.push(edge.to)
        }
      }
      if(!prev.has(first.from)) continue
      let current=first.from
      const back=[]
      while(current!==first.to) {
        const edge=prev.get(current)
        back.push(edge)
        current=edge.from
      }
      const cycle=[first,...back.reverse()]
      const start=cycle.map(e=>e.from).sort()[0]
      const pivot=cycle.findIndex(e=>e.from===start)
      const ordered=cycle.slice(pivot).concat(cycle.slice(0,pivot))
      const key=JSON.stringify(ordered.map(e=>e.from))
      if(!result.has(key)) result.set(key,{kind,edges:ordered})
      seenEdges.add(first)
    }
  }
  return [...result.values()]
}

export function recurringPairs(changes) {
  const pairs=new Map()
  for(const change of changes) {
    const names=[...change.packages.keys()].sort()
    for(let i=0;i<names.length;i++) for(const other of names.slice(i+1)) {
      const pair=[names[i],other]
      const key=JSON.stringify(pair)
      if(!pairs.has(key)) pairs.set(key,{names:pair,commits:new Map()})
      pairs.get(key).commits.set(change.sha,change)
    }
  }
  return [...pairs.values()].filter(p=>p.commits.size>=2).map(p=>({...p,commits:[...p.commits.values()]}))
}
