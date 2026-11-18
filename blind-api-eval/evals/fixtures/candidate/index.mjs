export function runQuery(rows, { where, pick }) {
  const match = /^(?:([A-Za-z_][A-Za-z0-9_]*)|field\("([^"\n]+)"\)) >= (-?\d+)$/.exec(where);
  if (!match) { const error = new Error("Invalid query. Expected NAME >= INTEGER. For a literal property key containing punctuation, use field(\"property.key\") >= INTEGER."); error.code = 'QUERY_SYNTAX'; throw error; }
  const key = match[1] ?? match[2]; const threshold = Number(match[3]);
  return rows.filter(row => Number(row[key]) >= threshold).map(row => Object.fromEntries(pick.map(name => [name, row[name]])));
}
