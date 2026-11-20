import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadRules } from 'jev-lint/rules'

const dist = new URL('dist/', import.meta.resolve('jev-lint/package.json'))
const { Jev } = await import(new URL('jev.js', dist))
const { run, buildRecord } = await import(new URL('run.js', dist))

function excerpt(s, limit) {
  if (s.length <= limit) return s
  return s.slice(0, limit / 2) + '\n[… middle omitted …]\n' + s.slice(-limit / 2)
}

export function compactHistory(state) {
  return {...state, message:excerpt(state.message, 1800), files:state.files.slice(0, 40),
    stat:excerpt(state.stat, 2000), diff:excerpt(state.diff, 8000),
    note_on_diff:'Partial commit evidence. The message, file list, stat and diff may be incomplete.'}
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [repo, initial, out] = process.argv.slice(2)
  const record = JSON.parse(readFileSync(initial, 'utf8'))
  const missingPairs = record.answers.filter(a => a.value === null)
  if (!missingPairs.length) {
    console.log('History is complete.')
    process.exit(0)
  }
  const missing = [...new Set(missingPairs.map(a => a.file))]
  assert.ok(missing.every(s => /^[a-f0-9]{40}$/.test(s)))
  class HistoryClient extends Jev {
    askSplitting(state, questions) { return super.askSplitting(compactHistory(state), questions) }
  }
  const {rules,errors} = loadRules(join(import.meta.dirname,'../rules/history.yml'))
  assert.deepEqual(errors,[])
  const result = await run({rules,paths:[],cwd:resolve(repo),commits:{range:'--no-walk '+missing.join(' ')},
    model:record.model,concurrency:4,client:new HistoryClient({model:record.model,baseUrl:'https://api.typesafe.ai',
      apiKey:process.env.TYPESAFE_API_KEY})})
  const retry = buildRecord(result,{arm:null,cutoffs:{},unsureBelow:null})
  assert.equal(retry.answers.length,missing.length*rules.length)
  // Batches are per commit. Keep the initial score if its sibling rule alone failed.
  const keys = new Set(missingPairs.map(a => a.file+'#'+a.rule))
  retry.answers = retry.answers.filter(a => keys.has(a.file+'#'+a.rule))
  assert.equal(retry.answers.length,keys.size)
  assert.ok(retry.answers.every(a => Number.isFinite(a.value)), 'incomplete retry')
  writeFileSync(out,JSON.stringify(retry,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify({answers:retry.answers.length,spent:retry.spent}))
}
