Cycle tier test: parser -> tokens -> parser. Production imports are acyclic.
parser/read.ts:1 import {scan} from 'tokens'; export function parse(text) {return tree(scan(text))}
tokens/integration.test.ts:2 import {parse} from 'parser'
tokens/integration.test.ts:3 test('token offsets round trip through consumer parser', () => expect(parse(sample).end).toBe(sample.length))
tokens/scan.ts:2 export function scan(text) {return tokenize(text)}
