---
name: void-app
description: "Build full-stack apps with Void (the void npm package from VoidZero) and Vite+, especially React Pages with Cloudflare D1. Use when scaffolding a Void app, writing typed loaders/actions/forms, generating database migrations, adding tests, or preparing a Void deployment. Includes pnpm build approvals, form reset behavior, and redirect-query pitfalls. Not for the Void editor or TypeScript's void type."
---

# Void でアプリを作るチートシート

**2026-10-18 確認: Void / @void/react 1.1.11、Vite+ 1.3.0、Node 24.21.0 以上、pnpm 12.14.0。** 以下は動作を確認した組み合わせ。別バージョンでは `engines`、CLI のヘルプ、peer dependencies、同梱ドキュメントを確認してから使う。英語の [SKILL.md](SKILL.md) を正本とする。

## 最初に読むもの

`void` パッケージには、そのバージョンの Markdown ドキュメントが同梱される。

| 目的 | `node_modules/void/docs/` 以下のパス |
| --- | --- |
| 導入 | `guide/quickstart.md` |
| CLI、型生成 | `reference/cli/setup.md` |
| ページ、動的ルート、loader | `guide/pages-routing/overview.md`、`guide/pages-routing/loaders.md` |
| フォーム、action、エラー | `guide/pages-routing/actions-and-forms.md` |
| 共通レイアウト、ページタイトル | `guide/pages-routing/layouts.md`、`guide/pages-routing/head.md` |
| DB、マイグレーション | `guide/database.md`、`guide/database/d1.md`、`reference/cli/database.md` |
| 型付き API クライアント | `guide/typed-fetch.md` |
| 公開 | `guide/deployment.md`、`reference/cli/deploy.md` |

CLI はプロジェクト内の `pnpm exec void` / `pnpm exec vp` を使う。`void` と `@void/react` のバージョンを揃え、既存の作業差分を保つ。

## 新規作成

空のディレクトリで実行する。

```sh
node --version
pnpm init
pnpm add -D void
pnpm exec void init
```

ウィザードは **Vite+ → React → D1 (SQLite)** を選ぶ。デプロイ先は Cloudflare、自分たちの Void Platform、設定をスキップ、から目的に合わせて選ぶ。公開の依頼がなければ設定をスキップできる。デプロイ先の設定と、実際の公開は別の操作。

`void init` がローカルの Vite+ をインストールするため、グローバルの `vp` は必須ではない。既存のパッケージマネージャーとロックファイルを維持する。

pnpm で依存パッケージのビルドが止まった場合、インストール自体は済んでいても終了コードが失敗になることがある。確認済みの pnpm では次で復旧できる。

```sh
pnpm approve-builds esbuild workerd --yes
# sharp が必要でブロックされている場合だけ、sharp も許可する。
pnpm exec void init
```

`pnpm-workspace.yaml` の `allowBuilds` では、Void が同梱バイナリを使う `better-sqlite3` は `false` のままにする。古い pnpm では設定やフラグが異なるので `pnpm approve-builds --help` を確認する。ビルド許可を全体で無効化しない。

```sh
pnpm exec void db migrate
pnpm exec vp dev
```

標準の開発 URL は `http://localhost:5173`。`void db seed` は seed ファイルがあり、ローカル DB を初期化してよい場合だけ使う。

## ファイル早見表

| ファイル | 役割 |
| --- | --- |
| `vite.config.ts` | Vite+、Void、React のプラグインと各種チェック |
| `void.config.ts` | デプロイ先、compatibility date、head の既定値 |
| `db/schema.ts` | Drizzle のテーブル定義。スキーマの正本 |
| `db/migrations/` | 生成してレビューする SQL とスナップショット |
| `db/seed.ts` | `defineSeed` で書くサンプルデータ |
| `pages/index.server.ts` | `/` の loader / action |
| `pages/index.tsx` | ページ UI。Props は型として import |
| `pages/notes/[id].server.ts` + `.tsx` | `/notes/:id` の動的ページ |
| `pages/layout.tsx` | 共通レイアウト、CSS の import |
| `routes/api/notes.ts` | `/api/notes`。`GET` などを export |
| `src/contracts/` | 入力バリデーターと共有型 |
| `src/lib/` | 検索などの純粋なロジック。UI の状態はコンポーネント側 |
| `.void/` | 自動生成型とローカル D1。Git 管理しない |

`void.config.ts`、マイグレーション、パッケージのロックファイル、生成された `void.lock.json` は Git 管理する。`node_modules/`、`dist/`、`.void/`、`.wrangler/`、`.void-wrangler.jsonc`、ローカルの秘密情報は除外する。

**型エラー対処で `.void/` を丸ごと消さない。ローカルの保存データも入っている。**

## スキーマ → 入力検証 → loader / action

```ts
// db/schema.ts
import { sql } from 'void/db';
import { integer, sqliteTable, text } from 'void/schema-d1';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

```ts
// src/contracts/note.ts
import { createInsertSchema } from 'void/drizzle-zod';
import { notes } from '../../db/schema';

export const createNoteSchema = createInsertSchema(notes, {
  body: (schema) => schema.trim().min(1).max(4000),
}).pick({ body: true });
```

```ts
// pages/index.server.ts
import { notes } from '@schema';
import { defineHandler, type InferProps } from 'void';
import { db, desc } from 'void/db';
import { createNoteSchema } from '../src/contracts/note';

export const loader = defineHandler(async () => ({
  notes: await db.select().from(notes).orderBy(desc(notes.id)),
}));
export type Props = InferProps<typeof loader>;

export const actions = {
  create: defineHandler.withValidator({ body: createNoteSchema })(async (_c, { body }) => {
    await db.insert(notes).values(body);
  }),
};
```

- `void/db` の import が D1 バインディングの推論につながる。`@schema` は Void が用意する alias。
- validator はテーブルから導出し、クライアントに書かせる項目だけ `pick` する。ID や作成日時を入力コントラクトに混ぜない。
- DB に default がある列は insert schema で省略可能になる場合がある。フォームで文字列を必須にするなら明示する。
- `zod` 自体を import する場合は、直接依存として `pnpm add zod` する。
- URL はサーバーでも HTTP(S)、長さ、資格情報の有無を検証する。`<input type="url">` だけに頼らない。

## フォームと遷移

```tsx
// pages/index.tsx
import { Form, useForm } from '@void/react';
import { useEffect } from 'react';
import type { Props } from './index.server';

export default function Home({ notes }: Props) {
  const form = useForm('/?create', { body: '' });
  useEffect(() => {
    if (form.wasSuccessful) form.setData('body', '');
  }, [form.wasSuccessful]);

  return <main>
    <ul>{notes.map((note) => <li key={note.id}>{note.body}</li>)}</ul>
    <Form form={form}>
      <label>メモ<input value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} /></label>
      {form.errors.body && <p>{form.errors.body}</p>}
      <button disabled={form.pending}>保存</button>
    </Form>
  </main>;
}
```

| API | 用途 |
| --- | --- |
| `loader` | GET で実行。戻り値がコンポーネントの Props |
| `action` | ページに 1 つの変更処理 |
| `actions` | `?create` / `?update` のような名前付き変更処理。単数形と混在させない |
| `Form` + `useForm` | 入力、送信中の状態、検証エラーを管理 |
| `action()` | ピン留めや削除など、フォーム状態が不要な変更処理 |
| `Link` | ページ全体を読み直さずに遷移 |

action が何も返さなければ loader を再実行して表示を更新する。`action()` の結果は `result.ok` を確認し、throw される失敗も扱う。

**`useForm` は成功すると送信値を新しい初期値にする。`reset()` では追加フォームは空にならない。** 成功時に `setData` で空にし、失敗時には入力を残す。

動的ルートのフォームは `useForm('/notes/:id?update', data, { params: { id } })`。ID は正の安全な整数か検証し、形式が不正・行が存在しない場合は 404 にする。

日本語 UI の `lang` と viewport は `void.config.ts` の `head` で設定する。ページタイトルは `.server.ts` の `defineHead<Props>` から返す。

### 削除後に `?delete` が残る場合

Void 1.1.11 では `c.redirect('/')` が元のクエリを引き継ぎ、削除後に `/?delete` が残った。クエリを残したくない場合は、同一オリジンの絶対 URL と 303 を返す。

```ts
// pages/notes/[id].server.ts の削除成功後
return c.redirect(new URL('/', c.req.url).href, 303);
```

E2E で最終 URL まで確認する。別バージョンでも回避策が必要かは、その実装と実際の遷移で確かめる。

## API ルートと型付き fetch

```ts
// routes/api/notes.ts
import { notes } from '@schema';
import { defineHandler } from 'void';
import { db, desc } from 'void/db';

export const GET = defineHandler(async () => ({
  notes: await db.select().from(notes).orderBy(desc(notes.id)),
}));
```

クライアントは `import { fetch } from 'void/client'` して `await fetch('/api/notes')` を呼ぶ。戻り値は JSON を解析したデータなので、ネイティブの `Response` と同じ扱いにしない。

パス、公開している HTTP メソッド、validator の入力型をルートから生成する。fresh clone 後は型チェック前に `pnpm exec void prepare` を実行する。

## DB コマンド早見表

以下はいずれも `pnpm exec` を前に付けて実行する。

| コマンド | 効果 |
| --- | --- |
| `void db generate` | スキーマ差分から SQL とスナップショットを生成。レビューして Git 管理 |
| `void db migrate` | 既存データを保ち、ローカルの未適用分を適用 |
| `void db seed` | **ローカル DB をリセット** → マイグレーション → seed |
| `void db reset` | **ローカル DB をリセット** → マイグレーション |
| `void db push` | マイグレーションを作らずローカルの試作にスキーマを反映 |
| `void db execute 'SELECT * FROM notes'` | ローカルデータを確認 |
| `void db status` | ローカル・リモートの適用状況。リモートは接続先と認証が必要 |

通常の変更は **schema を編集 → generate → SQL をレビュー → migrate → テスト → deploy**。すでに適用・共有したマイグレーション履歴は消さない。スターターの初期マイグレーションを作り直すのは、どこにも適用していない場合に限る。

D1 の開発用データは通常 `.void/`。`voidPlugin({ persistTo: 'local-state' })` で変更できるが、変更後に一度開発サーバーを起動して保存先を記録してから DB コマンドを使う。

## Vite+ の設定・テスト

`test` / `lint` / `fmt` の型を使うため `defineConfig` は **`vite-plus`** から import する。スターターが作る `vite` の alias / override は維持する。

純粋関数と validator の単体テストでは、test mode で Worker / React プラグインを外す。

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { voidReact } from '@void/react/plugin';

export default defineConfig(({ mode }) => ({
  plugins: mode === 'test' ? [] : [voidPlugin(), voidReact({ react: { compiler: true } })],
  test: { include: ['src/**/*.test.ts'] },
  lint: { options: { typeAware: true, typeCheck: true }, ignorePatterns: ['.void/**', 'dist/**'] },
  fmt: { ignorePatterns: ['.void/**', 'dist/**', 'db/migrations/meta/**'] },
}));
```

テスト API は `vite-plus/test` から import。この設定は Worker のバインディングを検証しないので、UI と実際の D1 の連携は起動した Void に Playwright でアクセスする。E2E を追加したら、そのレポートと実行結果も lint / 整形から除外する。

`tsconfig.json` では `.void/tsconfig.json` の継承と `void/env` を維持する。CSS の副作用 import には `vite/client`、Node API には `node` の型を追加する。

```sh
pnpm exec void prepare
pnpm exec vp check
pnpm exec vp test
pnpm exec playwright test
pnpm exec vp build
```

アプリの振る舞いは Red → Green → Refactor で実装する。E2E は開発用 DB と分離する。一時ディレクトリにアプリをコピーし、専用の `.void/` を使う方法で動作を確認した。追加、再読み込み後の永続化、検索、変更操作、入力失敗時の保持、404、PC とスマートフォンのはみ出しを確認する。

入力の locator は `getByRole('textbox', { name: /^メモ/ })` のようにロールを限定する。`getByLabel('メモ')` だけだと、その語を含む `aria-label` を付けたカードやリンクにも一致する。

React Compiler の peer dependencies が合わない場合は `pnpm peers check` と React プラグインの要求バージョンを確認する。今回の scaffold は `oxc-transform-react` 0.149.0 を指定したが、`@vitejs/plugin-react` 6.1.2 は `^0.152.0` を要求した。対応するバージョンへの更新で解決した。peer warning 全体を無視する設定にしない。

## Cloudflare への公開

デプロイが依頼の範囲に入っている場合に実行する。

```sh
pnpm exec void deploy --platform cloudflare
```

Void がビルド、import から推論したリソースの作成、未適用のマイグレーション、Worker の公開を扱う。次回以降は保存済みのデプロイ先を使える。`void.lock.json` は同じリソースを再利用するために残す。別アプリのアカウント ID や認証情報をコピーしない。

ローカルの seed データは本番へ自動コピーされない。認証なしの CRUD スターターを公開すると、アクセスできる利用者が同じデータを閲覧・変更する。非公開ノートなら Cloudflare Access やアプリの認証を設定する。

今回の実装で確認したのはローカルのテストと本番ビルドまで。デプロイ自体は未実行。ビルド成功と、公開先での動作確認を分けて報告する。

## 参照

- [Void Quickstart](https://void.cloud/guide/quickstart)、[Database](https://void.cloud/guide/database)、[Deployment](https://void.cloud/guide/deployment)
- [Vite+ guide](https://viteplus.dev/guide/)、[Announcing Vite+ Alpha](https://voidzero.dev/posts/announcing-vite-plus-alpha)
- [Void でフルスタックアプリを構築して Cloudflare にデプロイする](https://azukiazusa.dev/blog/void-vite-cloudflare-deploy/) — 実装のきっかけ。API は同梱ドキュメントを優先して確認する。
- バージョン固有の根拠: Void 1.1.11 の `guide/pages-routing/actions-and-forms.md` と `dist/runtime/routing.mjs`、今回のアプリの単体テスト・Playwright CRUD テスト・型/lint チェック・本番ビルド。
