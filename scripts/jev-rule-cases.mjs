const kinds=['false-positive-risk','false-negative-risk','unrelated'];
export function validateRuleCases({coverage,expectations,fixtures}) {
  if(coverage?.version!==1||!Array.isArray(coverage.cases)||!Array.isArray(coverage.independencePairs))throw Error('Invalid rule case coverage');
  if(Object.hasOwn(expectations,'default')||Object.hasOwn(expectations,'$default'))throw Error('An implicit default label cannot cover a required test');
  const counts=Object.fromEntries(kinds.map(k=>[k,0])),seen=new Set(),contents=new Set();
  for(const c of coverage.cases){
    if(!kinds.includes(c.kind)||typeof c.reason!=='string'||!c.reason.trim())throw Error('Every case needs a known kind and rationale');
    if(!/^fixtures\/[a-z0-9-]+\.md$/.test(c.file)||seen.has(c.file))throw Error('Duplicate or unsafe case path');seen.add(c.file);
    if(typeof fixtures[c.file]!=='string'||!fixtures[c.file].trim())throw Error('Required fixture is missing');
    if(contents.has(fixtures[c.file]))throw Error('Identical duplicate inputs cannot supply distinct controls');contents.add(fixtures[c.file]);
    const labels=expectations[c.file];
    if(!Array.isArray(labels)||labels.length!==1||labels[0].line!==1||!['clean','bad'].includes(labels[0].label))throw Error('An explicit whole-file expected label is required');
    if(c.kind==='false-positive-risk'&&labels[0].label!=='clean')throw Error('A false-positive control must be labelled clean');
    if(c.kind==='false-negative-risk'&&labels[0].label!=='bad')throw Error('A false-negative control must be labelled bad');
    counts[c.kind]++;
  }
  for(const kind of kinds)if(!counts[kind])throw Error('Missing mandatory '+kind+' case');
  for(const pair of coverage.independencePairs){
    if(!seen.has(pair.base)||!seen.has(pair.variant))throw Error('An unrelated pair must refer to declared cases');
    if(coverage.cases.find(c=>c.file===pair.variant).kind!=='unrelated')throw Error('The variant must be an unrelated control');
    if(expectations[pair.base][0].label!==expectations[pair.variant][0].label)throw Error('An unrelated pair must retain its expected label');
    if(!fixtures[pair.variant].startsWith(fixtures[pair.base].trimEnd()+'\n\n## Unrelated material\n'))throw Error('The unrelated variant must preserve the operative prefix');
  }
  return {counts,cases:coverage.cases.length,pairs:coverage.independencePairs.length};
}
