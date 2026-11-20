api.ts:4 /** Results include every supplied ID exactly once, in unspecified order. */
local.ts:12 ids(xs) { return xs.slice().sort() }
remote.ts:16 ids(xs) { return xs.slice().reverse() }
view.ts:27 const seen = new Set(api.ids(['a','b']))
logging.ts:12 const logPrefix = "[pipeline]"
