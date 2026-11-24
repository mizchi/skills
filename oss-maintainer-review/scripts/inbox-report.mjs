import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
function priority(row) {
  if (row.error) return 1;
  const kinds = new Set(row.signals.map(s => s.kind));
  if (kinds.has('privileged event') || kinds.has('write permission')) return 0;
  if (kinds.has('workflow') && ['network retrieval','environment or credential access','process execution'].some(k => kinds.has(k))) return 0;
  if (row.missing.length || row.fileLimitReached) return 1;
  if (['workflow','agent or review policy','execution entry point','install hook','environment or credential access','network retrieval','process execution'].some(k => kinds.has(k))) return 2;
  return 3;
}
const labels = ['権限・CI 実行経路を確認','差分の取得・補完が必要','実行入口・設定を確認','通常レビュー'];
const groups = labels.map(() => []);
for (const row of rows) groups[priority(row)].push(row);
console.log('# 外部 PR の一次レビュー一覧\n');
console.log('取得済み ' + rows.length + ' 件。区分は確認順であり、攻撃の認定ではありません。取得の網羅性は収集時の summary.json で確認してください。');
for (const [i, group] of groups.entries()) {
  console.log('\n## ' + labels[i] + '（' + group.length + ' 件）\n');
  for (const row of group.sort((a,b) => b.updated.localeCompare(a.updated))) {
    const signals = [...new Set(row.signals?.map(s => s.kind))].join(', ');
    console.log('- [' + row.repo + '#' + row.number + '](' + row.url + ') ' + (row.error ? 'API error' : signals || '追加行・パスの検出なし') + (row.missing?.length ? ' · 不完全な差分 ' + row.missing.length + ' ファイル' : ''));
  }
}
