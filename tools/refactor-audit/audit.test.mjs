import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { audit, writeEvidence } from './audit.mjs'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'refactor-audit-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'src'))
  for (const [file, body] of Object.entries({
    'package.json': JSON.stringify({exports: {'.': './src/index.ts', './api': './src/api.ts'}}),
    'src/index.ts': "export { read as lookup } from './api'\nexport type { RecordId } from './data'",
    'src/api.ts': "import { load } from './data'\nexport const read = () => load()",
    'src/data.ts': "export type RecordId = number\nlet calls = 0\nconst cache = new Map()\nexport function load() { calls++; return cache.get(calls) }",
    'src/unused.ts': 'export let unreachable = 0',
    'src/data.test.ts': "test('reads a stored value', () => expect(load()).toEqual(3))",
  })) writeFileSync(join(dir, file), body)
  return dir
}

test('公開名と定義位置を解決し、内部 export とモジュール状態を区別する', (t) => {
  const dir = fixture(t)
  const { report, evidence } = audit(join(dir, 'package.json'))
  assert.equal(report.entries.length, 2)
  assert.deepEqual(report.entries[0].symbols.map(s => [s.name, s.file, s.line]), [
    ['RecordId', 'src/data.ts', 1], ['lookup', 'src/api.ts', 2],
  ])
  assert.equal(report.summary.publicNames, 3)
  assert.equal(report.summary.modules, 3)
  const data = report.modules.find(m => m.file === 'src/data.ts')
  assert.equal(data.moduleExports, 2)
  assert.deepEqual(data.hiddenState.map(s => s.name), ['calls', 'cache'])
  assert.deepEqual(data.hiddenState.map(s => s.writeLines), [[4], []])
  assert.deepEqual(report.issues, [])
  const out = join(dir, 'out')
  writeEvidence(out, report, evidence)
  assert.throws(() => writeEvidence(out, report, evidence))
  const body = readFileSync(join(out, 'src/data.ts.surface'), 'utf8')
  assert.match(body, /RecordId/)
  assert.match(body, /reads a stored value/)
  assert.match(body, /let calls = 0/)
})

test('間接再公開された状態を隠れた状態に含めず、export * の解決失敗を報告する', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/data.ts'), 'export let counter = 0')
  writeFileSync(join(dir, 'src/index.ts'), "export * from './data'\nexport * from './missing'")
  const { report } = audit(join(dir, 'package.json'))
  assert.deepEqual(report.modules.find(m => m.file === 'src/data.ts').hiddenState, [])
  assert.ok(report.issues.some(i => i.includes('./missing')))
})

test('未対応の export マッピングや存在しないエントリをゼロ件として通さない', (t) => {
  const dir = fixture(t)
  for (const exports of [{ './*': './src/*.ts' }, {'.': './dist/main.js'}, {'.': {import: './src/index.ts'}}]) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ exports }))
    assert.throws(() => audit(join(dir, 'package.json')), /exports/)
  }
})

test('jev-lint が実際の公開・内部モジュールを対応するルールだけに渡す', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/index.ts'), "export { read } from './api'")
  const { report, evidence } = audit(join(dir, 'package.json'))
  writeEvidence(join(dir, 'sample'), report, evidence)
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('dist/cli.js', import.meta.resolve('jev-lint/package.json'))),
    'check','sample','--no-config','--cache','none','-R',join(import.meta.dirname,'rules/modules.yml'),'--dry-run','--show-subjects'], {cwd:dir,encoding:'utf8'})
  assert.equal(run.status, 0, run.stderr)
  const text = run.stdout + run.stderr
  for (const id of ['single-responsibility','least-privilege','least-surprise','hyrum','parkinson','kernighan']) assert.ok(text.includes(id), text)
  assert.match(text, /data.ts.impl/)
  // 3 modules x 3 module rules, 1 public definition module x 3 API rules.
  assert.match(text, /12 subject\(s\)/)
})

test('書き込み行は同名のローカル変数や読み取りを除き、ネストしたプロパティの変更も拾う', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/data.ts'), [
    'export type RecordId = number', 'const cache = new Map()', 'const options = { nested: { count: 0 } }',
    'export function load() { cache.set("k", 1); options.nested.count += 1; return cache.get("k") }',
    'function other(cache: Map<string, number>) { cache.clear() }',
  ].join('\n'))
  const { report } = audit(join(dir, 'package.json'))
  const data = report.modules.find(m => m.file === 'src/data.ts')
  assert.deepEqual(data.hiddenState.map(s => [s.name, s.writeLines]), [['cache', [4]], ['options', [4]]])
})

test('履歴ルールは正負を含む6つの変更の差分を各2件判定する', async (t) => {
  const {buildHistory} = await import('./controls/history.mjs')
  const dir = join(fixture(t), 'history')
  const range = buildHistory(dir)
  const cli = fileURLToPath(new URL('dist/cli.js', import.meta.resolve('jev-lint/package.json')))
  const run = spawnSync(process.execPath, [cli, 'commits', range, '--no-config', '--cache', 'none',
    '-R', join(import.meta.dirname,'rules/history.yml'), '--dry-run','--json'], {cwd:dir, encoding:'utf8'})
  assert.equal(run.status, 0, run.stderr)
  const plan = JSON.parse(run.stdout)
  assert.deepEqual(plan.byRule.map(r => [r.rule, r.subjects]).sort(), [['campbell', 6], ['goodhart', 6]])
  assert.equal(plan.requests, 6)
})

test('公開 interface の型に漏れた @internal を定義と参照の両方に紐付ける', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/api.ts'), [
    '/** @internal */', 'interface Channel { reset(): void }',
    'interface Private { open(c: Channel): void }',
    'export interface Plugin { accept(c: Channel): void }',
  ].join('\n'))
  writeFileSync(join(dir, 'src/index.ts'), "export type { Plugin as Hook } from './api'")
  const {report} = audit(join(dir, 'package.json'))
  const api = report.modules.find(m => m.file === 'src/api.ts')
  assert.deepEqual(api.internalTypeReferences, [
    {api:'Plugin', line:4, type:'Channel', targetFile:'src/api.ts', targetLine:2},
  ])
})

test('default export したローカル変数を定義行に紐付ける', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/api.ts'), 'const records = new Map()\nexport default records')
  writeFileSync(join(dir, 'src/index.ts'), "export {default as registry} from './api'")
  const {report} = audit(join(dir, 'package.json'))
  assert.equal(report.entries[0].symbols[0].line, 1)
  assert.deepEqual(report.modules.find(m => m.file === 'src/api.ts').hiddenState, [])
})

test('名前空間で再公開した変数を共有状態の公開経路に含める', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'src/index.ts'), "export * as runtime from './data'")
  writeFileSync(join(dir, 'src/data.ts'), 'export const cache = new Map()')
  const {report} = audit(join(dir, 'package.json'))
  const data = report.modules.find(m => m.file === 'src/data.ts')
  assert.deepEqual(data.hiddenState, [])
  assert.ok(data.publicBindings.some(b => b.name === 'runtime.cache'))
  assert.deepEqual(report.entries[0].symbols.map(s => s.name), ['runtime'])
})

test('各ルールの偽陽性・偽陰性・無関係の対照が実在し、校正ラベルと一致する', async () => {
  const {cases: changes} = await import('./controls/history.mjs')
  const controls = join(import.meta.dirname, 'controls')
  const {cases} = JSON.parse(readFileSync(join(controls,'case-coverage.json')))
  const labels = JSON.parse(readFileSync(join(controls,'labels.json')))
  const byRule = Map.groupBy(cases, c => c.rule)
  assert.equal(byRule.size, 8)
  for (const rows of byRule.values()) {
    assert.deepEqual(rows.map(c => c.kind).sort(), ['false-negative-risk','false-positive-risk','unrelated'])
    assert.equal(new Set(rows.map(c => c.fixture)).size, rows.length)
    for (const {fixture, rule, label} of rows) {
      if (fixture.startsWith('history/')) {
        const change = changes.find(c => fixture === 'history/' + c.id)
        assert.ok(change)
        assert.equal(label, change.bad === rule ? 'bad' : 'clean')
      } else {
        assert.ok(readFileSync(join(controls,fixture),'utf8').length)
        assert.equal(labels[fixture].find(c => c.rule === rule)?.label, label)
      }
    }
  }
})
