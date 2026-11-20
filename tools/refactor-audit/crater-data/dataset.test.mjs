import assert from 'node:assert/strict'
import test from 'node:test'
import { joinVerdicts, groupSplit } from './dataset.mjs'

const rule = {id:'hyrum', ask:'Is this internal?', at:0.7, criteria:{true:'internal',false:'public'}}
const subject = {file:'a.surface', source:'core/a.mbt', group:'core', input:'pub let data', truncated:false}
const record = {model:'jev-1.14.0', answers:[{rule:'hyrum',file:'a.surface',value:0.7,line:1,arm:'bare'}]}
test('判定行は元の入力、判定元、閾値を含み、境界値を陽性にする', () => {
  const [row] = joinVerdicts(record, [rule], [{subject,rule}])
  assert.equal(row.input,subject.input)
  assert.equal(row.label,'bad')
  assert.equal(row.labelSource,'jev')
  assert.equal(row.score,0.7)
  assert.equal(row.split,groupSplit('core'))
})
test('欠損、重複、余計な判定、不正なスコアをデータ化しない', () => {
  const a = record.answers[0]
  for (const answers of [[],[a,a],[{...a,file:'ghost'}],[{...a,value:null}],[{...a,value:2}]]) {
    assert.throws(() => joinVerdicts({...record,answers}, [rule], [{subject,rule}]))
  }
})

test('別の評価リポジトリの行には明示した出典を保存する', () => {
  const [row] = joinVerdicts(record,[rule],[{subject,rule}],new Set(['core']),{repository:'mizchi/vlmkit',revision:'abc'})
  assert.equal(row.repository,'mizchi/vlmkit')
  assert.equal(row.revision,'abc')
  assert.equal(row.split,'test')
})
