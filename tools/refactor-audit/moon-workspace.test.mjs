import assert from 'node:assert/strict'
import test from 'node:test'
import { scanWorkspace } from './moon-workspace.mjs'

test('workspace 境界、パッケージ単位の公開宣言、テスト専用 import と状態を区別する', () => {
  const files = new Map(Object.entries({
    'moon.work': 'members = [".", "./engine"]',
    'moon.mod': 'name = "acme/main"',
    'shell/moon.pkg': 'import { "acme/engine" @engine }\nimport { "acme/engine/extra" } for "test"',
    'shell/a.mbt': 'pub fn run() -> Unit { () }\n',
    'shell/a_test.mbt': 'test "run" { run() }\n',
    'shell/pkg.generated.mbti': 'package "acme/main/shell"\npub fn run() -> Unit\n',
    'engine/moon.mod': 'name = "acme/engine"',
    'engine/moon.pkg': '',
    'engine/a.mbt': 'let cache : Ref[Int] = { val: 0 }\n',
    'engine/pkg.generated.mbti': 'package "acme/engine"\npub(all) struct S {\n  a : Int\n}\npub impl Show for S\n',
    'engine/extra/moon.pkg': '',
    'other/moon.mod': 'name = "acme/other"',
    'other/moon.pkg': '',
  }))
  const result = scanWorkspace([...files.keys()], path => files.get(path))
  assert.equal(result.packages.length, 3)
  const engine = result.packages.find(p => p.dir === 'engine')
  assert.equal(engine.publicDeclarations, 2)
  assert.deepEqual(engine.importedBy, ['acme/main/shell'])
  assert.equal(engine.privateRefs.length, 1)
  const shell = result.packages.find(p => p.dir === 'shell')
  assert.equal(shell.sourceLines, 1)
  assert.deepEqual(shell.dependencies, ['acme/engine'])
  assert.equal(result.packages.find(p => p.dir === 'engine/extra').publicDeclarations, null)
  assert.deepEqual([...result.evidence.keys()].sort(), ['pkg-engine/a.mbt.impl','pkg-shell/a.mbt.surface'])
})

test('build というソースパッケージも jev-lint の組み込み除外を回避する', () => {
  const files = new Map(Object.entries({
    'moon.work': 'members = ["."]', 'moon.mod': 'name = "acme/main"',
    'paint/build/moon.pkg': '', 'paint/build/node.mbt': 'pub fn build() -> Unit { () }',
  }))
  const result = scanWorkspace([...files.keys()], path => files.get(path))
  assert.equal(result.evidence.size, 1)
  const [[path, body]] = result.evidence
  assert.ok(!path.split('/').includes('build'))
  assert.match(body, /source: paint\/build\/node.mbt/)
})
