import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { auditSources, writeEvidence } from '../audit.mjs'
import { scanWorkspace } from '../moon-workspace.mjs'

export const revision = '468888c59ff07097892993b1e304882271a4a861'
const isImplementation = f => f.endsWith('.ts') && !/\.(?:test|spec|d)\.ts$/.test(f)

export function packageEntries(dir, pkg, files) {
  if (pkg.private) return []
  const src = join(dir,'src') + '/'
  const result = []
  for (const [subpath,conditions] of Object.entries(pkg.exports)) {
    const target = conditions.import ?? conditions
    if (subpath === './*.ts') {
      assert.equal(target,'./dist/*.mjs')
      for (const file of files.filter(f => f.startsWith(src) && isImplementation(f))) {
        result.push({name:pkg.name+'/'+file.slice(src.length),file})
      }
    } else {
      const stem = target.match(/^\.\/dist\/(.+)\.mjs$/)?.[1]
      assert.ok(stem,'unexpected package entry: '+target)
      // vite.config.ts maps the root client to src/api/client.ts.
      const file = src + (dir === '.' && stem === 'client' ? 'api/client' : stem) + '.ts'
      assert.ok(files.includes(file),'missing source entry: '+file)
      result.push({name:pkg.name+(subpath === '.' ? '' : subpath.slice(1)),file})
    }
  }
  return result
}

export function inputs(repo) {
  const git = (...args) => execFileSync('git',args,{cwd:repo,maxBuffer:128*1024*1024})
  const all = git('ls-tree','-r','--name-only','-z',revision).toString().split('\0').filter(Boolean)
  const paths = all.filter(f => /^(?:src\/|worker\/|packages\/[^/]+\/src\/)/.test(f)
    || /^(?:packages\/[^/]+\/)?package\.json$/.test(f) || f==='tsconfig.json'
    || /^packages\/vlmkit-markup\/(?:moon\.mod|[^/]+\/(?:moon\.pkg|[^/]+\.(?:mbt|mbti)))$/.test(f))
  const tmp = mkdtempSync(join(tmpdir(),'vlmkit-audit-'))
  try {
    execFileSync('tar',['-xf','-','-C',tmp],{input:git('archive',revision,'--',...paths)})
    const read = f => readFileSync(join(tmp,f),'utf8')
    const files = paths.filter(isImplementation)
    const entries = []
    const aliases = {}
    for (const manifest of paths.filter(f => /^(?:packages\/[^/]+\/)?package\.json$/.test(f))) {
      const dir = dirname(manifest)
      const pkg = JSON.parse(read(manifest))
      for (const e of packageEntries(dir,pkg,files)) {
        aliases[e.name] = ['./'+e.file]
        entries.push({name:e.name,file:join(tmp,e.file)})
      }
      if (pkg.private) {
        aliases[pkg.name] = ['./'+join(dir,'src/index.ts')]
        aliases[pkg.name+'/*.ts'] = ['./'+join(dir,'src/*.ts')]
      }
    }
    const {report,evidence} = auditSources(tmp,'@mizchi/vlmkit',entries,files.map(f=>join(tmp,f)),{baseUrl:tmp,paths:aliases})
    const moonRoot = 'packages/vlmkit-markup'
    const moonPaths = paths.filter(f=>f.startsWith(moonRoot+'/') && /\.mbti?$|moon\.(?:mod|pkg)$/.test(f)).map(f=>relative(moonRoot,f))
    const moon = scanWorkspace([...moonPaths,'moon.work'], f=>f==='moon.work' ? 'members = ["."]' : read(join(moonRoot,f)))
    for (const [file,body] of moon.evidence) evidence.set(join(moonRoot,file),body)
    assert.deepEqual(new Set(report.modules.map(m=>m.file)),new Set(files),'TS implementation coverage')
    return {evidence, report:{revision,typescript:report,moon:moon.packages}}
  } finally {
    rmSync(tmp,{force:true,recursive:true})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [, ,repo,out] = process.argv
  const {report,evidence} = inputs(repo)
  writeEvidence(out,report,evidence)
  console.log(JSON.stringify({ts:report.typescript.summary, issues:report.typescript.issues.length, files:evidence.size}))
}
