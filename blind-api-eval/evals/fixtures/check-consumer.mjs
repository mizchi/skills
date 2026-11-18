import assert from 'node:assert/strict'; import {pathToFileURL} from 'node:url';
const {solve} = await import(pathToFileURL(process.argv[2]).href);
const cases=JSON.parse(process.argv[3]);const results=[];
for(const [index,[input,expected]] of cases.entries()) {
 try { const actual=await solve(structuredClone(input));assert.deepEqual(actual,expected);results.push({case:index,passed:true}); }
 catch(error) {results.push({case:index,passed:false,error:String(error)});}
}
console.log(JSON.stringify({passed:results.every(x=>x.passed),results}));
