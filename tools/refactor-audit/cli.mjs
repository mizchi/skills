import { audit, writeEvidence } from './audit.mjs'

const [manifest, out] = process.argv.slice(2)
if (process.argv.length !== 4) {
  console.error('Usage: node cli.mjs <source-exports-manifest.json> <new-output-directory>')
  process.exitCode = 2
} else {
  try {
    const {report, evidence} = audit(manifest)
    writeEvidence(out, report, evidence)
    console.log(JSON.stringify({...report.summary, issues: report.issues.length}))
    if (report.issues.length) console.error('Partial resolution. Inspect issues in inventory.json.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
