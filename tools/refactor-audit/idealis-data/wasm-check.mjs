import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
for (const [crate,prefix] of [['idealis_core','modelt'],['idealis_smt','smt'],['ralloy','ralloy']]) {
  const {instance}=await WebAssembly.instantiate(readFileSync(join(process.argv[2],crate+'.wasm')))
  const abi=instance.exports
  const results=[]
  for (const body of ['{','{}']) {
    const input=new TextEncoder().encode(body)
    const ptr=abi[prefix+'_input_resize'](input.length)
    new Uint8Array(abi.memory.buffer,ptr,input.length).set(input)
    abi[prefix+'_dispatch']()
    const bytes=new Uint8Array(abi.memory.buffer,abi[prefix+'_output_ptr'](),abi[prefix+'_output_len']())
    const response=JSON.parse(new TextDecoder().decode(bytes))
    assert.equal(response.kind,'error')
    const message=crate==='ralloy'?response.error.message:response.message
    assert.ok(message)
    results.push(message)
  }
  assert.notEqual(...results)
  console.log(JSON.stringify({crate,messages:results}))
}
