#!/usr/bin/env python3
"""slopscore — mechanical (removable) AI-tell detector for Japanese and English prose.

This measures ONLY the surface layer: tells that a find-and-replace pass can
remove. It is a lint with a floor, not an AI index. A text scoring 0 here is
not human-sounding; it has merely had its fingerprints wiped. The judgment
layer (see ../references/jev-questions.md) is what actually discriminates.

Usage:
  slopscore.py FILE...                 # markdown or html; code blocks excluded
  slopscore.py --lang ja FILE
  slopscore.py --json FILE             # machine-readable
  slopscore.py --baseline FILE...      # print percentiles over a corpus
  cat draft.md | slopscore.py -

Exit code: 0 = below floor, 1 = at/above floor (usable as a CI gate).
"""
from __future__ import annotations

import argparse
import json
import re
import statistics as st
import sys
from html.parser import HTMLParser

# --------------------------------------------------------------------------
# extraction: prose only. code blocks, inline code and headings never count.
# --------------------------------------------------------------------------


class _Blocks(HTMLParser):
    SKIP = {"code", "pre", "script", "style", "nav", "svg", "head"}
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "td", "th"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self._cur: list[str] = []
        self._tag: str | None = None
        self.blocks: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.depth += 1
            if tag == "pre":
                self.blocks.append(("pre", ""))
            return
        if tag in self.BLOCK:
            self._flush()
            self._tag = tag

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.depth = max(0, self.depth - 1)
            return
        if tag in self.BLOCK:
            self._flush()

    def handle_data(self, data):
        if self.depth == 0:
            self._cur.append(data)

    def _flush(self):
        text = re.sub(r"\s+", " ", "".join(self._cur)).strip()
        if text and self._tag:
            self.blocks.append((self._tag, text))
        self._cur = []
        self._tag = None

    def close(self):
        super().close()
        self._flush()


def extract(raw: str) -> list[tuple[str, str]]:
    """Return [(kind, text)] where kind is p / li / h / pre."""
    if re.search(r"<(p|div|article|body|h[1-6])\b", raw, re.I):
        p = _Blocks()
        p.feed(raw)
        p.close()
        out = []
        for tag, text in p.blocks:
            if re.fullmatch(r"h[1-6]", tag):
                kind = "h"
            elif tag in ("td", "th"):
                kind = "table"  # reference material, not prose -- see the markdown branch
            else:
                kind = tag
            out.append((kind, text))
        return out

    # markdown
    raw = re.sub(r"^---\n.*?\n---\n", "", raw, count=1, flags=re.S)  # frontmatter
    out = []
    fence = None
    para: list[str] = []

    def flush():
        if para:
            out.append(("p", re.sub(r"\s+", " ", " ".join(para)).strip()))
            para.clear()

    for line in raw.split("\n"):
        f = re.match(r"^\s*(```+|~~~+)", line)
        if f:
            if fence is None:
                flush()
                fence = f.group(1)[0] * 3
                out.append(("pre", ""))
            elif line.strip().startswith(fence):
                fence = None
            continue
        if fence is not None:
            continue
        if not line.strip():
            flush()
            continue
        if re.match(r"^\s{0,3}#{1,6}\s", line):
            flush()
            out.append(("h", re.sub(r"^\s*#+\s*", "", line).strip()))
            continue
        if re.match(r"^\s*(?:[-*+]|\d+[.)])\s", line):
            flush()
            out.append(("li", re.sub(r"^\s*(?:[-*+]|\d+[.)])\s*", "", line).strip()))
            continue
        if re.match(r"^\s*\|", line):
            # Table rows are reference material, not prose. A style guide that
            # tabulates the patterns it warns against would otherwise flag
            # itself on every one of them.
            flush()
            out.append(("table", line.strip("| ").strip()))
            continue
        if re.match(r"^\s*>", line):
            flush()
            out.append(("li", line.strip("> ").strip()))
            continue
        para.append(line.strip())
    flush()
    return out


def strip_inline(t: str) -> str:
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"https?://\S+", " ", t)
    return t


# --------------------------------------------------------------------------
# signal tables
# --------------------------------------------------------------------------

EN = {
    "style_words": (
        r"\b(delv\w+|tapestry|underscor\w+|realm|landscape of|nuanced|multifaceted"
        r"|pivotal|seamless\w*|holistic|paradigm|synerg\w+|myriad|plethora|testament"
        r"|beacon|cornerstone|intricate|profound\w*|meticulous\w*|vibrant|bustling"
        r"|ever-(evolving|changing)|game-chang\w+|cutting-edge|unlock\w+ the|harness\w* the"
        r"|elevate|embark|treasure trove|deep dive)\b"
    ),
    "corporate_verbs": r"\b(utiliz\w+|facilitat\w+|leverag\w+|streamlin\w+|spearhead\w*|operationaliz\w+|actualiz\w+)\b",
    "empty_openers": (
        r"(In today'?s (fast-paced|digital|modern|ever-changing|competitive)"
        r"|In the (world|realm|era|age) of|As (technology|AI|the industry) continues to"
        r"|Gone are the days|It'?s no secret that|In an age where|Picture this)"
    ),
    "fake_authority": (
        r"\b(studies have shown|research (has )?shows?|experts? (say|agree|believe|note)"
        r"|it is (widely )?(known|believed|accepted)|many believe|industry leaders"
        r"|according to (some|many) )\b"
    ),
    "pseudo_wisdom": (
        r"(At the end of the day|When all is said and done|The key is (to )?(find|strike)"
        r"|there'?s no one-size-fits-all|It'?s important to (note|remember|understand|recognize)"
        r"|It'?s worth noting|the possibilities are endless|only time will tell)"
    ),
    "not_just_x": (
        r"(not (just|only|merely) [\w \-',]{2,40}?,?\s+but( also)? "
        r"|isn'?t (just|only) [\w \-',]{2,40}?,?\s+it'?s "
        r"|more than (just )?[\w \-']{2,30}?[;,—-]\s+it)"
    ),
    "hedge_preamble": (
        r"(It'?s (important|worth) (to note|noting)|Generally speaking|In many cases"
        r"|From a broader perspective|It should be noted|One could argue|Arguably,"
        r"|That (being )?said,|Ultimately,)"
    ),
    "transition_open": (
        r"^(Furthermore|Moreover|Additionally|Consequently|In addition|Nevertheless"
        r"|Nonetheless|Thus|Hence|Indeed|Notably|Importantly|In conclusion|Overall"
        r"|Firstly|Secondly|Lastly)\b"
    ),
}

JA = {
    # 冗長な丁寧表現 / 空虚な強調
    "ja_dekimasu": r"することができ(る|ます|ました)",
    "ja_juuyou": r"(することが(重要|大切|必要|求められ)|が重要です|が大切です|が不可欠)",
    "ja_kyocho": r"(素晴らし|画期的|革新的|飛躍的|シームレス|包括的|多岐にわたる|幅広い|さまざまな場面で|大きな注目を集め)",
    # 両論併記 / 一般論
    "ja_ryouron": r"(という意見もあ|という見方もあ|一概には言え|人によって異なり|賛否両論)",
    "ja_ippanron": r"(一般的に(は)?[^。]{0,14}(とされて|と言われて|と考えられて)|世間では)",
    "ja_tekisetsu": r"(適切に(使い分け|活用|選択|判断)|バランスが(重要|大切)|状況に応じて(判断|使い分け|選択))",
    # 文書について語る文(進行実況)
    "ja_shinkou": r"(本(記事|章|節|稿)では|前(章|節)では|次(章|節|項)では|ここまで(で|は)[^。]{0,16}(見て|述べ|説明し)|以下(のとおり|に示す)|まず(は)?[^。]{0,8}について(説明|解説)し)",
    "ja_shimekukuri": r"(いかがでしたでしょうか|いかがでしたか|以上、[^。]{0,20}(解説|紹介|説明)し|最後までお読み|参考になれば)",
    # 英語直訳ぐせ
    "ja_colon_end": r"[：:]\s*$",
    "ja_setsuzoku_open": r"^(さらに、|また、|そして、|加えて、|一方で、|したがって、|そのため、|このように、|つまり、|なお、)",
}

# ordered: name, label, threshold-per-unit, unit-size-in-words-or-chars, human-band note
EN_RULES = [
    ("style_words", "rare style words", 3.0, 500, "post-2022 academic use rose 9-25x"),
    ("corporate_verbs", "corporate verb inflation", 1.0, 300, "judge against register"),
    ("empty_openers", "empty-opener cliches", 2.0, 500, "one is a yellow flag"),
    ("fake_authority", "uncited authority", 1.0, 500, "each needs a name/number/link"),
    ("pseudo_wisdom", "pseudo-wisdom filler", 2.0, 500, "survives the deletion test"),
    ("not_just_x", "not-just-X-but-Y", 3.0, 0, "absolute count per article"),
    ("hedge_preamble", "hedge preambles", 2.0, 500, "a human cuts these in pass 2"),
]

JA_RULES = [
    ("ja_dekimasu", "冗長な丁寧表現 (することができます)", 2.0, 10000, "「できる」で足りる"),
    ("ja_juuyou", "空虚な規範 (〜することが重要です)", 1.0, 10000, "主語のない当為"),
    ("ja_kyocho", "空虚な強調語", 3.0, 10000, "具体性で置換する"),
    ("ja_ryouron", "無意味な両論併記", 1.0, 10000, "自分の立場を出す"),
    ("ja_ippanron", "出典なき一般論", 1.0, 10000, "誰が言ったのかを書く"),
    ("ja_tekisetsu", "「適切に」「バランスが重要」", 1.0, 10000, "判断を読者に丸投げしている"),
    ("ja_shinkou", "進行実況 (本章では / ここまでで)", 2.0, 10000, "文書を更新する文"),
    ("ja_shimekukuri", "定型の締め", 1.0, 10000, "「おわり」で足りる"),
]


# --------------------------------------------------------------------------
# measurement
# --------------------------------------------------------------------------

JA_CHARS = re.compile(r"[぀-ゟ゠-ヿ一-鿿]")

KEITAI = re.compile(r"(ます|ました|ません|ませんでした|です|でした|ですね|でしょう|ください)[。！？]$")
JOUTAI = re.compile(
    r"(である|のだ|わけだ|んだ|した|する|れる|られる|ている|ない|なかった|だろう|と思う|らしい|ようだ)[。！？]$"
)


def ja_sentences(paras: list[str]) -> list[str]:
    out = []
    for p in paras:
        for s in re.split(r"(?<=[。！？])", p):
            s = s.strip()
            if s.endswith(("。", "！", "？")) and len(s) > 2:
                out.append(s)
    return out


def en_sentences(paras: list[str]) -> list[str]:
    out = []
    for p in paras:
        for s in re.split(r'(?<=[.!?])\s+(?=[A-Z"“(\d])', p):
            s = s.strip()
            if len(re.findall(r"[A-Za-z]+", s)) >= 1:
                out.append(s)
    return out


def mattr(tokens: list[str], window: int = 100) -> float | None:
    """Moving-average type-token ratio. Length-independent, unlike plain TTR."""
    if len(tokens) < window:
        return None
    low = [t.lower() for t in tokens]
    vals = [len(set(low[i : i + window])) / window for i in range(0, len(low) - window + 1, 5)]
    return st.mean(vals)


def analyse(raw: str, lang: str = "auto") -> dict:
    blocks = extract(raw)
    paras = [strip_inline(t) for k, t in blocks if k == "p"]
    lis = [strip_inline(t) for k, t in blocks if k == "li"]
    heads = [t for k, t in blocks if k == "h"]
    codeblocks = sum(1 for k, _ in blocks if k == "pre")
    tables = sum(1 for k, _ in blocks if k == "table")
    prose = " ".join(paras)
    # Lexical signals scan prose + bullets. Table cells are excluded: they are
    # lookup entries rather than writing, and including them makes any document
    # that tabulates the patterns fail on its own examples.
    body = "\n".join(paras + lis)

    if lang == "auto":
        lang = "ja" if len(JA_CHARS.findall(prose)) > 0.2 * max(len(prose), 1) else "en"

    r: dict = {
        "lang": lang,
        "paragraphs": len(paras),
        "list_items": len(lis),
        "headings": len(heads),
        "code_blocks": codeblocks,
        "table_rows_excluded": tables,
        "signals": [],
        "notes": [],
    }

    if lang == "ja":
        sents = ja_sentences(paras)
        lens = [len(s) for s in sents]
        unit_total = len(prose)
        table, tbl = JA, JA_RULES
    else:
        sents = en_sentences(paras)
        lens = [len(re.findall(r"[A-Za-z'\-]+", s)) for s in sents]
        lens = [x for x in lens if x > 0]
        unit_total = len(re.findall(r"[A-Za-z][A-Za-z'\-]*", prose))
        table, tbl = EN, EN_RULES

    r["prose_units"] = unit_total
    r["sentences"] = len(sents)
    if not sents or unit_total == 0:
        r["notes"].append("too little prose to measure")
        return r

    # --- removable tells ---
    tells = 0
    for key, label, thr, unit, note in tbl:
        hits = [m.group(0) for m in re.finditer(table[key], body, re.I | re.M)]
        n = len(hits)
        if unit:
            rate = n * unit / unit_total
            over = rate > thr
            meas = f"{rate:.2f}/{unit}"
            thr_s = f"<{thr:g}/{unit}"
        else:
            rate = n
            over = n >= thr
            meas = f"{n} total"
            thr_s = f"<{thr:g}"
        if over:
            tells += 1
        r["signals"].append(
            {
                "id": key,
                "label": label,
                "hits": n,
                "measured": meas,
                "threshold": thr_s,
                "over": over,
                "note": note,
                "samples": sorted({h.strip() for h in hits if h.strip()})[:3],
            }
        )

    # --- burstiness (structural, not removable by find-and-replace) ---
    mean = st.mean(lens)
    cv = st.pstdev(lens) / mean if mean else 0.0
    r["sentence_mean"] = round(mean, 1)
    r["burstiness_cv"] = round(cv, 3)
    r["short_pct"] = round(100 * sum(1 for x in lens if x <= (15 if lang == "ja" else 8)) / len(lens))
    r["long_pct"] = round(100 * sum(1 for x in lens if x >= (70 if lang == "ja" else 35)) / len(lens))
    # Floors are calibrated to a measured human floor, not to a published band.
    #   en: human 0.55-0.62, unedited AI 0.245  -> wide gap, usable as a tell
    #   ja: human 0.36-0.66, unedited AI 0.32   -> gap is only +0.04, ADVISORY ONLY
    # See references/calibration.md. Per the gap-first rule, a narrow gap means the
    # signal is wrong, not that the threshold needs tuning -- so ja CV never counts
    # as a tell; it is reported so a human can look, and nothing more.
    floor = 0.35 if lang == "ja" else 0.40
    r["burstiness_ok"] = cv >= floor
    r["burstiness_advisory"] = lang == "ja"
    if not r["burstiness_ok"]:
        if lang == "ja":
            r["notes"].append(
                f"CV {cv:.2f} < {floor} (advisory: ja burstiness overlaps between human and AI, "
                "margin +0.04 -- look, but do not conclude)"
            )
        else:
            tells += 1
            r["notes"].append(
                f"CV {cv:.2f} < {floor} — sentence lengths too uniform; vary the rhythm, do not just delete words"
            )

    # --- lexical diversity ---
    toks = (
        re.findall(r"[A-Za-z][A-Za-z'\-]*", prose)
        if lang == "en"
        else re.findall(r"[一-鿿]+|[゠-ヿ]+|[A-Za-z]+", prose)
    )
    m = mattr(toks)
    r["mattr100"] = round(m, 3) if m is not None else None

    # --- paragraph-opening connectors ---
    if lang == "ja":
        opens = sum(1 for p in paras if re.match(JA["ja_setsuzoku_open"], p))
    else:
        opens = sum(1 for p in paras if re.match(EN["transition_open"], p))
    r["connector_opens_pct"] = round(100 * opens / len(paras)) if paras else 0
    if r["connector_opens_pct"] > 50:
        tells += 1
        r["notes"].append(f"{r['connector_opens_pct']}% of paragraphs open with a formal connector (>50%)")

    # --- em-dash (en) / register purity (ja) ---
    if lang == "en":
        em = len(re.findall(r"—|(?<!-)--(?!-)", prose))
        rate = 1000 * em / unit_total
        r["em_dash_per_1000w"] = round(rate, 1)
        if rate > 20:
            tells += 1
            r["notes"].append(f"em-dash {rate:.1f}/1000w > 20 (human prose 3.7-10)")
    else:
        k = sum(1 for s in sents if KEITAI.search(s))
        j = sum(1 for s in sents if not KEITAI.search(s) and JOUTAI.search(s))
        cls = k + j
        if cls >= 10:
            purity = 100 * max(k, j) / cls
            r["register"] = "敬体" if k >= j else "常体"
            r["register_purity_pct"] = round(purity)
            if purity < 80:
                tells += 1
                r["notes"].append(
                    f"register mixed: 敬体 {100*k/cls:.0f}% / 常体 {100*j/cls:.0f}% "
                    "— pick one and hold it (18/18 mizchi articles are >=80% pure)"
                )
        # 体言止め / 反問 — presence is a positive human signal, absence is not a tell
        r["taigendome"] = sum(
            1 for s in sents if re.search(r"(もの|こと|とき|ところ|わけ|はず|感じ|ため|点|の)。$", s)
        )
        r["rhetorical_q"] = sum(1 for s in sents if s.endswith(("？", "か。")))

    r["removable_tells"] = tells
    r["floor_exceeded"] = tells >= 3
    return r


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------


def fmt(name: str, r: dict) -> str:
    L: list[str] = []
    W = 78
    L.append("=" * W)
    L.append(f"{name}  [{r['lang']}]")
    L.append("=" * W)
    if r.get("sentences", 0) == 0:
        L.append("  (no measurable prose)")
        return "\n".join(L)
    unit = "chars" if r["lang"] == "ja" else "words"
    L.append(
        f"  {r['prose_units']} prose {unit} / {r['sentences']} sentences / "
        f"{r['paragraphs']} paras / {r['list_items']} list items / {r['code_blocks']} code blocks"
    )
    L.append("")
    L.append(f"  {'removable tell':38s}{'measured':>12}  {'budget':>11}")
    L.append("  " + "-" * (W - 4))
    for s in r["signals"]:
        mark = "OVER" if s["over"] else "ok"
        L.append(f"  {s['label'][:38]:38s}{s['measured']:>12}  {s['threshold']:>11}  {mark}")
        if s["over"] and s["samples"]:
            L.append(f"      e.g. {', '.join(x.strip() for x in s['samples'] if x.strip())[:64]}")
    L.append("")
    L.append("  structural (NOT removable by find-and-replace)")
    L.append("  " + "-" * (W - 4))
    cv_label = "burstiness CV" + (" (advisory)" if r.get("burstiness_advisory") else "")
    cv_mark = "ok" if r["burstiness_ok"] else ("low" if r.get("burstiness_advisory") else "OVER")
    L.append(
        f"  {cv_label:38s}{r['burstiness_cv']:>12}  "
        f"{'>=0.35' if r['lang']=='ja' else '>=0.40':>11}  {cv_mark}"
    )
    L.append(f"  {'mean sentence length':38s}{r['sentence_mean']:>12}  {unit:>11}")
    L.append(f"  {'short / long sentence mix':38s}{str(r['short_pct'])+'% / '+str(r['long_pct'])+'%':>12}")
    if r.get("mattr100") is not None:
        L.append(f"  {'MATTR(100) lexical diversity':38s}{r['mattr100']:>12}")
    L.append(f"  {'paras opening with a connector':38s}{str(r['connector_opens_pct'])+'%':>12}  {'<=50%':>11}")
    if r["lang"] == "en":
        if "em_dash_per_1000w" in r:
            L.append(f"  {'em-dash per 1000 words':38s}{r['em_dash_per_1000w']:>12}  {'<=20':>11}")
    else:
        if "register_purity_pct" in r:
            L.append(
                f"  {'register purity ('+r['register']+')':38s}"
                f"{str(r['register_purity_pct'])+'%':>12}  {'>=80%':>11}"
            )
        L.append(f"  {'体言止め / 反問 (human devices)':38s}{str(r['taigendome'])+' / '+str(r['rhetorical_q']):>12}")
    L.append("")
    L.append(f"  REMOVABLE TELLS OVER BUDGET: {r['removable_tells']}   (floor = 3)")
    for n in r["notes"]:
        L.append(f"    ! {n}")
    L.append("")
    L.append("  Reminder: 0 tells means the fingerprints are wiped, not that the text")
    L.append("  has something to say. Run the judgment layer before believing a pass.")
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="markdown/html files, or - for stdin")
    ap.add_argument("--lang", choices=["ja", "en", "auto"], default="auto")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--baseline", action="store_true", help="percentiles across the given files")
    a = ap.parse_args()

    results = []
    for f in a.files:
        raw = sys.stdin.read() if f == "-" else open(f, encoding="utf-8", errors="replace").read()
        r = analyse(raw, a.lang)
        r["file"] = f
        results.append(r)

    if a.json:
        print(json.dumps(results if len(results) > 1 else results[0], ensure_ascii=False, indent=2))
    elif a.baseline:
        ok = [r for r in results if r.get("sentences")]
        # Show enough of the path to stay unambiguous -- a corpus of SKILL.md or
        # index.html files is otherwise a column of identical rows.
        names = {r["file"] for r in ok}
        use_base = len({n.split("/")[-1] for n in names}) == len(names)
        print(f"{'file':44s}{'CV':>7}{'tells':>7}{'MATTR':>8}{'reg%':>7}")
        for r in sorted(ok, key=lambda x: x["burstiness_cv"]):
            reg = r.get("register_purity_pct", "")
            label = r["file"].split("/")[-1] if use_base else r["file"]
            print(
                f"{label[-44:]:44s}{r['burstiness_cv']:7.2f}"
                f"{r['removable_tells']:7d}{(r.get('mattr100') or 0):8.3f}{str(reg):>7}"
            )
        cvs = [r["burstiness_cv"] for r in ok]
        tl = [r["removable_tells"] for r in ok]
        print(f"\nn={len(ok)}  CV: min {min(cvs):.2f} p50 {st.median(cvs):.2f} max {max(cvs):.2f}")
        print(f"          tells: min {min(tl)} p50 {st.median(tl):.0f} max {max(tl)}")
    else:
        for r in results:
            print(fmt(r["file"], r))
            print()

    return 1 if any(r.get("floor_exceeded") for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
