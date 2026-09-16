#!/usr/bin/env bash
# scripts/doctor.sh — pre-flight environment check for @mizchi/vlmkit.
#
# Runs without depending on the vlmkit CLI itself; safe to invoke as the
# very first thing on a new machine before installing anything. Echoes
# PASS / WARN / FAIL per check, then a one-line verdict.
#
# Exit code:
#   0 — every REQUIRED check is PASS (WARN-only is OK)
#   1 — at least one REQUIRED check is FAIL
#
# Usage:
#   bash <(curl -sSL https://raw.githubusercontent.com/mizchi/skills/main/vlmkit/scripts/doctor.sh)
#   or after apm install:
#   bash ~/.claude/skills/vlmkit/scripts/doctor.sh

set -u

# ---- output helpers --------------------------------------------------------

if [ -t 1 ]; then
  G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; B=$'\033[1m'; X=$'\033[0m'
else
  G=""; Y=""; R=""; D=""; B=""; X=""
fi

PASS_CT=0
WARN_CT=0
FAIL_CT=0
FAIL_LINES=()

pass() { printf '  %s✓%s %-26s %s\n' "$G" "$X" "$1" "$2"; PASS_CT=$((PASS_CT+1)); }
warn() { printf '  %s•%s %-26s %s%s%s\n' "$Y" "$X" "$1" "$D" "$2" "$X"; WARN_CT=$((WARN_CT+1)); }
fail() { printf '  %s✗%s %-26s %s%s%s\n' "$R" "$X" "$1" "$D" "$2" "$X"; FAIL_CT=$((FAIL_CT+1)); FAIL_LINES+=("$1 — $2"); }

section() { printf '\n%s%s%s\n' "$B" "$1" "$X"; }

# ---- checks ----------------------------------------------------------------

section "Runtime"

if command -v node >/dev/null 2>&1; then
  ver=$(node --version | sed 's/^v//')
  major=${ver%%.*}
  if [ "$major" -ge 24 ]; then
    pass "Node ($ver)" "≥ 24 required"
  else
    fail "Node ($ver)" "vlmkit requires Node 24+; upgrade via nvm/fnm/volta"
  fi
else
  fail "Node" "not found on PATH"
fi

if command -v pnpm >/dev/null 2>&1; then
  pass "pnpm ($(pnpm --version))" "preferred package manager"
elif command -v npm >/dev/null 2>&1; then
  warn "pnpm" "not found; npm ($(npm --version)) will work too"
else
  fail "pnpm / npm" "no Node package manager found"
fi

# ---- vlmkit CLI --------------------------------------------------------------

section "vlmkit CLI"

if command -v vlmkit >/dev/null 2>&1; then
  ver=$(vlmkit --version 2>/dev/null | head -1)
  pass "vlmkit installed" "${ver:-(version not parseable)}"
else
  warn "vlmkit CLI" "not found on PATH — install with: pnpm add -g @mizchi/vlmkit"
fi

# ---- Playwright Chromium ---------------------------------------------------

section "Playwright Chromium"

# Playwright stores browsers under one of:
#   $PLAYWRIGHT_BROWSERS_PATH  (override)
#   ~/Library/Caches/ms-playwright/   (macOS default)
#   ~/.cache/ms-playwright/           (Linux default)
#   %USERPROFILE%\AppData\Local\ms-playwright\  (Windows — skipped here)
pw_dirs=()
[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && pw_dirs+=("$PLAYWRIGHT_BROWSERS_PATH")
pw_dirs+=("$HOME/Library/Caches/ms-playwright" "$HOME/.cache/ms-playwright")

found_chromium=0
for d in "${pw_dirs[@]}"; do
  if [ -d "$d" ] && ls -d "$d"/chromium-* >/dev/null 2>&1; then
    pass "Chromium installed" "$(ls -d "$d"/chromium-* 2>/dev/null | head -1 | xargs basename)"
    found_chromium=1
    break
  fi
done

if [ "$found_chromium" -eq 0 ]; then
  fail "Chromium" "not found — run: npx playwright install chromium"
fi

# ---- API keys (VLM features are optional) ----------------------------------

section "VLM provider credentials (optional)"

any_key=0
for kv in "OPENROUTER_API_KEY:OpenRouter (default provider)" "ANTHROPIC_API_KEY:Anthropic (claude: prefix)" "GEMINI_API_KEY:Google AI (gemini: prefix)"; do
  k=${kv%%:*}
  desc=${kv#*:}
  v=$(eval echo "\${$k:-}")
  if [ -n "$v" ]; then
    pass "$k" "$desc (${#v} chars)"
    any_key=1
  else
    warn "$k" "$desc — unset"
  fi
done

if [ "$any_key" -eq 0 ]; then
  warn "VLM features" "no provider key set; vlmkit diff/snapshot still work, but fix-loop / vlm-bench / migration subagent need at least one"
fi

# ---- APM + sub-skills (optional) ------------------------------------------

section "APM + sub-skills (optional)"

if command -v apm >/dev/null 2>&1; then
  pass "apm CLI" "$(apm --version 2>/dev/null | head -1)"
  found_sub=0
  for s in vrt-visual-diff vrt-migration-eval vrt-regression-watch vrt-markup-synth vrt-css-fix-loop; do
    for root in "$HOME/.claude/skills" "$PWD/.claude/skills"; do
      if [ -f "$root/$s/SKILL.md" ]; then
        pass "  $s" "$root/$s"
        found_sub=$((found_sub+1))
        break
      fi
    done
  done
  if [ "$found_sub" -eq 0 ]; then
    warn "sub-skills" "none of the 5 installed; run: apm install -g mizchi/vlmkit/.claude/skills/<name>"
  fi
else
  warn "apm CLI" "not found; sub-skills are optional anyway"
fi

# ---- verdict ---------------------------------------------------------------

section "Verdict"
printf '  PASS: %d   WARN: %d   FAIL: %d\n' "$PASS_CT" "$WARN_CT" "$FAIL_CT"

if [ "$FAIL_CT" -gt 0 ]; then
  printf '\n%s%sFailures (required):%s\n' "$R" "$B" "$X"
  for line in "${FAIL_LINES[@]}"; do
    printf '  • %s\n' "$line"
  done
  echo
  exit 1
fi

if [ "$WARN_CT" -gt 0 ]; then
  printf '\n%sReady for basic CLI use. Optional features may need attention above.%s\n\n' "$Y" "$X"
else
  printf '\n%sReady.%s\n\n' "$G" "$X"
fi
exit 0
