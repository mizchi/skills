// Node 24 strips the type-only imports in these two modules.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const load = name => import(pathToFileURL(resolve(process.argv[2],'src',name+'.ts')))
const { composeModels } = await load('compose')
const { checkModel } = await load('checker')
const left = {
  name:'left', initial:()=>['a','b'].map(observation=>({state:0,observation})),
  key:String, actions:()=>[], step:()=>[]
}
const right = {
  name:'right', initial:()=>[{state:0,observation:0}], key:String,
  actions:n=>n===0?['tick']:[], step:n=>n===0?[{state:1,observation:1}]:[]
}
const product = composeModels(left,right,{name:'product',invariants:[
  {name:'no-b-after-tick',check:s=>!(s.left.observation==='b' && s.right.state===1)}
]})
const bounds = {maxDepth:3,maxStates:20}
const seeds = product.initial()
const tick = {target:'right',action:'tick'}
const reached = product.step(seeds[1].state,tick)[0]
assert.equal(product.invariants[0].check(reached.state),false)
assert.equal(product.key(seeds[0].state),product.key(seeds[1].state))
const original = checkModel(product,bounds)
const reversed = checkModel({...product,initial:()=>[...seeds].reverse()},bounds)
const control = checkModel({...product,key:s=>JSON.stringify([product.key(s),s.left.observation])},bounds)
assert.deepEqual([original.status,reversed.status,control.status],['complete','violation','violation'])
console.log(JSON.stringify({original:original.status,reversed:reversed.status,control:control.status,reachableViolation:reached.observation}))
