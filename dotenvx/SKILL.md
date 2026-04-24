---
name: dotenvx
description: dotenvx 環境変数管理ツールのリファレンス。暗号化、複数環境対応、GitHub Actions での使用例を提供。
---

# dotenvx Skill

dotenvx は .env ファイルの読み込み・暗号化を行う環境変数管理ツール。言語・フレームワーク非依存。

## インストール

```bash
# curl（推奨）
curl -sfS https://dotenvx.sh | sh

# brew
brew install dotenvx/brew/dotenvx

# npm
npm install @dotenvx/dotenvx --save
```

## 基本コマンド

```bash
# 環境変数を読み込んでコマンド実行
dotenvx run -- node index.js

# 特定の .env ファイルを指定
dotenvx run -f .env.production -- npm start

# 複数ファイル読み込み（後が優先）
dotenvx run -f .env -f .env.local -- npm start

# 環境変数を取得
dotenvx get DATABASE_URL

# 全環境変数を表示
dotenvx get
```

## 暗号化

```bash
# .env を暗号化（DOTENV_PUBLIC_KEY, DOTENV_PRIVATE_KEY 生成）
dotenvx encrypt

# 特定ファイルを暗号化
dotenvx encrypt -f .env.production

# 復号化
dotenvx decrypt

# 暗号化されたファイルを実行（DOTENV_PRIVATE_KEY が必要）
dotenvx run -- node index.js
```

### 暗号化の仕組み

- `dotenvx encrypt` 実行で公開鍵/秘密鍵ペアを生成
- `DOTENV_PUBLIC_KEY`: .env ファイル内に保存（暗号化用）
- `DOTENV_PRIVATE_KEY`: ローカル環境または CI に設定（復号化用）
- 環境別: `DOTENV_PRIVATE_KEY_PRODUCTION` で自動判定

## オプション

| オプション | 説明 |
|-----------|------|
| `-f, --env-file` | .env ファイル指定 |
| `--overload` | 後続ファイルで上書き |
| `--quiet` | 出力抑制 |
| `--verbose` | 詳細表示 |
| `--debug` | デバッグ情報表示 |

## 複数環境の管理

```
.env                 # 共通設定
.env.local           # ローカル上書き（gitignore）
.env.production      # 本番環境
.env.development     # 開発環境
```

```bash
# 本番環境で実行
dotenvx run -f .env.production -- npm start

# 開発 + ローカル上書き
dotenvx run -f .env.development -f .env.local -- npm run dev
```

## Key ローテーション

private key が漏洩疑いになったとき、または定期的な rotation 時の手順。`dotenvx rotate` 専用コマンドは 2026/04 時点で存在しないため、decrypt → 新 key で encrypt を明示的に行う。

**順序が最重要**: CI secret を **先に** 新 key に更新してから、新暗号文を merge する。逆だと旧 key で新暗号文を復号しようとして prod が落ちる。

```bash
# 1. 作業ブランチ + 旧 key 退避
git switch -c chore/rotate-prod-dotenv-key
set +o history
OLD_PRIV="$DOTENV_PRIVATE_KEY_PRODUCTION"

# 2. 旧 key で復号（平文に戻す）
DOTENV_PRIVATE_KEY_PRODUCTION="$OLD_PRIV" dotenvx decrypt -f .env.production

# 3. 既存 PUBLIC_KEY を削除してから再 encrypt（新 key ペアが生成される）
sed -i.bak '/^DOTENV_PUBLIC_KEY_PRODUCTION=/d' .env.production
dotenvx encrypt -f .env.production
NEW_PRIV=$(dotenvx get DOTENV_PRIVATE_KEY_PRODUCTION -f .env.keys)

# 4. CI secret を新 key に更新（merge より先）
gh secret set DOTENV_PRIVATE_KEY_PRODUCTION --body "$NEW_PRIV" --env production

# 5. 新暗号文を commit + merge + deploy
git add .env.production && git commit -m "chore: rotate production dotenv key"
git push && gh pr create --fill && gh pr merge --squash --auto

# 6. クリーンアップ
unset OLD_PRIV; set -o history
rm .env.production.bak
```

**漏洩時の追加対応**:
- git 履歴に残る旧暗号文は過去の旧 key で復号可能なまま。key ローテだけでは不十分
- 暗号化されていた値自体（DB password、API key 等）も **並行して再発行** 必須
- 履歴からの完全除去が必要なら `git filter-repo` を使うが、force push 影響が大きいので慎重に

**ダウンタイム回避**: 一時的に `DOTENV_PRIVATE_KEY_PRODUCTION` と `DOTENV_PRIVATE_KEY_PRODUCTION_NEW` を並行保持し、デプロイ成功後に旧を削除する blue-green 運用も可。

## GitHub Actions

curl でインストール。完全な例は `assets/gh_action_example.yaml` を参照。

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Install dotenvx
    run: curl -sfS https://dotenvx.sh | sh

  - name: Run tests
    env:
      DOTENV_PRIVATE_KEY: ${{ secrets.DOTENV_PRIVATE_KEY }}
    run: dotenvx run -- npm test
```

## 参考

- https://github.com/dotenvx/dotenvx
- https://dotenvx.com/docs
