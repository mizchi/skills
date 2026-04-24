---
name: dotenvx
description: Reference for the dotenvx environment variable management tool. Covers encryption, multi-environment support, and GitHub Actions usage examples.
---

# dotenvx Skill

dotenvx is an environment variable management tool that loads and encrypts .env files. Language- and framework-agnostic.

## Installation

```bash
# curl (recommended)
curl -sfS https://dotenvx.sh | sh

# brew
brew install dotenvx/brew/dotenvx

# npm
npm install @dotenvx/dotenvx --save
```

## Basic Commands

```bash
# Load environment variables and run a command
dotenvx run -- node index.js

# Specify a particular .env file
dotenvx run -f .env.production -- npm start

# Load multiple files (later ones take precedence)
dotenvx run -f .env -f .env.local -- npm start

# Get an environment variable
dotenvx get DATABASE_URL

# Display all environment variables
dotenvx get
```

## Encryption

```bash
# Encrypt .env (generates DOTENV_PUBLIC_KEY, DOTENV_PRIVATE_KEY)
dotenvx encrypt

# Encrypt a specific file
dotenvx encrypt -f .env.production

# Decrypt
dotenvx decrypt

# Run an encrypted file (requires DOTENV_PRIVATE_KEY)
dotenvx run -- node index.js
```

### How Encryption Works

- Running `dotenvx encrypt` generates a public/private key pair
- `DOTENV_PUBLIC_KEY`: stored inside the .env file (for encryption)
- `DOTENV_PRIVATE_KEY`: set in the local environment or CI (for decryption)
- Per-environment: auto-detected via `DOTENV_PRIVATE_KEY_PRODUCTION`

## Options

| Option | Description |
|-----------|------|
| `-f, --env-file` | Specify the .env file |
| `--overload` | Overwrite with subsequent files |
| `--quiet` | Suppress output |
| `--verbose` | Verbose output |
| `--debug` | Show debug information |

## Managing Multiple Environments

```
.env                 # Shared settings
.env.local           # Local overrides (gitignore)
.env.production      # Production
.env.development     # Development
```

```bash
# Run in production
dotenvx run -f .env.production -- npm start

# Development + local overrides
dotenvx run -f .env.development -f .env.local -- npm run dev
```

## Key Rotation

Procedure for when a private key is suspected of being leaked, or for periodic rotation. As of 2026/04 there is no dedicated `dotenvx rotate` command, so explicitly do decrypt → encrypt with a new key.

**Order is critical**: update the CI secret to the new key **first**, then merge the new ciphertext. If reversed, prod will fail trying to decrypt the new ciphertext with the old key.

```bash
# 1. Working branch + stash old key
git switch -c chore/rotate-prod-dotenv-key
set +o history
OLD_PRIV="$DOTENV_PRIVATE_KEY_PRODUCTION"

# 2. Decrypt with the old key (back to plaintext)
DOTENV_PRIVATE_KEY_PRODUCTION="$OLD_PRIV" dotenvx decrypt -f .env.production

# 3. Remove the existing PUBLIC_KEY, then re-encrypt (a new key pair is generated)
sed -i.bak '/^DOTENV_PUBLIC_KEY_PRODUCTION=/d' .env.production
dotenvx encrypt -f .env.production
NEW_PRIV=$(dotenvx get DOTENV_PRIVATE_KEY_PRODUCTION -f .env.keys)

# 4. Update CI secret to the new key (before the merge)
gh secret set DOTENV_PRIVATE_KEY_PRODUCTION --body "$NEW_PRIV" --env production

# 5. Commit + merge + deploy the new ciphertext
git add .env.production && git commit -m "chore: rotate production dotenv key"
git push && gh pr create --fill && gh pr merge --squash --auto

# 6. Cleanup
unset OLD_PRIV; set -o history
rm .env.production.bak
```

**Additional steps on a leak**:
- Old ciphertext remaining in git history can still be decrypted with the past old key. Key rotation alone is insufficient
- The encrypted values themselves (DB passwords, API keys, etc.) **must also be reissued in parallel**
- If full removal from history is required, use `git filter-repo`, but be careful due to the large impact of force push

**Avoiding downtime**: a blue-green approach that temporarily keeps both `DOTENV_PRIVATE_KEY_PRODUCTION` and `DOTENV_PRIVATE_KEY_PRODUCTION_NEW` in parallel and removes the old one after a successful deploy is also viable.

## GitHub Actions

Install via curl. See `assets/gh_action_example.yaml` for a complete example.

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

## References

- https://github.com/dotenvx/dotenvx
- https://dotenvx.com/docs
