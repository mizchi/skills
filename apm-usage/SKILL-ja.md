---
name: apm-usage
description: APMのmanifest、導入、対象を絞った更新、配置先、lockfileのリファレンス。ユーザーがAPMやapm.ymlを明示した場合、または不明なAPMコマンド・エラーの正確な仕様が必要な場合に使う。スキル導入済みプロジェクトという理由だけでは自動起動しない。
---

# APM — Agent Package Manager

2026-11-16にAPM 0.35.1で確認。英語のSKILL.mdを正本とする。
プロジェクトで固定したCLIとlockfileは、意図した更新まで維持する。
古いCLIを使う場合は、その版のhelpを先に確認する。

## 導入・再現・更新を分ける

```sh
apm --version
apm install owner/repo/path --target claude
apm install --frozen
apm update owner/repo/path --dry-run
apm update owner/repo/path --yes

# ユーザー全体への変更が依頼された場合
apm install -g owner/repo/path --target claude
apm update -g owner/repo/path --dry-run
apm update -g owner/repo/path --yes

apm uninstall owner/repo/path
apm deps list
apm deps tree
apm audit
```

通常のinstallは依存グラフを導入・再現する。frozenには対応する既存lockfileが必要。
依存の更新は`apm update`を使う。`apm install --update`はdeprecatedな互換経路。
対象packageを省略した広い更新は、その範囲が意図されている場合だけ行う。
CLI本体の更新は`apm self-update`等であり、スキルの更新とは別。
固定tag・SHAを動かすときはmanifestのrefを意図的に変更し、lockと配置物を検証する。
`--force`はローカルの内容を書き換え、重大な導入検査も回避し得るため通常の更新には使わない。

## manifestと配置先

```yaml
name: my-project
version: 1.0.0
targets: [claude, codex]
dependencies:
  apm:
    - owner/repo/skills/my-skill#v1.0.0
    - ./packages/local-skill
scripts:
  verify: "echo verify installed resources"
```

`targets`を明示し、`apm targets --json`で解決結果を確認する。
ローカルpath依存はプロジェクト開発用。ユーザー全体の導入には使わない。
プロジェクトでは`apm.yml`と`apm.lock.yaml`を同時に管理する。
ユーザー全体のmanifest/lock/cacheは`~/.apm/`配下、プロジェクトcacheは`apm_modules/`。

確認したClaude+Codexのローカル導入では`.claude/skills/source/`と
`.agents/skills/source/`に配置された。frontmatter名から配置先を決め打ちしない。
他のtargetでは共有`.agents/skills`を使う場合もあるため、古いtarget表を転用せず、
その版が報告したpathと配置物を確認する。legacy pathの利用は明示的に選ぶ。

## scriptsとlifecycle

`scripts`は実験的な`apm run <name>`で使う名前付きコマンド。
そこに`postinstall`という名前を付けるだけでは自動install hookにならない。
今回のローカル導入でも実行されなかった。自動処理には別のlifecycle機能と
trustルールがある。採用する場合だけ`apm lifecycle --help`と公式仕様を確認する。
依存パッケージ由来の処理を無条件に実行しない。

## 消費側で確認する

一時プロジェクトに明示targetとローカルsource依存を置き、dry-run、実導入、
配置pathと必要resource、frozen再現、対象を絞ったupdateのdry-runを確認する。
その後、新しいagentセッションまたはreloadで検出を確認する。
今回確認したのはファイル配布と更新計画までで、hosted更新やagentの行動品質ではない。
必要に応じて[消費側検証](../publish-agent-skill/references/apm.md)も参照する。

## chezmoi・認証・配布

APMのcacheと配置済みコピーはchezmoiの管理対象と分離する。
manifest/lockまたは自作sourceのどこをchezmoiが管理するかは、現在の所有境界を維持する。
ignoreを変更する前に実際の配置先とローカルsourceとの名前衝突を確認する。

private sourceでは設定済みprovider/gh認証やCIの認証機構を使う。
認証の優先順を版をまたいで決め打ちせず、`apm auth --help`等を確認する。
manifest・lock・コマンド例にtokenを埋め込まない。

配布するスキルにはSKILL.mdと参照するresourceを同梱する。
導入・auditの成功は配布と整合性の証拠であり、実際の行動検証の代わりではない。
[公式CLI](https://microsoft.github.io/apm/reference/)、
[更新仕様](https://microsoft.github.io/apm/reference/cli/update/)、
[publishing.md](references/publishing.md)を必要な範囲で読む。
