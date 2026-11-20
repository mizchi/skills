api.ts:4 /** save accepts any list, including an empty list, and returns the number persisted. */
api.ts:5 interface Sink { save(xs: Row[]): number }
memory.ts:12 save(xs) { this.rows.push(...xs); return xs.length }
disk.ts:16 save(xs) { if (!xs.length) throw Error('batch required'); return writeRows(xs) }
flush.ts:27 const count = sink.save(pending.splice(0))
