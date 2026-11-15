# スキル鮮度監査 — 2026-11-16

更新検知の自動化を優先する対象は、Cloudflare、MoonBit、エージェントSDK・配布ツール、vlmkit、OpenTelemetry、Void、GitHub Actions。バージョンの違いだけで本文を置換せず、実際に配布されたパッケージとサンプルの検証を更新条件にする。

## 調査範囲と判定

Git管理対象と未追跡・非ignoreの追加から、トップレベルの76スキルを棚卸しした。個人用のignore対象、インストール済み依存、ツールのサンプルスキルは含めない。全入口の依存先・バージョン記述・コマンド・参照先を抽出し、高変動の入口と関係する参照・実装を詳しく確認した。全参照ファイルの全コード例を実行した監査ではない。

一次情報の照合は2026-11-15〜16。GitHubのrelease・`action.yml`、npm公式レジストリ、公式の変更履歴・移行ガイドを使用した。Context7は利用枠超過のため公式情報へ切り替えた。既存の作業中変更を含む現在のワークツリーが対象で、Gitの更新日だけでは鮮度を判定していない。

「要修正」は具体的な食い違いか再現した失敗、「再検証」は上流との差分があるが現在の例の不具合をまだ立証していないもの。「棚卸し」は新しい問題を確定していない状態で、最新仕様との全面的な一致を意味しない。

## 確認した問題

| ID | 優先度 | 対象 | 根拠と必要な変更 |
| --- | --- | --- | --- |
| F01 | 高 | [AWS OIDC](../aws-github-oidc-scoped-role/SKILL.md) | `token.actions.githubusercontent.com:job_workflow_ref` をAWS IAMの直接の条件キーにしている。[GitHubのAWS向け説明](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)ではカスタムclaimをサポートしない。`job_workflow_ref` は再利用可能workflowのclaimであり、任意の通常workflow指定とは異なる。`sub` のカスタマイズを含めて設計し直す必要がある。新しいリポジトリのimmutable subject形式も確認する。[claim仕様](https://docs.github.com/en/actions/reference/security/oidc) |
| F02 | 高 | [OpenTelemetry](../opentelemetry/SKILL.md)、[Node版](../otel-node/SKILL.md) | `new Resource`、`addSpanProcessor`、単数形`spanProcessor`、旧traceパッケージに依存している。[SDK 2移行](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)、[SDK 3移行](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md)との食い違い。公開版resources 3.1.1はResourceを型としてexportし、sdk-trace-base 2.12.0はdeprecated。API・SDK・exporterを互換性のある組で固定して例を再検証する。 |
| F03 | 高 | [vlmkit](../vlmkit/SKILL.md) | インストール例は`@mizchi/vrt`だが、その[公開メタデータ](https://registry.npmjs.org/@mizchi/vrt/latest)のbinは`vrt`。本文の`vlmkit`コマンドは別の[@mizchi/vlmkit](https://registry.npmjs.org/@mizchi/vlmkit/latest)のbin。0.5.0の説明、npm 0.24.0、GitHub release v0.9.1、mainのCHANGELOG 0.27.0が混在する。配布物とmainを分け、インストールから最小コマンドまで検証する。 |
| F04 | 高 | frontend-reviewの6入口、weekly | ci/deps/hygiene/security/testing/triageが要求する10種類の`audit-*.sh`等が各スキルにもルートにもない。入口ディレクトリにはSKILL.mdとREADME.mdだけ。取得先・依存宣言もないため、単体インストールした状態では記載どおりの監査を始められない。チェックリストやデータの配布元も含め、同梱または明示した上流依存へ戻す。weeklyにも影響する。 |
| F05 | 中 | [依存監査](../dep-lib-review/SKILL.md)、[frontend依存監査](../frontend-review-deps/SKILL.md) | 例の`pnpm audit --json`の後に`.vulnerabilities`を読むjqは、手元のpnpm 10.28.2の出力でexit 5。実出力は`actions/advisories/metadata/muted`であり、件数は`metadata.vulnerabilities`。npm形式との混同を解消し、未知の形式を「問題なし」にしない。実行コードと記述を一緒に検証する。[pnpm audit](https://pnpm.io/cli/audit) |
| F06 | 中 | [Cloudflare参照](../cloudflare-deploy/references/workerd/api.md) | `node:fs`・`node:http`・`node:net`を一括して利用不可としている。[公式互換表](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)には対応があり、APIごとの制限とcompatibility dateに依存する。CLIのlegacy例という注記だけでは実行時APIの古さを解消できない。 |
| F07 | 中 | [APM](../apm-usage/SKILL.md) | 更新手順の中心が`apm install --update`。手元のAPM 0.21.0のhelpですでにdeprecatedとなっており、`apm update`へ案内される。上流releaseは[v0.35.1](https://github.com/microsoft/apm/releases/tag/v0.35.1)。新規導入と固定済み旧版の説明を分け、更新・配置先・lockfileを一時ディレクトリで確認する。 |
| F08 | 中 | [Pi](../pi-coding-agent/SKILL.md) | 旧`@mariozechner/pi-coding-agent` 0.73.1を説明する一方、リンク先の[現行SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)は`@earendil-works/pi-coding-agent` 1.5.2で構成も変化している。旧公開版が直ちに動かないとは判定していない。対象世代を明記し、現行版への移行を別途検証する。 |
| F09 | 中 | [tech-trend-watch](../tech-trend-watch/SKILL.md) | RadarをQuarterlyとする表記は、[公式FAQ](https://www.thoughtworks.com/radar/faq)の年2回と異なる。四半期ごとに「確認する」のは可能だが、新版の発行頻度とは区別する。調査結果の取得先とschemaも公開時に検証する。 |

上表は初回監査時点の記録。追補でF01〜F09を修正した（次節）。NodeとActionsに関する先行変更は後続節に記録した。過去に確認した英日activation条件差やSHA取得手順の曖昧さは、[既存監査](../.jev-lint/AUDIT.md)を参照する。

## 修正と自動検知 — 追補

F01〜F09を修正し、[運用手順](skill-freshness.md)と日次workflowを追加した。
上流の変更は意味判定とは独立して要確認になる。基準の受け入れは明示操作に限定する。
下表の実行検証はローカルの範囲で、認証や公開先の変更は含めない。

| ID | 反映内容・確認範囲 |
| --- | --- |
| F01 | IAMのaud/subと、再利用workflowのclaimを含むカスタムsubへ修正。immutable ID形式と移行時の既存利用者も記載。実IAMの変更はしていない |
| F02 | SDK 3のresourceFromAttributes、spanProcessors、processorのoptions、sdk-traceへ移行。型チェックとメモリexporterで親子span・伝播・error・終了flushを確認 |
| F03 | @mizchi/vlmkitとvrtを分離。公開CLI 0.24.0でhelpと実HTMLの3viewport比較を確認。GitHub main/releaseを公開npm版と混同しない |
| F04 | 6入口に独立動作する収集コードと9種類のwrapperを同梱。14スキルに収集契約を追加。既存coverage・lint・GitHubデータがなければ未測定とする。生成元との同期もCIで検査 |
| F05 | pnpm/npm形式を検証するnormalizerを実装。exit 1の脆弱性を保持し、未知schema・通信失敗を正常ゼロ件にしない。5テストで確認 |
| F06 | fs/http/netをAPI別の部分対応とcompatibility dateに修正。cf beta.32/plugin 2 beta.17で型生成・ビルド・deploy dry-runを確認 |
| F07 | APM 0.35.1を一時環境で実行。targeted update、dry-run、install、frozen replay、2 targetの実配置、名前付きscriptの非自動実行を確認。英日を更新 |
| F08 | Pi 1.5.2のnamespace/ModelRuntime/tool/resource APIへ更新。isolated sessionの型と起動を確認。モデル推論やOAuthログインは未実行。依存先の型宣言はskipLibCheckを使用 |
| F09 | Radarは年2回発行、四半期は確認の頻度として分離。未確認のsurvey JSON URL生成をやめ、公開editionとschemaを確認する手順へ変更 |

再検証対象では、SQLite + sqlite-vec 0.1.9はNodeとVitest 5.1.0の両方でvec0検索を確認し、一律のVitest禁止を解消した。Void 1.9.1/Vite+ 1.6.0では成功時reset・入力保持・永続化・redirectをPlaywrightで再検証し、現行APIを英日へ反映した。Cloudflareのhelper回帰テストも通過した。以前の全CRUD、全Cloudflare製品の実API、MoonBit外部adapterの全体互換性まで確認したとは扱わない。

既存の英日activation差（APM、empirical-prompt-tuning、retrospective-codify）とupstream-fix-and-pinのmerge SHA/branch tip混同も修正した。chezmoi日本語版の旧bootstrap手順は英語版のNix分担へ揃えた。devbox/dotenvxのopt-in方針は保持している。

## Node 24以上への統一 — 実施済み

ユーザー指定を[共通方針](../CLAUDE.md#tool-adoption-policy)に追加した。nix-setupのDevbox例・テンプレート、SQL系4スキル、Piの利用環境、MoonBitのTypeScript連携、CloudflareのNode導入例、waxaのREADMEと次回npmビルドの`engines`をNode 24以上へ揃えた。既存公開パッケージのメタデータは変更していない。過去のリリース履歴やSQLite導入時期の説明は履歴として保持した。

Cloudflare CI例の`pnpm/action-setup@v4`は上流metadataが`node20`だったため`v6`へ更新。現在のv6.1.1は`node24`。ルートworkflowのcheckout v6/setup-node v6、cache v5/upload-artifact v6も`node24`であることを確認した。スキル同梱YAMLに使う他の主要actionとcomposite内部の参照も確認した。ignore対象の探索用checkoutのworkflowは変更していない。

[actions-ci-tuning](../actions-ci-tuning/SKILL.md)はNode 20の[2026-09-23廃止](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)を反映し、根拠のない「最初に対応したmajor」表をmetadataで確認した版の表に変更。現行releaseのSHA例も更新した。プロジェクトの`node-version: 24`だけでは別のactionの内蔵Nodeは変わらない。

検証では変更前に8箇所の旧指定を検出し、変更後はすべて解消。Node v24.22.2でSQL系の正常系4コマンドを実行し、意図したSQL injection例はexit 1になった。waxaの`deno task check`も通過した。GitHub上でコピー先の全workflowを実行したという意味ではない。

初回監査時の確認は、`pkf run test`（Ruby 4件・14 assertions、Node 41件、76入口のfrontmatter、README整合性）、Markdown 560ファイルのローカルリンク検査、実workflowのactionlint、diffの空白検査が通過。jev-lintは92文書・276比較を再確認し、今回変わった8文書の24回答を更新した。既知のupstream-fix-and-pinのSHA表現1件が残り、新しい整合性候補は出ていない。これは上記のAPI・配布物の鮮度問題が解決したという意味ではない。

## 更新差分の再検証結果

| 対象 | 現行の確認範囲 | 残る範囲 |
| --- | --- | --- |
| cf / Cloudflare plugin | beta.32 / plugin 2.0.0-beta.v.17、型生成・build・deploy dry-run | 実アカウントの製品別操作、rollback実行 |
| Void / Vite+ | 1.9.1 / 1.6.0、フォームreset・入力保持・永続化・redirect・build | 旧実験の全CRUD・DB移行・React/Solid併用の全面的な再実行 |
| Playwright | 1.65.1 ChromiumでHTML比較とVoid E2E | 消費側の全runner設定・blob report・Docker image組合せ |
| MoonBit外部adapter | js_core 0.13.0 / x 0.7.0。旧importの失敗と修正版を確認。Any/Promise、JSとNativeのファイル・子プロセス | Web/Node/npm binding全体と複数async runtimeの状態共有 |
| MoonBit Nix | overlayの現行latest、v0.10.20 toolchain、DSL nativeビルドと出力42、Nix templateの評価 | Linux実行、依存を含むNix build。moon-nixの現行pkgtype対応は失敗するcontrolを記録 |
| node-sqlite-vec | sqlite-vec 0.1.9、NodeとVitest 5.1.0でvec0検索 | 消費側の別設定・別runnerとの組合せ |

## 追加修正と監視範囲の拡張

- PRとmain pushに[現在の本文・英日ペアの意味検査](skill-review-ci.md)を追加。
  fixture replayとは別に、変更した入口全体を検査する。PRはベース側の検査コードでheadのblobをデータとして読む。
- 監視を15グループへ拡張。Gleam本体とHexのWisp/Mist/OTP、ast-grep、Nix/Devbox/overlay/project builder、dotenvx、Stryker、skills CLIとClaude plugin資料を追加した。
  Gleamの公開版比較はregistryの記録であり、全サンプルを現行compilerでコンパイルした意味ではない。
- dotenvx 2.38.2で先のファイル・shell値が優先、overloadで後から上書きすることをテストし、英日を修正。opt-in方針を保持。
- AWSの末尾に残ったwildcardの旧手順も修正。ConverseのIAM action、ReadOnlyAccessの実permission、activationと推論の区別を公式資料で再確認した。
- private mnemoへのリンク6件は出自の記録を残して同梱コード・公開資料へ整理。403のforum URLは現行Basin Catalog公式資料へ変更。
  HTTP失敗を許可する除外は追加していない。修正後の外部リンク検査はエラー0。

## 自動化する範囲

[監視対象と検証条件](skill-upstream-watchlist.json)に10グループ・38スキルを整理した。初回は設計データとして作成した。その後、[日次検知と明示的な基準承認](skill-freshness.md)を実装した。以下は当初の優先順位で、実装したworkflowは全10グループを毎日取得する。

1. **毎日検知**: Cloudflare、MoonBit、APM/Pi、vlmkit、Actions。npm dist-tag、release tag、対象ファイルのcommit/digestを別々に記録する。HTTPエラー、削除・改名、schema不明は検査失敗として残す。
2. **毎週検知**: OTel、Void/Vite+、Playwright、pnpm、AWS OIDC。変更時にだけ詳細検証へ進み、変更がない日にLLMで全文を再生成しない。
3. **検証して更新案を作る**: 変更した上流と影響するスキル・参照・日本語版・テンプレートを結び、正確な版を一時環境へ固定する。実行例、型、CLI schemaを検証し、確認日・根拠・検証限界を記録する。
4. **機械的な変更を自動化**: 実workflowのAction SHA/依存versionはDependabotまたはRenovate。Markdown中のAction例、独自release JSON、APM lock、MoonBit moduleは別の抽出・検証が必要。通常のnpm更新だけでは本文の誤りを検出できない。
5. **本文変更はレビューできる差分にする**: 上流の未リリースmainを公開版と取り違えず、意味の変更をテストした更新案として提示する。自動mergeは前提にしない。既存lycheeはリンク、jev-lintは記述整合性を受け持ち、APIの鮮度を保証する検査とは分ける。

監視実行はNode 24+、read-only権限、日次取得のcache、manual trigger、機械可読レポートを基本にする。全体を毎日再生成するより、上流差分→影響スキル→対応する検証という順で負担を抑える。認証・デプロイ・DB変更は更新検査の外で扱う。

## 全76スキルの棚卸し

間隔は上流を確認する推奨頻度。「変更時」は固定された日数より、そのスキル自身または直接依存の変更をきっかけに検証する意味。毎日・毎週の確認でも、本文の自動書き換え頻度を示さない。

| スキル | 判定 | 確認間隔 | 次の確認対象 |
| --- | --- | --- | --- |
| [actions-ci-tuning](../actions-ci-tuning/SKILL.md) | 修正済み | 毎日 | Node 24/Action runtime分離・metadata表・現行SHA |
| [ai-index](../ai-index/SKILL.md) | 棚卸し | 変更時 | 測定原理は低変動、LLM/model境界は別監視 |
| [apm-usage](../apm-usage/SKILL.md) | 修正済み | 毎日 | F07: update手順・配置先を現行版で検証 |
| [ast-grep-practice](../ast-grep-practice/SKILL.md) | 棚卸し | 毎日 | CLI/rule schema・言語grammarとmatcher回帰 |
| [aws-ecs-codedeploy-blue-green](../aws-ecs-codedeploy-blue-green/SKILL.md) | 棚卸し | 四半期 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [aws-ecs-service-connect-ipv6](../aws-ecs-service-connect-ipv6/SKILL.md) | 棚卸し | 四半期 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [aws-github-oidc-scoped-role](../aws-github-oidc-scoped-role/SKILL.md) | 修正済み | 毎日 | F01: IAM条件キー・sub形式 |
| [aws-vault-mfa-iam](../aws-vault-mfa-iam/SKILL.md) | 棚卸し | 四半期 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [chezmoi-management](../chezmoi-management/SKILL.md) | 棚卸し | 毎日 | APM配置先と実際のdotfiles境界 |
| [cloudflare-access-app-setup](../cloudflare-access-app-setup/SKILL.md) | 再検証 | 毎日 | cf schema・Access API・token再実行動作 |
| [cloudflare-deploy](../cloudflare-deploy/SKILL.md) | 修正済み | 毎日 | F06: Workers Node API表。cf CLIは再検証、Node例修正済み |
| [cloudflare-mbt-worker-bundle](../cloudflare-mbt-worker-bundle/SKILL.md) | 再検証 | 毎日 | cf更新とMoonBit出力symbol変更の組合せ |
| [cloudflare-workers-cd-rollback](../cloudflare-workers-cd-rollback/SKILL.md) | 一部再検証済み | 毎日 | deployment/credentialのローカル回帰テスト済み。実rollbackは別 |
| [cloudflare-workers-otel-utels](../cloudflare-workers-otel-utels/SKILL.md) | 再検証 | 毎日 | Worker wrapper・OTLP exporter・非公開実装の来歴 |
| [conventional-changelog](../conventional-changelog/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [dep-lib-review](../dep-lib-review/SKILL.md) | 修正済み | 毎週 | F05: pnpm audit JSON parser |
| [dotenvx](../dotenvx/SKILL.md) | 棚卸し | 毎日 | 暗号化/鍵更新CLI。opt-in方針を保持 |
| [empirical-prompt-tuning](../empirical-prompt-tuning/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [extract-glossary](../extract-glossary/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [flaker-storage-cache-on-ci](../flaker-storage-cache-on-ci/SKILL.md) | 棚卸し | 毎日 | CLI・storage schema・Actionとcache保存仕様 |
| [formal-methods-drift-guard](../formal-methods-drift-guard/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [formal-methods-reconciler](../formal-methods-reconciler/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [frontend-expert](../frontend-expert/SKILL.md) | 棚卸し | 四半期 | 観点は比較的安定。入力raw JSONと外部checklistの配布を確認 |
| [frontend-ops-expert](../frontend-ops-expert/SKILL.md) | 棚卸し | 四半期 | 観点は比較的安定。入力raw JSONと外部checklistの配布を確認 |
| [frontend-review-ci](../frontend-review-ci/SKILL.md) | 修正済み | 毎月 | F04: 呼び出す監査runnerが未同梱 |
| [frontend-review-deps](../frontend-review-deps/SKILL.md) | 修正済み | 毎週 | F04/F05: 未同梱runner・JSON parser |
| [frontend-review-hygiene](../frontend-review-hygiene/SKILL.md) | 修正済み | 毎月 | F04: 呼び出す監査runnerが未同梱 |
| [frontend-review-performance](../frontend-review-performance/SKILL.md) | 棚卸し | 毎月 | 観点とframework依存部分を分離し、参照checklistを確認 |
| [frontend-review-security](../frontend-review-security/SKILL.md) | 修正済み | 毎月 | F04: 呼び出す監査runnerが未同梱 |
| [frontend-review-state](../frontend-review-state/SKILL.md) | 棚卸し | 毎月 | 観点とframework依存部分を分離し、参照checklistを確認 |
| [frontend-review-testing](../frontend-review-testing/SKILL.md) | 修正済み | 毎週 | F04: 呼び出す監査runnerが未同梱 |
| [frontend-review-triage](../frontend-review-triage/SKILL.md) | 修正済み | 毎月 | F04: 呼び出す監査runnerが未同梱 |
| [frontend-review-weekly](../frontend-review-weekly/SKILL.md) | 修正済み | 毎週 | F04: 収集runnerと外部skill依存 |
| [gh-fix-ci](../gh-fix-ci/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [gleam-practice](../gleam-practice/SKILL.md) | 監視追加・再検証待ち | 毎日 | Gleam/Hex registry監視追加。全サンプルcompileは未実行 |
| [justfile](../justfile/SKILL.md) | 棚卸し | 毎日 | just構文・setup action metadata |
| [k8s-crd-from-typed-schema](../k8s-crd-from-typed-schema/SKILL.md) | 棚卸し | 毎月 | CRD API・schema generator互換性 |
| [maintainer-persona](../maintainer-persona/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [metal-practice](../metal-practice/SKILL.md) | 部分検証済み | 四半期 | 先行作業で確認。SDK/OS/device availability変更時に再確認 |
| [mizchi-blog-style](../mizchi-blog-style/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [moonbit-js-binding](../moonbit-js-binding/SKILL.md) | 部分検証済み | 毎日 | 直接FFI例は検証済み、外部adapter APIは別確認。Node方針修正済み |
| [moonbit-practice](../moonbit-practice/SKILL.md) | 部分検証済み | 毎日 | 最新3記事・compiler例は先行作業で検証済み、CLIを継続監視 |
| [multi-agent-orchestration](../multi-agent-orchestration/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [natural-writing-en](../natural-writing-en/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [natural-writing-ja](../natural-writing-ja/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [nix-setup](../nix-setup/SKILL.md) | 修正済み | 毎日 | Node 24のDevbox例とテンプレート。opt-in方針を保持 |
| [node-sqlite-vec](../node-sqlite-vec/SKILL.md) | 修正済み | 毎週 | Node/Vitest双方でvec0検索を再検証済み |
| [opentelemetry](../opentelemetry/SKILL.md) | 修正済み | 毎週 | F02: SDK・semconvの世代差 |
| [optimizing-descriptions](../optimizing-descriptions/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [otel-node](../otel-node/SKILL.md) | 修正済み | 毎週 | F02: SDK初期化・ESM loader |
| [performance-expert](../performance-expert/SKILL.md) | 棚卸し | 四半期 | 観点は比較的安定。入力raw JSONと外部checklistの配布を確認 |
| [pi-coding-agent](../pi-coding-agent/SKILL.md) | 修正済み | 毎日 | F08: package改名・SDK世代を明記。Node方針修正済み |
| [playwright-cli](../playwright-cli/SKILL.md) | 棚卸し | 毎週 | test/codegen等のCLIと利用可能なbrowser tool |
| [playwright-test](../playwright-test/SKILL.md) | 再検証 | 毎日 | runner設定・report・browser/imageの版整合 |
| [publish-agent-skill](../publish-agent-skill/SKILL.md) | 一部再検証済み | 毎日 | APM 0.35.1のconsumer確認済み。skills 1.8.1は監視追加 |
| [react-expert](../react-expert/SKILL.md) | 棚卸し | 四半期 | 観点は比較的安定。入力raw JSONと外部checklistの配布を確認 |
| [retrospective-codify](../retrospective-codify/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [review-image](../review-image/SKILL.md) | 棚卸し | 毎月 | model提供状況・OpenRouter schema・JSON gate契約 |
| [security-expert](../security-expert/SKILL.md) | 棚卸し | 四半期 | 観点は比較的安定。入力raw JSONと外部checklistの配布を確認 |
| [skill-finder](../skill-finder/SKILL.md) | 棚卸し | 毎日 | 公式catalog・探索先・評価runnerの互換性 |
| [skill-selector](../skill-selector/SKILL.md) | 棚卸し | 毎日 | catalogと実配布先の対応 |
| [sql-lint](../sql-lint/SKILL.md) | 修正済み | 四半期 | Node 24方針、CLI正常系確認 |
| [sql-plan-audit](../sql-plan-audit/SKILL.md) | 修正済み | 四半期 | Node 24方針、実DBのSEARCH plan確認 |
| [sql-schema-audit](../sql-schema-audit/SKILL.md) | 修正済み | 四半期 | Node 24方針、実DBのindex監査確認 |
| [sql-security](../sql-security/SKILL.md) | 修正済み | 四半期 | Node 24方針、正常系と検出exit 1確認 |
| [sqlc-gen-moonbit-safety](../sqlc-gen-moonbit-safety/SKILL.md) | 部分検証済み | 毎日 | 既存gateは配布済み。generator/D1/JS ABI変更を監視 |
| [stryker-js](../stryker-js/SKILL.md) | 棚卸し | 毎日 | runner peer・mutation report契約・Action pins |
| [tech-article-reproducibility](../tech-article-reproducibility/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [tech-trend-watch](../tech-trend-watch/SKILL.md) | 修正済み | 毎週 | F09: Radar発行頻度・調査データの版 |
| [translate-programming-language](../translate-programming-language/SKILL.md) | 棚卸し | 変更時 | 原則・手順は低変動。依存CLI/APIまたは利用環境変更時に再確認 |
| [ts2moonbit-migration](../ts2moonbit-migration/SKILL.md) | 一部再検証済み | 毎日 | js_core 0.13.0 / x 0.7.0のJS/Native実行済み |
| [upstream-fix-and-pin](../upstream-fix-and-pin/SKILL.md) | 要確認 | 毎週 | 既存SHA曖昧さ。pnpm build許可設定も版確認 |
| [utels-project-bootstrap](../utels-project-bootstrap/SKILL.md) | 一部再検証済み | 毎日 | cf secret stdin契約の回帰テスト済み。実登録は別 |
| [vlmkit](../vlmkit/SKILL.md) | 修正済み | 毎日 | F03: package/binと公開経路の混在 |
| [void-app](../void-app/SKILL.md) | 一部再検証済み | 毎週 | 1.9.1のreset/redirect・永続化・build済み。全旧実験は別 |
| [waxa-eval](../waxa-eval/SKILL.md) | 棚卸し | 変更時 | 同一repoのCLI変更時にgrader/ledger契約検証 |
