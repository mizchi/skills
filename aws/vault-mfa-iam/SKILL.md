---
name: aws-vault-mfa-iam
description: Use when AWS account の IAM API が MFA 必須 policy で弾かれて、 `sts:GetCallerIdentity` は通るのに `iam:*` が `InvalidClientTokenId` で拒否されるとき、 または FIDO2 passkey で MFA が CLI から使えないとき。 aws-vault / aws-cli / MFA / passkey 関連で「アクセス拒否」 「token expired」 「IAM 操作のみ失敗」 等の症状から起動 (user が aws-vault を名指しでなくても OK)。
---

# aws-vault に virtual MFA (TOTP) を設定する

## 症状

`aws-vault exec <profile> -- aws iam list-roles` が次のエラーで停止:

```
InvalidClientTokenId: The security token included in the request is invalid
```

しかし `aws sts get-caller-identity` は同じ session で通る。

## 原因

account にある IAM 権限境界 (boundary policy / SCP / inline policy) が「IAM API は MFA 認証された session でのみ許可」というルールを持っている。`aws-vault` のデフォルト session は `sts:GetSessionToken` を MFA なしで取得するため、IAM API だけ弾かれる。

## 解決手順

### 1. AWS Console で virtual MFA device を登録

`https://us-east-1.console.aws.amazon.com/iam/home#/users/details/<user>?section=security_credentials`

- 「**Multi-factor authentication (MFA)**」 → 「**Assign MFA device**」
- Device type: **Authenticator app** を選ぶ（passkey じゃない、CLI から使えない）
- 1Password / Authy / iOS Passwords / Google Authenticator で QR を読み取り
- **連続 2 個のコード**を入力（30 秒以上空けること、これしないと activate されない）

device の ARN は `arn:aws:iam::<ACCOUNT>:mfa/<device-name>`。

### 2. `~/.aws/config` の profile に `mfa_serial` を追加

```ini
[profile <profile>]
region = ap-northeast-1
mfa_serial = arn:aws:iam::<ACCOUNT>:mfa/<device-name>
```

### 3. session を一度 clear

```sh
aws-vault clear <profile>
```

### 4. exec で MFA code 入力

```sh
aws-vault exec <profile> -- aws iam list-roles
# Enter MFA code: <6桁>
```

## 罠

| 罠 | 対処 |
|---|---|
| `aws sts get-caller-identity` が通るので「権限はある」と勘違いする | IAM API も叩いて切り分け |
| FIDO2 passkey は AWS Console login 専用、CLI で使えない | virtual MFA を別途登録 |
| 登録途中で activate しないと「`invalid MFA one time pass code`」が永続 | 「再同期」で連続 2 コード入力 |
| `~/.aws/config` 更新後 cache 残りで古い session を返す | `aws-vault clear <profile>` |

## 関連

- IAM ユーザは MFA device を **8 個まで**登録可能 → passkey (Console 用) と virtual MFA (CLI 用) を併存できる
- 一度通れば session token が cache される (default 1h、`--duration=4h` で延長)
