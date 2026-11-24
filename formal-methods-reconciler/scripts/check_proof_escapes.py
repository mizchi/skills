#!/usr/bin/env python3
"""Fail when a proof or verification file takes a statement without proving it.

Usage: python3 check_proof_escapes.py [root]

Flags sorry / admit / axiom and their equivalents in Lean, Rocq (Coq), Isabelle,
Dafny, Verus, F* and Agda. Comments and string literals are ignored. A line can
opt out with `fm-escape: allow <reason>` (in a comment); an allow without a
reason is ignored. An unproved statement that is false makes every theorem that
depends on it provable, so each escape must be either removed or reviewed.

In Lean, also run `#print axioms <theorem>` for the theorems you report: it
lists every axiom (including sorryAx) a theorem depends on, across imports.
"""
import re
import sys
from pathlib import Path

ALLOW = re.compile(r"fm-escape:\s*allow\s+\S")
SKIP_DIRS = {".git", "node_modules", ".lake", "_build", "target", ".mooncakes"}

# extension -> (line comment tokens, block comment pairs, nested blocks, rules)
LANGS = {
    ".lean": (["--"], [("/-", "-/")], True, [
        (r"\bsorry\b", "sorry: unproved goal"),
        (r"\badmit\b", "admit: unproved goal"),
        (r"^\s*(@\[[^\]]*\]\s*)?((private|protected|noncomputable|unsafe)\s+)*axiom\b", "axiom: statement assumed without proof"),
    ]),
    ".v": ([], [("(*", "*)")], True, [
        (r"\bAdmitted\s*\.", "Admitted: proof abandoned but lemma kept"),
        (r"\badmit\b", "admit: unproved goal"),
        (r"^\s*(Local\s+|Global\s+)?(Axiom|Axioms|Parameter|Parameters|Conjecture)\b", "Axiom/Parameter: statement assumed without proof"),
    ]),
    ".thy": ([], [("(*", "*)")], False, [
        (r"\bsorry\b", "sorry: unproved goal"),
        (r"\boops\b", "oops: proof abandoned"),
        (r"\baxiomatization\b", "axiomatization: statements assumed without proof"),
    ]),
    ".dfy": (["//"], [("/*", "*/")], True, [
        (r"\bassume\b", "assume: condition taken without proof"),
        (r"\{:axiom\}", "{:axiom}: body-less lemma or function trusted"),
        (r"\{:verify\s+false\}", "{:verify false}: verification disabled"),
    ]),
    ".fst": (["//"], [("(*", "*)")], True, [
        (r"\badmit\b", "admit: unproved goal"),
        (r"\bassume\b", "assume: statement taken without proof"),
    ]),
    ".fsti": (["//"], [("(*", "*)")], True, [
        (r"\bassume\b", "assume: statement taken without proof"),
    ]),
    ".agda": (["--"], [("{-", "-}")], True, [
        (r"\bpostulate\b", "postulate: statement assumed without proof"),
    ]),
}
VERUS_RULES = [
    (r"\bassume\s*\(", "assume(...): condition taken without proof"),
    (r"\badmit\s*\(", "admit(): unproved goal"),
    (r"#\[verifier::external_body\]", "external_body: function body trusted, not verified"),
    (r"#\[verifier::external\]", "external: item not verified"),
]
VERUS_MARKER = re.compile(r"verus!|\bvstd\b|verifier::")


def blank(text, line_tokens, blocks, nested):
    """Replace comments and string literals with spaces, keeping newlines and columns."""
    out, i, n, depth, end_token = list(text), 0, len(text), 0, None
    in_string = False
    while i < n:
        if depth:
            if nested and any(text.startswith(o, i) for o, _ in blocks if _ == end_token):
                depth += 1
                for k in range(2):
                    out[i + k] = " "
                i += 2
                continue
            if text.startswith(end_token, i):
                depth -= 1
                for k in range(len(end_token)):
                    out[i + k] = " "
                i += len(end_token)
                continue
            if text[i] != "\n":
                out[i] = " "
            i += 1
            continue
        if in_string:
            if text[i] == "\\" and i + 1 < n:
                out[i] = out[i + 1] = " "
                i += 2
                continue
            if text[i] == '"':
                in_string = False
            if text[i] != "\n":
                out[i] = " "
            i += 1
            continue
        opened = next(((o, c) for o, c in blocks if text.startswith(o, i)), None)
        if opened:
            depth, end_token = 1, opened[1]
            for k in range(len(opened[0])):
                out[i + k] = " "
            i += len(opened[0])
            continue
        if any(text.startswith(t, i) for t in line_tokens):
            while i < n and text[i] != "\n":
                out[i] = " "
                i += 1
            continue
        if text[i] == '"':
            in_string = True
            out[i] = " "
        i += 1
    return "".join(out)


def scan(path, rules, line_tokens, blocks, nested):
    raw = path.read_text(errors="replace")
    code_lines = blank(raw, line_tokens, blocks, nested).splitlines()
    raw_lines = raw.splitlines()
    found = []
    for no, line in enumerate(code_lines, 1):
        if ALLOW.search(raw_lines[no - 1]):
            continue
        for pattern, message in rules:
            if re.search(pattern, line):
                found.append((no, message))
    return found


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    findings = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or SKIP_DIRS & set(path.relative_to(root).parts):
            continue
        ext = path.suffix
        if ext in LANGS:
            line_tokens, blocks, nested, rules = LANGS[ext]
            hits = scan(path, rules, line_tokens, blocks, nested)
        elif ext == ".rs" and VERUS_MARKER.search(path.read_text(errors="replace")):
            hits = scan(path, VERUS_RULES, ["//"], [("/*", "*/")], True)
        else:
            continue
        rel = path.relative_to(root).as_posix()
        findings.extend(f"{rel}:{no}: {message}" for no, message in hits)
    for finding in findings:
        print(finding)
    if findings:
        print(f"\n{len(findings)} proof escape(s). Remove each, or mark a reviewed one with `fm-escape: allow <reason>`.")
        return 1
    print("no proof escapes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
