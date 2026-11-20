import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {validateRuleCases} from './jev-rule-cases.mjs';
export function checkJevRuleCases(repository=fileURLToPath(new URL('../',import.meta.url))){
  const root=join(repository,'.jev-lint/rules/text');
  return readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(entry=>{
    const directory=join(root,entry.name),readJson=path=>JSON.parse(readFileSync(join(directory,path),'utf8'));
    const coverage=readJson('case-coverage.json'),expectations=readJson('expect.yml');
    const fixtures=Object.fromEntries(coverage.cases.map(c=>{
      if(!/^fixtures\/[a-z0-9-]+\.md$/.test(c.file))throw Error('Unsafe fixture path');
      const path=join(directory,c.file);if(!lstatSync(path).isFile())throw Error('A fixture must be a regular file');
      return [c.file,readFileSync(path,'utf8')];
    }));
    return {rule:'text/'+entry.name,...validateRuleCases({coverage,expectations,fixtures})};
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))for(const result of checkJevRuleCases())console.log(JSON.stringify(result));
