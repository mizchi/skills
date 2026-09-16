# 言語別 kind カタログ

ast-grep の `kind` フィールドで指定する AST ノード名を言語別に列挙。Tree-sitter grammar に依存するため、不明なものは `ast-grep run --pattern '...' --lang <LANG> --debug-query=ast` で確認する。

## TypeScript / JavaScript

| kind | 対応するコード |
|------|---------------|
| `function_declaration` | `function foo() {}` |
| `arrow_function` | `() => {}` |
| `call_expression` | `foo()` |
| `member_expression` | `obj.prop` |
| `subscript_expression` | `obj['key']` |
| `variable_declarator` | `const x = 1` の `x = 1` 部分 |
| `lexical_declaration` | `const x = 1` 全体 |
| `as_expression` | `x as T`（TypeScript 型アサーション） |
| `type_alias_declaration` | `type Foo = ...` |
| `interface_declaration` | `interface Foo {}` |
| `import_statement` | `import ... from '...'` |
| `export_statement` | `export ...` |
| `try_statement` | `try { ... } catch { ... }` |
| `if_statement` | `if (...) { ... }` |
| `class_declaration` | `class Foo {}` |
| `method_definition` | クラス内メソッド |
| `pair` | `{ key: value }` の 1 ペア |
| `template_string` | `` `...` `` |
| `jsx_element` | `<Foo>...</Foo>` |
| `jsx_self_closing_element` | `<Foo />` |
| `await_expression` | `await x` |

## Rust

| kind | 対応するコード |
|------|---------------|
| `function_item` | `fn foo() {}` |
| `struct_item` | `struct Foo {}` |
| `enum_item` | `enum Foo {}` |
| `impl_item` | `impl Foo {}` |
| `trait_item` | `trait Foo {}` |
| `use_declaration` | `use std::io;` |
| `let_declaration` | `let x = 1;` |
| `const_item` | `const X: i32 = 1;` |
| `match_expression` | `match x { ... }` |
| `if_expression` | `if x { ... }` |
| `call_expression` | `foo()` |
| `field_expression` | `obj.field` |
| `macro_invocation` | `println!(...)` |
| `closure_expression` | `\|x\| x + 1` |
| `unsafe_block` | `unsafe { ... }` |
| `async_block` | `async { ... }` |
| `for_expression` | `for x in iter { ... }` |
| `mod_item` | `mod foo { ... }` |
| `attribute_item` | `#[derive(...)]` |
| `try_expression` | `expr?` |

## Go

| kind | 対応するコード |
|------|---------------|
| `function_declaration` | `func foo() {}` |
| `method_declaration` | `func (r Recv) foo() {}` |
| `type_declaration` | `type Foo struct {}` |
| `struct_type` | `struct { ... }` |
| `interface_type` | `interface { ... }` |
| `call_expression` | `foo()` |
| `selector_expression` | `obj.Method` |
| `short_var_declaration` | `x := 1` |
| `var_declaration` | `var x int` |
| `const_declaration` | `const x = 1` |
| `import_declaration` | `import "fmt"` |
| `if_statement` | `if x { ... }` |
| `for_statement` | `for i := 0; ... { ... }` |
| `return_statement` | `return x` |
| `defer_statement` | `defer f()` |
| `go_statement` | `go f()` |
| `channel_type` | `chan int` |
| `type_assertion_expression` | `x.(T)` |

## Python

| kind | 対応するコード |
|------|---------------|
| `function_definition` | `def foo():` |
| `class_definition` | `class Foo:` |
| `call` | `foo()` |
| `attribute` | `obj.attr` |
| `subscript` | `obj[key]` |
| `import_statement` | `import ...` |
| `import_from_statement` | `from ... import ...` |
| `if_statement` | `if ...:` |
| `try_statement` | `try: ...` |
| `with_statement` | `with ...:` |
| `decorator` | `@decorator` |
| `lambda` | `lambda x: x + 1` |
| `assignment` | `x = 1` |
| `comparison_operator` | `a < b` |
| `await` | `await x` |
| `list_comprehension` | `[x for x in xs]` |

## kind 名の調べ方

不明なものは debug-query で確認:

```bash
# AST 表示（名前付きノードのみ、ルール記述に使うのはこちら）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=ast

# CST 表示（全ノード、anonymous トークン含む）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=cst
```

## 言語別の注意点

- **TypeScript**: `as_expression` は型アサーション。`type_assertion` は `<T>x` 形式（旧構文）。プロジェクトの方針に応じて両方マッチさせる
- **Rust**: マクロ呼び出しは `macro_invocation` で kind マッチ、引数内部は `pattern` ではマッチしにくいので `regex` 併用が現実的
- **Go**: `_ = expr` のエラー無視は `short_var_declaration` 内の `identifier` (regex `^_$`) で検出
- **Python**: インデント依存なので fix で複数行を扱うとき要注意（YAML ブロックスカラー `|` 推奨）

## 参照

- 公式 Tree-sitter grammar: 各言語の `tree-sitter-<lang>` リポジトリ `grammar.js` の rule 名がそのまま kind 名
- ast-grep playground: https://ast-grep.github.io/playground.html （ブラウザで pattern を試して kind を確認）
