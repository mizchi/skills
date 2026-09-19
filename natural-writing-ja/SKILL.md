---
name: natural-writing-ja
description: Japanese prose norm for writing explanatory text that does not read as machine-generated. Built on one diagnostic axis (does a sentence update the situation or the document?) plus register purity, sentence-beat and 体言止め/反問 rules calibrated against 937 sentences of human technical writing. Use when drafting or revising Japanese articles, docs, or long-form explanations, especially after an LLM produced the draft. For English use natural-writing-en; for scoring a draft use ai-index.
---

# Natural Writing — Japanese

Writing Japanese explanatory prose that reads as written by someone, about
something they did.

The norm has one axis, and most of what makes machine prose recognisable falls
out of it. Everything else here is calibration: measured ranges from a corpus of
human technical writing, so the rules have numbers instead of taste.

Sources: the diagnostic axis and the beat/tension design are
[k16shikano's cognitive-rhythm-writing norm](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432).
The measured ranges are from 18 mizchi Zenn articles, 937 prose sentences
(`ai-index/references/calibration.md`).

## The axis

**Does this sentence update the situation, or update the document?**

| | what it reports | keep? |
| --- | --- | --- |
| 状況を更新する | an event, a number, a measurement, something someone said; or the writer's own judgement state — a belief held, a doubt, a concession, a regret | yes, including as deliberate slack |
| 文書を更新する | how this text looks, what it will cover, what was covered above, how to read it | delete |

Document-updating sentences carry no information about the subject. They are
what fluent-but-empty prose is made of, and they are the first thing to cut.

```
✗ 本章では A、B、C について解説します。
✗ ここまでは概念の説明でした。次は具体例を見ていきます。
✗ 要するに、この章の主題は X ではなく Y です。
✗ テクニックの列挙はしません。
✓ この三つの性質は、どれも冒頭の失敗の中にそろっている。
✓ まあ、今すぐ手を打つほどでもないのだけど、どこかの時点で整理は要るだろう。
✓ うまくいっているに違いない。   ← 思い込み。あとで事実に崩される布石
```

Two traps:

**Short and punchy is not a defence.** The commonest way document-updating
sentences survive a revision is being reshaped into a crisp declarative that
reads like a good closing line. `先に答えを半分だけ置く。` has rhythm and says
nothing. Apply the axis first; judge the rhythm only on sentences that passed.

**Do not narrate the device.** If a technique is working, the reader cannot see
it. Writing `最後にもう一度だけ線を引く` announces the operation instead of
performing it — and announcing is itself a document-updating sentence.

Four document-side forms are allowed, all at section boundaries only:

1. **反論処理** — quote the specific misreading you are rejecting. `ここまでの話を「〜せよ」という主張と読まれると、それは違う`. A vague `誤解しないでほしいのだが` with no named misreading is not this form.
2. **問いの設置と回収** — `この章では〜を考える` after a tension exists, and `その答えの半分がこれである`. Declaring what the text is *not* about is not setting a question.
3. **読者への依頼** — `どうか〜と割り切って読んでほしい`.
4. **例の枠の開閉** — `〜としよう` … `冒頭の例にオチを付けておこう`.

## Register: pick one, hold it

**18 of 18 human articles hold a single register at ≥80% purity; 14 are at 100%.**
14 were 敬体-dominant, 4 常体-dominant, none mixed.

This is the cleanest empirical rule in the corpus. Choose 敬体 (〜です / 〜ます)
or 常体 (〜だ / 〜である / plain) before the first sentence and do not drift.
Mixed register is the signature of a draft patched paragraph-by-paragraph, which
is what LLM-assisted revision produces if nobody is holding the line.

- 敬体 is the default for articles addressed to readers — it is 14/18 here.
- 常体 suits notes, cheatsheets, and manifesto-shaped pieces (`claude-code-cheatsheet` 96%, `claude-code-singularity-point` 100%).
- Mixing inside one article is the tell. Mixing between a quoted block and the
  surrounding prose is fine — the quote is not yours.

Check it: `python3 ../ai-index/scripts/slopscore.py --lang ja draft.md` reports
register purity directly.

## The beat

Measured over 937 human sentences:

| measure | human range | note |
| --- | --- | --- |
| mean sentence length | 24–56 chars (pooled mean 44.5) | not "short is better" |
| deciles | 16 / 23 / 29 / 35 / 41 / 47 / 54 / 63 / 79 | the spread is the point |
| short (≤15 chars) | 8% of sentences | footholds |
| long (≥70 chars) | 14% of sentences | the flow |
| burstiness CV | 0.36–0.66 | below ~0.35 reads mechanical |

The shape is **立てる → 流す → 止める**: a short sentence to plant a foothold, a
longer one to carry, a short one to stop. Alternate assertion with hesitation —
断定 (`〜だった`, `〜というわけだ`) against 逡巡 (`〜に違いない`, `〜だろうか`,
`〜とは思う。ただ…`). Hesitation is not weakness; `うまくいっているに違いない`
sets up a reversal two paragraphs later.

**Do not chase the beat by deleting.** Cutting the context a reader needs —
scope, the comparison axis, what is still unsettled — makes sentences shorter
and the text worse. Compress only what is already shared.

Paragraph density waves: after two or three dense paragraphs, one sparse one.
A sparse paragraph does exactly one job — fix a settled point in one line,
present the next thing to be judged, or change viewing distance.

## Two devices the AI drafts never reach for

Measured present in 15 of 18 human articles, and at zero in unedited model output:

**体言止め** — ending on a noun. Up to 8.8 per 10k characters.

```
講習会用にまとめたもの。
Terminal で Sixel を描画して Google を表示したもの。
どうしてもバグを直せないときに。
特異点があるとしたら、今はその瀬戸際。
```

**反問** — the reader's own objection, written out. Up to 20.2 per 10k.

```
こういうテスト通過率で大丈夫か？
正直、そんなエッジケースを考慮する必要あるか？
では、先に〜しておけばよかったのだろうか。
```

Use 反問 at section openings instead of `本節では〜を扱う`. Do not answer it
immediately — concede first (`そうしたかった、とは思う。`), then turn.

Important asymmetry: **presence is a positive signal, absence is not a fault.**
3 of 18 human articles have neither device. Add them where the material offers
them; do not sprinkle them to hit a quota.

## Subjectivity comes from 自分, not from hedged endings

The measured correction to a widely-held assumption. Rates per 10k characters:

| marker | rate | |
| --- | --- | --- |
| 自分 | **11.5** | the strongest single marker in the corpus |
| だろう / はず / かも | 6.5 | |
| だよね / でしょ / わけだ | 5.0 | |
| なんか / まあ / とりあえず | 3.7 | |
| と思う | 3.3 | |
| 自己責任 / 妥協 / 課題 / 微妙 | 3.3 | honest limits |
| めっちゃ / かなり / わりと | 1.6 | |
| シュッと / サクッと / ざっくり | 0.5 | rarer than its reputation |

And by sentence ending: **hedged endings are 3.3% of all sentences**
(`〜と思う` 1.2%, `〜だろう` 1.2%, `〜はず/かも` 1.0%). They are a seasoning, not
the register.

So: make the judging subject explicit (`自分は経験的に`, `自分の結論としては`),
then state the judgement plainly. Do not soften every sentence — `〜と思います`
on every claim reads as evasion, and it is not what the corpus does.

## Openings

**17 of 18 articles open with 1–2 prose sentences, not a bullet list.** Only one
uses a literal `TL;DR` heading; median opening is 49 characters.

The job of the opening is to leave one tension unresolved. The form is free:

```
Jev を一晩叩いたので、その感想を書きます。タイトルは超大雑把な要約です。
前々から自作ブラウザを作ってみたかったんですよね。作ります。
人生で5度目ぐらいの Markdown Editor 実装をしました。今回が最速です。
AI の技術記事は食傷気味なんですが、さすがにこれは効くと思ったパターンを見つけたので紹介します。
TypeScript はJS由来の言語仕様が根本的に不安定、Rust はアプリケーション層を書くのには低レベルすぎる、そんな不満はありませんか？
(この記事の AI 成分は 5 割ぐらいです)
```

What these have in common: an occasion. Something happened, and the article is
the report. Forecasts and summaries are not banned — `言い換えると〜という話で
ある` carries an attitude and creates tension on its own. What is banned is the
attitude-free agenda list: `本記事では A、B、C を扱います`.

Address the reader's resistance (this is old news / contrived / not relevant to
me) in the reader's own words, early, briefly, then start.

## Closing

Land the accumulated abstraction on something the reader already holds — the
opening scene, their own experience, the question from the first section. Do not
end on a general principle. Leave exactly one tension open; ceding the rest to
the reader (`足りない部分は読者が埋めてほしい`) works as an invitation.

`おわり` is a complete closing. `以上、本記事では〜について解説しました` is not.

## The AI-smell table

| pattern | machine | fix |
| --- | --- | --- |
| 冗長な丁寧 | 〜することができます | 〜できる |
| 空虚な当為 | 〜することが重要です / 大切です | who must do what, and why |
| 空虚な強調 | 素晴らしい / 画期的 / 革新的 / 多岐にわたる | delete, or replace with a number |
| 無意味な両論併記 | 〜という意見もあれば〜という見方もある | say which one you think |
| 出典なき一般論 | 一般的に〜とされています | name who said it, or own it: 自分は〜と思っている |
| 進行実況 | 前章では X について述べました。本章では… | delete |
| 一般論の締め | 重要なのはバランスです / 適切に使い分けましょう | 自分は経験的に〜 + the specific call |
| 定型の締め | 以上、〜について解説しました / 参考になれば | おわり |
| 英語直訳のコロン | 設定は以下のとおりです： | 設定はこれ。 |
| 対称的な見出し | every section as 概要 / メリット / デメリット / まとめ | let section length follow content |
| 過剰な箇条書き | everything as bullets | claims in prose; bullets only for real enumerations |
| 汎用例 | 例えば、ある会社では〜 | your own repo, commit, or measured number |

Corpus rates for these, for reference: `することができます` 0.78/10k,
`ます`-form redundancy aside, every other pattern in this table measured **0.00**
across all 18 human articles. `さらに、/また、/そして、` paragraph openers
measured 2.18/10k, which is low but nonzero — they are not forbidden, just rare.

## Post-draft checks

Mechanical, in order. The first is the one that matters.

1. **話題テスト** — collect every paragraph-opening sentence and every standalone
   short sentence. Situation or document? Document-side goes, unless it is one of
   the four allowed boundary forms. **Re-test anything you rewrote during
   revision** — reshaping a cut sentence into a crisp one is the main way slop
   gets back in.
2. **漏出テスト** — search the draft for this norm's own vocabulary (`緊張`,
   `回収`, `答えの半分`, `線を引く`, `拍`). A hit means you announced a device
   instead of performing it. Delete the sentence and do it with content. Then
   check every section ending for `次は〜` forecasts.
3. **緊張台帳** — list every question, assumption, and promise, and point at the
   line where each is answered. Cannot point? Write the answer or cut the question.
4. **拍の点検** — find runs of three or more long declaratives; insert a foothold,
   a stop, or a hesitation.
5. **境界の点検** — second-person address, requests, and self-deprecation belong
   at chapter boundaries, not in mid-argument.
6. **Run the lint** — `python3 ../ai-index/scripts/slopscore.py --lang ja draft.md`.
   Checks register purity, burstiness, and the table above. **A clean result
   means the surface is clean and nothing more** — the lint cannot see whether
   step 1 was done, and text that passes it while failing step 1 is the specific
   failure mode to avoid (`ai-index` §3 has a worked counterexample).

## Diagnosing flat prose

| symptom | cause | fix |
| --- | --- | --- |
| every paragraph the same, tiring | no beat | check 4 |
| correct but no pull to continue | no unresolved tension | add a tension in the opening; keep one open throughout via check 3 |
| temperature drops at the theory section | theory arrived before the discomfort it names | put a 反問 or confession first; land each enumerated item on a concrete scene |
| slack exists but reads limp | the slack is progress-narration | check 1; rewrite to the situation side — a hesitation, a suspended judgement, a wrong belief |
| chapter end preachy | closed on abstraction | land on something concrete the reader holds; leave one question open |
| opening reads clerical | attitude-free agenda list | give the forecast an attitude, or handle the reader's resistance first |
| register wobbles | patched paragraph-by-paragraph | pick 敬体 or 常体 and re-pass the whole draft |

## Evaluation of the source norm

The 状況/文書 axis is the strongest single idea surveyed for this skill, in any
language. It is one test, mechanically applicable, and it subsumes most of the
usual AI-smell checklists: progress narration, empty framing, symmetric
scaffolding, and hollow summaries are all document-updating sentences. Its
generation-side constraint (take beat material only from the subject, never
manufacture it) is what stops the norm from being a recipe for mannered prose.

Two things it does not give you, supplied above: it has no numbers — no measured
range for sentence length, register, or device frequency, so "vary the rhythm"
has no target — and it does not distinguish signals that separate human from
machine writing from signals that merely make prose better. Register purity is
the clearest case: 18/18 at ≥80% makes it a strong writing rule, and it detects
unedited AI not at all, since the machine is perfectly consistent.

## Related

- `ai-index` — scoring a draft; measured baselines; why the surface lint is not the score
- `natural-writing-en` — the English counterpart, with different signals and different thresholds
- `mizchi-blog-style` — voice-specific layer on top of this norm
