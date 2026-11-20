import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateRuleCases} from './jev-rule-cases.mjs';

function sample(){
  return {
    coverage:{version:1,cases:[
      {file:'fixtures/a.md',kind:'false-positive-risk',reason:'A normal scoped exception resembles the defect.'},
      {file:'fixtures/b.md',kind:'false-negative-risk',reason:'The violation is hidden behind an otherwise valid description.'},
      {file:'fixtures/c.md',kind:'unrelated',reason:'Only unrelated explanatory material was added.'}
    ],independencePairs:[{base:'fixtures/a.md',variant:'fixtures/c.md'}]},
    expectations:{'fixtures/a.md':[{line:1,label:'clean'}],'fixtures/b.md':[{line:1,label:'bad'}],'fixtures/c.md':[{line:1,label:'clean'}]},
    fixtures:{'fixtures/a.md':'source a\n','fixtures/b.md':'source b\n','fixtures/c.md':'source a\n\n## Unrelated material\nAn unrelated deployment note.\n'}
  };
}

test('a Jev rule requires false-positive, false-negative and unrelated controls with explicit labels',()=>{
  assert.deepEqual(validateRuleCases(sample()).counts,{'false-positive-risk':1,'false-negative-risk':1,unrelated:1});
  for(const kind of ['false-positive-risk','false-negative-risk','unrelated']){
    const args=sample();args.coverage.cases=args.coverage.cases.filter(c=>c.kind!==kind);args.coverage.independencePairs=[];
    assert.throws(()=>validateRuleCases(args),new RegExp(kind));
  }
});

test('case tags cannot manufacture clean/defect labels or count duplicate inputs as separate controls',()=>{
  const wrong=sample();wrong.expectations['fixtures/a.md'][0].label='bad';assert.throws(()=>validateRuleCases(wrong),/clean/i);
  const missing=sample();delete missing.expectations['fixtures/c.md'];assert.throws(()=>validateRuleCases(missing),/label|expect/i);
  const repeated=sample();repeated.fixtures['fixtures/c.md']=repeated.fixtures['fixtures/a.md'];assert.throws(()=>validateRuleCases(repeated),/duplicate|identical/i);
  const implicit=sample();implicit.expectations.default='clean';assert.throws(()=>validateRuleCases(implicit),/default/i);
});

test('an unrelated variant keeps the operative prefix and expected verdict unchanged',()=>{
  const changed=sample();changed.fixtures['fixtures/c.md']='Different operative policy\n';assert.throws(()=>validateRuleCases(changed),/prefix|unrelated/i);
  const label=sample();label.expectations['fixtures/c.md'][0].label='bad';assert.throws(()=>validateRuleCases(label),/label|verdict/i);
});

test('every maintained Jev rule carries the three mandatory categories and the new description policy is enabled',()=>{
  const directory=new URL('../.jev-lint/rules/text/',import.meta.url);
  const names=readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
  assert.ok(names.includes('description-trigger-policy'));
  for(const name of names){
    const root=new URL(name+'/',directory),expectations=JSON.parse(readFileSync(new URL('expect.yml',root),'utf8')),
      coverage=JSON.parse(readFileSync(new URL('case-coverage.json',root),'utf8'));
    const fixtures=Object.fromEntries(coverage.cases.map(c=>[c.file,readFileSync(new URL(c.file,root),'utf8')]));
    validateRuleCases({coverage,expectations,fixtures});
  }
  assert.match(readFileSync(new URL('../.jev-lint.yaml',import.meta.url),'utf8'),/text\/description-trigger-policy: on/);
});
