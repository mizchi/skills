# Filter and project records

Use the supplied record-query package to retain records matching a numeric
threshold, project the requested property, and preserve input order. Each selected
case supplies the field name, threshold, input examples and expected output shape.
Use the package for filtering and projection; do not recreate those operations.
Produce consumer.mjs exporting solve(rows), and record actual execution evidence.

The controller stages one case prompt from private/cases.json and the selected
package revision; it does not expose the full case file or its expected answers.
This is the historical programming example, not a requirement for other task types.
