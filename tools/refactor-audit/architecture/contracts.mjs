import ts from 'typescript'
import { posix as path } from 'node:path'
import { isTest } from './evidence.mjs'

// A virtual project made only of tracked files. TypeScript resolves local aliases,
// contextual object types and imported symbols without executing target code.
function project(files,paths) {
  const root='/snapshot'
  const options={target:ts.ScriptTarget.Latest,moduleResolution:ts.ModuleResolutionKind.Bundler,
    module:ts.ModuleKind.ESNext,noLib:true,allowJs:true,baseUrl:root,paths}
  const relative=file=>path.relative(root,file)
  const host={
    getCurrentDirectory:()=>root, getCanonicalFileName:s=>s, useCaseSensitiveFileNames:()=>true,
    getNewLine:()=>'\n', getDefaultLibFileName:()=>'lib.d.ts', writeFile:()=>{},
    fileExists:file=>files.has(relative(file)), readFile:file=>files.get(relative(file)),
    getSourceFile(file,version) {
      const body=files.get(relative(file))
      if(body!==undefined) return ts.createSourceFile(file,body,version,true)
    },
  }
  return ts.createProgram([...files.keys()].map(f=>path.join(root,f)),options,host)
}

function excerpt(node,budget=2400) {
  const source=node.getSourceFile()
  const start=(node.jsDoc?.[0] ?? node).getStart(source)
  const first=source.getLineAndCharacterOfPosition(start).line+1
  const text=source.text.slice(start,node.end)
  const cut=text.length>budget
  const lines=text.slice(0,budget).split('\n')
  return path.relative('/snapshot',source.fileName)+':'+first+'-'+(first+lines.length-1)+'\n'+
    lines.map((line,i)=>(first+i)+'| '+line).join('\n')+(cut?'\n[excerpt ends]':'')
}

function context(node) {
  const source=node.getSourceFile()
  const lines=source.text.split('\n')
  const at=source.getLineAndCharacterOfPosition(node.getStart(source)).line
  const first=Math.max(0,at-2)
  const end=Math.min(lines.length,at+4)
  return path.relative('/snapshot',source.fileName)+':'+(first+1)+'-'+end+'\n'+
    lines.slice(first,end).map((line,i)=>(first+i+1)+'| '+line.slice(0,500)+(line.length>500?' […]':'')).join('\n')
}

function hasStub(node) {
  const body=ts.isPropertyAssignment(node) ? node.initializer.body : node.body
  if(!body) return false
  if(ts.isBlock(body)) return !body.statements.length || body.statements.some(ts.isThrowStatement)
  return false
}

function mutableDeclaration(symbol) {
  const decl=symbol?.valueDeclaration
  if(!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return
  const init=decl.initializer
  if(ts.isArrayLiteralExpression(init) || ts.isObjectLiteralExpression(init) ||
    (ts.isNewExpression(init) && /^(Set|Map|Uint\d+Array)$/.test(init.expression.getText()))) return decl
}

export function discoverContracts(files,paths) {
  const program=project(files,paths)
  const checker=program.getTypeChecker()
  const groups=new Map()
  const layouts=new Map()
  const usageMatrix=new Map()
  function group(type) {
    const decl=type?.getSymbol()?.declarations?.find(ts.isInterfaceDeclaration)
    // Data records and options literals are not interchangeable providers.
    if(!decl || !decl.members.some(m=>!m.questionToken && (ts.isMethodSignature(m) ||
      (ts.isPropertySignature(m) && m.type && ts.isFunctionTypeNode(m.type))))) return
    if(!groups.has(decl)) groups.set(decl,{providers:[],consumers:new Map()})
    return groups.get(decl)
  }
  function visit(node) {
    if(ts.isObjectLiteralExpression(node) || ts.isClassDeclaration(node)) {
      const types=ts.isObjectLiteralExpression(node) ? [checker.getContextualType(node)] :
        (node.heritageClauses ?? []).filter(c=>c.token===ts.SyntaxKind.ImplementsKeyword)
          .flatMap(c=>c.types.map(t=>checker.getTypeAtLocation(t)))
      if(!isTest(node.getSourceFile().fileName)) for(const type of types) {
        const g=group(type)
        if(g) g.providers.push(node)
      }
    }
    if(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const receiver=node.expression
      if(ts.isIdentifier(receiver)) {
        const symbol=checker.getSymbolAtLocation(receiver)
        if(symbol && symbol.flags & ts.SymbolFlags.Alias) {
          const decl=mutableDeclaration(checker.getAliasedSymbol(symbol))
          if(decl && decl.getSourceFile()!==node.getSourceFile() && !isTest(node.getSourceFile().fileName)) {
            if(!layouts.has(decl)) layouts.set(decl,new Map())
            const sites=layouts.get(decl)
            sites.set(node.getSourceFile().fileName,sites.get(node.getSourceFile().fileName) ?? node)
          }
        }
      }
      if(ts.isPropertyAccessExpression(node) && ts.isCallExpression(node.parent) && node.parent.expression===node) {
        const g=group(checker.getTypeAtLocation(receiver))
        if(g) {
          if(!g.consumers.has(node.name.text)) g.consumers.set(node.name.text,node.parent)
          const file=path.relative('/snapshot',node.getSourceFile().fileName)
          if(!usageMatrix.has(g)) usageMatrix.set(g,new Map())
          const consumers=usageMatrix.get(g)
          if(!consumers.has(file)) consumers.set(file,new Set())
          consumers.get(file).add(node.name.text)
        }
      }
    }
    ts.forEachChild(node,visit)
  }
  for(const source of program.getSourceFiles()) visit(source)
  const cases=[]
  const insufficient=[]
  function add(rule,id,parts) {
    const text=Object.entries(parts).map(([role,nodes])=>role+'\n'+nodes.map(n=>(role==='consumer' || role==='example') ? context(n) : excerpt(n)).join('\n')).join('\n\n')
    cases.push({rule,id,text})
  }
  for(const [decl,{providers,consumers}] of groups) {
    if(!providers.length) continue
    const id=path.relative('/snapshot',decl.getSourceFile().fileName)+'#'+decl.name.text
    const usage=[...consumers.values()].slice(0,3)
    if(providers.length>=2) {
      const documented=decl.jsDoc?.length || decl.members.some(m=>m.jsDoc?.length)
      if(!documented || !usage.length) insufficient.push({id,rule:'liskov-substitution',missing:[
        ...(!documented?['documented contract']:[]),...(!usage.length?['example']:[])]})
      else for(const [i,other] of providers.slice(1).entries()) {
        add('liskov-substitution',id+'#'+(i+1),{contract:[decl],implementation:[other],alternative:[providers[0]],example:usage})
      }
    }
    if(!usage.length) continue
    const mandatory=new Set(decl.members.filter(m=>!m.questionToken).map(m=>m.name?.getText()))
    for(const [i,p] of providers.entries()) {
      const members=p.members ?? p.properties
      if(members.some(m=>mandatory.has(m.name?.getText()) && hasStub(m))) {
        add('interface-segregation',id+'#'+i,{contract:[decl],implementation:[p],consumer:usage})
      }
    }
  }
  for(const [decl,sites] of layouts) {
    const id=path.relative('/snapshot',decl.getSourceFile().fileName)+'#'+decl.name.getText()
    add('parnas-information-hiding',id,{representation:[decl.parent.parent],consumer:[...sites.values()].slice(0,4)})
  }
  function describeEdge(edge) {
    const source=program.getSourceFile('/snapshot/'+edge.file)
    const stmt=source.statements.find(s=>source.getLineAndCharacterOfPosition(s.getStart(source)).line+1===edge.line)
    const bindings=stmt?.importClause?.namedBindings ?? stmt?.exportClause
    const names=[stmt?.importClause?.name,...(bindings?.elements ?? []).map(e=>e.name)].filter(Boolean)
    const details=[]
    for(const name of names.slice(0,2)) {
      const symbol=checker.getSymbolAtLocation(name)
      if(!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) continue
      const target=checker.getAliasedSymbol(symbol).declarations?.[0]
      if(target) details.push('Imported declaration '+excerpt(target,600))
      let use
      function find(node) {
        if(use || node===stmt) return
        if(ts.isIdentifier(node) && node.text===name.text && checker.getSymbolAtLocation(node)===symbol) use=node
        else ts.forEachChild(node,find)
      }
      find(source)
      if(use) details.push('Use '+excerpt(use.parent,380))
    }
    return details.join('\n')
  }
  const consumers=[]
  for(const [decl,g] of groups) {
    const usages=usageMatrix.get(g)
    if(usages?.size) consumers.push({contract:excerpt(decl,300).split('\n')[0],name:decl.name.text,
      members:decl.members.map(m=>m.name?.getText()).filter(Boolean),
      clients:[...usages].map(([file,names])=>({file,called:[...names].sort()}))})
  }
  return {cases,insufficient,describeEdge,consumers}
}
