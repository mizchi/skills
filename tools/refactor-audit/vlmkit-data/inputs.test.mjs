import assert from 'node:assert/strict'
import test from 'node:test'
import { packageEntries } from './inputs.mjs'

test('publish 済みパッケージの別名と深い wildcard を展開し、テスト・private を除く', () => {
  const pkg = {name:'@mizchi/vlmkit-ai', exports:{'.':{import:'./dist/index.mjs'}, './*.ts':{import:'./dist/*.mjs'}}}
  const paths = ['index.ts','tools/nlp.ts','tools/nlp.test.ts'].map(s => 'packages/vlmkit-ai/src/'+s)
  const entries = packageEntries('packages/vlmkit-ai',pkg,paths)
  assert.deepEqual(entries.map(e=>e.name), ['@mizchi/vlmkit-ai','@mizchi/vlmkit-ai/index.ts','@mizchi/vlmkit-ai/tools/nlp.ts'])
  assert.deepEqual(packageEntries('packages/vlmkit-ai',{...pkg,private:true},paths),[])
})
