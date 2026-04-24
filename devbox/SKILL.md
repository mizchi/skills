---
name: devbox
description: devbox 開発環境管理ツールのリファレンス。Nix ベースの再現可能な開発環境、GitHub Actions での使用例を提供。
---

# devbox Skill

devbox は Nix ベースの開発環境管理ツール。プロジェクトごとに隔離された再現可能な環境を提供。

## インストール

```bash
curl -fsSL https://get.jetify.com/devbox | bash
```

## 基本コマンド

```bash
# プロジェクト初期化（devbox.json 作成）
devbox init

# パッケージ追加
devbox add nodejs@20
devbox add python@3.12 go@1.22

# パッケージ削除
devbox rm nodejs

# devbox シェルに入る
devbox shell

# コマンド実行（シェルに入らずに）
devbox run -- npm test

# スクリプト実行
devbox run test

# サービス起動（process-compose）
devbox services start

# パッケージ検索
devbox search nodejs
```

## devbox.json

```json
{
  "$schema": "https://raw.githubusercontent.com/jetify-com/devbox/main/.schema/devbox.schema.json",
  "packages": [
    "nodejs@20",
    "python@3.12"
  ],
  "shell": {
    "init_hook": [
      "echo 'Welcome to devbox!'",
      "export FOO=bar"
    ],
    "scripts": {
      "test": "npm test",
      "dev": "npm run dev",
      "build": "npm run build"
    }
  }
}
```

## パッケージ指定

```json
{
  "packages": [
    "nodejs@20",
    "python@3.12.0",
    "go@latest",
    "github:NixOS/nixpkgs#hello"
  ]
}
```

パッケージ検索: https://www.nixhub.io

## スクリプト

```json
{
  "shell": {
    "scripts": {
      "test": "npm test",
      "dev": "npm run dev",
      "lint": [
        "eslint .",
        "prettier --check ."
      ]
    }
  }
}
```

```bash
devbox run test
devbox run dev
```

## サービス（process-compose）

`process-compose.yaml` を作成:

```yaml
processes:
  web:
    command: npm run dev
  db:
    command: postgres -D /tmp/pgdata
```

```bash
devbox services start      # 全サービス起動
devbox services stop       # 全サービス停止
devbox services ls         # サービス一覧
```

## 環境変数

```json
{
  "env": {
    "DATABASE_URL": "postgresql://localhost:5432/dev",
    "NODE_ENV": "development"
  },
  "shell": {
    "init_hook": [
      "export API_KEY=$(<.api_key)"
    ]
  }
}
```

## GitHub Actions

`jetify-com/devbox-install-action` を使用。完全な例は `assets/gh_action_example.yaml` を参照。

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: jetify-com/devbox-install-action@v0.12.0
    # with:
    #   enable-cache: true  # Nix store キャッシュ

  - run: devbox run test
```

## よく使うオプション

| オプション | 説明 |
|-----------|------|
| `--config` | devbox.json のパス指定 |
| `--quiet` | 出力抑制 |
| `--print-env` | 環境変数を出力 |

## 参考

- https://github.com/jetify-com/devbox
- https://www.jetify.com/devbox/docs/
- https://www.nixhub.io
