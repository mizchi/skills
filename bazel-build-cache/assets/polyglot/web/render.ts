import { readFileSync, writeFileSync } from "node:fs";

type Summary = { items: number; total: number };

const [input, output] = process.argv.slice(2);
const summary: Summary = JSON.parse(readFileSync(input, "utf8"));
writeFileSync(output, `items=${summary.items} total=${summary.total}\n`);
