# record-query

Import `runQuery` from `record-query`.

`runQuery(rows, { where, pick })` filters records and projects the keys in `pick`.
`where` accepts comparisons such as `score >= 10` with inclusive numeric thresholds.
An invalid query throws an Error with code `QUERY_SYNTAX`.

```js
import { runQuery } from 'record-query';
runQuery([{ id: 'a', score: 20 }], { where: 'score >= 10', pick: ['id'] });
// [{ id: 'a' }]
```
