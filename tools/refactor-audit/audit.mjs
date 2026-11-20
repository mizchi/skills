import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const lineOf = (node) => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1

function sourceEntries(manifest, root) {
  const entries = typeof manifest.exports === 'string' ? {'.': manifest.exports} : manifest.exports
  if (!entries || Array.isArray(entries) || typeof entries !== 'object' || !Object.keys(entries).length) {
    throw new Error('Expected a manifest containing source exports')
  }
  return Object.entries(entries).sort(([a], [b]) => compare(a, b)).map(([name, target]) => {
    if (!(name === '.' || name.startsWith('./')) || name.includes('*') || typeof target !== 'string'
        || !target.startsWith('./') || target.includes('*') || !/\.(?:[cm]?ts|tsx)$/.test(target)
        || /\.d\.[cm]?ts$/.test(target) || !resolve(root, target).startsWith(root + sep)
        || !existsSync(resolve(root, target)) || !statSync(resolve(root, target)).isFile()) {
      throw new Error(`Unsupported or missing source exports entry ${name}: ${JSON.stringify(target)}`)
    }
    return {name, file: resolve(root, target)}
  })
}

function compilerOptions(root) {
  const config = join(root, 'tsconfig.json')
  let options = {}
  if (existsSync(config)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic(d) { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')) },
    })
    const issue = parsed.errors.find(d => d.code !== 18003)
    if (issue) throw new Error(ts.flattenDiagnosticMessageText(issue.messageText, '\n'))
    options = parsed.options
  }
  return { moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve,
    ...options, noEmit: true, types: [], skipLibCheck: true }
}

// These declarations can hold state across calls. A const container may also be a lookup table.
function stateCandidates(source, publicSymbols, checker) {
  const candidates = new Map()
  for (const stmt of source.statements.filter(ts.isVariableStatement)) {
    const rebindable = !(stmt.declarationList.flags & ts.NodeFlags.Const)
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || publicSymbols.has(checker.getSymbolAtLocation(decl.name))) continue
      let initializer = decl.initializer
      while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer))) {
        initializer = initializer.expression
      }
      const container = initializer && (ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer)
        || (ts.isNewExpression(initializer) && ['Map','Set','WeakMap','WeakSet','Array'].includes(initializer.expression.getText())))
      if (rebindable || container) {
        candidates.set(checker.getSymbolAtLocation(decl.name), {
          name: decl.name.text, line: lineOf(decl), kind: rebindable ? 'rebindable' : 'container', writeLines: [],
        })
      }
    }
  }
  if (candidates.size) {
    function visit(node) {
      let receiver = writtenReceiver(node)
      while (receiver && (ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver)
          || ts.isNonNullExpression(receiver) || ts.isParenthesizedExpression(receiver))) {
        receiver = receiver.expression
      }
      if (receiver && ts.isIdentifier(receiver)) {
        const state = candidates.get(checker.getSymbolAtLocation(receiver))
        const line = lineOf(node)
        if (state && state.writeLines.at(-1) !== line) state.writeLines.push(line)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return [...candidates.values()]
}

const mutators = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift',
  'splice', 'sort', 'reverse', 'fill', 'copyWithin'])

function writtenReceiver(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return node.operand
  if (ts.isDeleteExpression(node)) return node.expression
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && mutators.has(node.expression.name.text)) return node.expression.expression
}

function internalTypeReferences(source, checker, publicSymbols, root) {
  const refs = []
  for (const declaration of source.statements) {
    if (!(ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration))
        || !publicSymbols.has(checker.getSymbolAtLocation(declaration.name))) continue
    function visit(node) {
      const name = ts.isTypeReferenceNode(node) ? node.typeName
        : ts.isExpressionWithTypeArguments(node) ? node.expression : null
      if (name) {
        const symbol = checker.getSymbolAtLocation(name)
        const target = symbol?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
        const internal = target?.declarations?.find(d => ts.getJSDocTags(d).some(tag => tag.tagName.text === 'internal'))
        if (internal) refs.push({
          api: declaration.name.text, line: lineOf(node), type: target.getName(),
          targetFile: relative(root, internal.getSourceFile().fileName), targetLine: lineOf(internal),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(declaration)
  }
  return refs
}

function testExcerpts(path) {
  const files = []
  for (const suffix of ['.test', '.spec']) {
    for (const ext of ['.ts', '.tsx', '.mts', '.cts']) {
      const candidate = path.replace(/\.[^.]+$/, suffix + ext)
      if (existsSync(candidate)) files.push(candidate)
    }
  }
  return files
}

function evidenceFor(module, source, root) {
  const tests = module.tests.map(file => {
    const text = readFileSync(join(root, file), 'utf8')
    return `${file}\n${text.slice(0, 2400)}${text.length > 2400 ? '\n[test excerpt ends]' : ''}`
  })
  return [
    `Module: ${module.file}`,
    'Public bindings (subpath, exported name, declaration line):',
    ...module.publicBindings.map(s => JSON.stringify([s.entry, s.name, s.line])),
    `Module exports: ${module.moduleExports}; source lines: ${module.lines}`,
    `Potential hidden top-level state: ${JSON.stringify(module.hiddenState)}`,
    `Direct references to @internal in public interfaces and type aliases: ${JSON.stringify(module.internalTypeReferences)}`,
    'Colocated test excerpts (other tests may exist):', ...tests,
    'Module source starting at line 1:', source.text,
  ].join('\n')
}

export function audit(manifestPath) {
  const root = dirname(resolve(manifestPath))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const inputs = sourceEntries(manifest, root)
  return auditSources(root, manifest.name ?? null, inputs)
}

// Entries define the consumer-visible names. Other roots (CLI, worker, private packages)
// contribute implementation evidence without becoming importable library subpaths.
export function auditSources(root, packageName, inputs, additionalFiles = [], options = {}) {
  const rootNames = [...new Set([...inputs.map(i => i.file), ...additionalFiles])]
  const program = ts.createProgram(rootNames, {...compilerOptions(root), ...options})
  const checker = program.getTypeChecker()
  const publicSymbols = new Set()
  const bindings = new Map()
  const issues = new Set()
  const pathOf = file => relative(root, file)
  const local = file => {
    const path = pathOf(file)
    return !isAbsolute(path) && !path.startsWith('..' + sep) && !path.split(sep).includes('node_modules')
  }
  function publicBinding(entry, name, exported, ancestors) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    // Overloads share the public name; point at the implementation if it exists.
    const declaration = target.declarations?.find(d => ts.isFunctionDeclaration(d) && d.body)
      ?? target.valueDeclaration ?? target.declarations?.[0]
    if (!declaration || !local(declaration.getSourceFile().fileName)) {
      issues.add(`${entry} / ${name}: ${declaration ? 'external' : 'unresolved'} declaration`)
      return {name, file: null, line: null}
    }

    const source = declaration.getSourceFile()
    const origin = source.fileName
    const line = lineOf(declaration)
    publicSymbols.add(target)
    if (!bindings.has(origin)) bindings.set(origin, [])
    bindings.get(origin).push({entry, name, line})

    if (source.isDeclarationFile) issues.add(`${entry} / ${name}: declaration only, no implementation evidence`)
    if ((ts.isSourceFile(declaration) || ts.isModuleDeclaration(declaration)) && !ancestors.has(target)) {
      const path = new Set(ancestors).add(target)
      for (const member of checker.getExportsOfModule(target)) {
        publicBinding(entry, name + '.' + member.getName(), member, path)
      }
    }
    return {name, file: pathOf(origin), line}
  }

  const entries = inputs.map(({name, file}) => {
    const src = program.getSourceFile(file)
    const mod = checker.getSymbolAtLocation(src)
    if (!mod) issues.add(`${pathOf(file)}: no module symbol`)
    const symbols = mod ? checker.getExportsOfModule(mod).map(exp =>
      publicBinding(name, exp.getName(), exp, new Set([mod]))) : []
    return {name, file: pathOf(file), symbols: symbols.sort((a, b) => compare(a.name, b.name))}
  })

  const modules = []
  const evidence = new Map()
  for (const source of program.getSourceFiles()) {
    if (!local(source.fileName) || source.isDeclarationFile) continue
    for (const d of program.getSyntacticDiagnostics(source)) {
      issues.add(`${pathOf(source.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
    }
    for (const stmt of source.statements) {
      if ((ts.isExportDeclaration(stmt) || ts.isImportDeclaration(stmt)) && stmt.moduleSpecifier
          && !checker.getSymbolAtLocation(stmt.moduleSpecifier)) {
        issues.add(`${pathOf(source.fileName)}:${lineOf(stmt)} unresolved ${stmt.moduleSpecifier.getText()}`)
      }
    }
    const mod = checker.getSymbolAtLocation(source)
    const file = pathOf(source.fileName)
    const module = {file, lines: source.getLineStarts().length - Number(source.text.endsWith('\n')),
      moduleExports: mod ? checker.getExportsOfModule(mod).length : 0,
      publicBindings: bindings.get(source.fileName) ?? [],
      hiddenState: stateCandidates(source, publicSymbols, checker),
      internalTypeReferences: internalTypeReferences(source, checker, publicSymbols, root),
      tests: testExcerpts(source.fileName).map(pathOf)}
    modules.push(module)
    evidence.set(file + (module.publicBindings.length ? '.surface' : '.impl'), evidenceFor(module, source, root))
  }
  modules.sort((a,b) => compare(a.file,b.file))
  const summary = {
    entries: entries.length, publicNames: entries.reduce((n,e) => n + e.symbols.length, 0),
    modules: modules.length, publicDefinitionModules: modules.filter(m => m.publicBindings.length).length,
    sourceLines: modules.reduce((n,m) => n + m.lines, 0),
    internalTypeReferences: modules.reduce((n,m) => n + m.internalTypeReferences.length, 0),
    hiddenStateWithWrites: modules.reduce((n,m) => n + m.hiddenState.filter(s => s.writeLines.length).length, 0),
    hiddenStateCandidates: modules.reduce((n,m) => n + m.hiddenState.length, 0),
  }
  return {report: {schemaVersion: 1, package: packageName, summary, entries, modules, issues: [...issues].sort()}, evidence}
}

export function writeEvidence(out, report, evidence) {
  mkdirSync(dirname(resolve(out)), {recursive: true})
  mkdirSync(out) // Exclusive: an older scan must never add stale modules to this run.
  for (const [file, body] of evidence) {
    const dest = join(out, file)
    mkdirSync(dirname(dest), {recursive: true})
    writeFileSync(dest, body)
  }
  writeFileSync(join(out, 'inventory.json'), JSON.stringify(report, null, 2) + '\n')
}
