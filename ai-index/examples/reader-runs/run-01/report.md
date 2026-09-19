# First read — 自分で作った AI 判定器に、自分で書いた偽物が満点を出した

run-01 / 10 passages / 2 readers + skim gate
**Disclosure: the reviewer wrote this draft**, so every reading step ran in fresh
subagents that never saw the full text. The reviewer's own read (§4) is
contaminated by authorship and is weighted below the mechanical evidence.

---

## 1. Sayback and meaning

**As received:** 通説を、著者が自分の道具ごと実測で壊して回る記事。指標は動いたのに
自作の偽物を見抜けなかった、という敗北から始まる。

Two readers received it the same way, and neither received it as "a method for
measuring AI-likeness." That gap is §3.

What landed, quoted from their logs:

- 「段落ごと削除しても文書から失われる事実がゼロ」 — K: 「自分が言語化できなかったやつの名前だ」
- 「消せるものは、消されたら見えなくなる」 — S: 「この一行で前のめりになった」
- 「人間は commit count を最後まで commit count と書き続ける」 — S: 「今月の十数本で一番持ち帰れる」
- 「あることは加点になるが、無いことは何の証拠にもならない」 — K: 「自分の lint に持ち帰れるルールとしてメモした」
- 「指標を作る記事で数字を間違えるのは、わりと格好がつかない」 — S: 「指標の記事で数字を間違えたと書く人は信用する」

The skim gate committed, which for this genre is the whole encounter for most
readers. It named the piece correctly and the element that decided it was
passage 2's own number: 「洗浄版が 0 件になった。中身を一行も足していないのに、
本物の記事 18 本のうち 5 本に勝って残り 13 本と同点」.

## 2. The reading

**K (sympathetic, follower) — finished 10/10, never quit.**
Needle: +1 +2 +1 +2 +1 +1 +2 +2 +2 +1.

Expectation set at p1 was broken benignly: 「タイトルが『自分の偽物に満点』なので、
いきなり破綻した話が来ると思った got=先に材料と実装の説明。焦れはしないけど順番は
逆かもと一瞬思った」. Trust was bought in the same breath by the up-front
disclosure, and a doubt was planted that the piece later paid off: 「英語の人間
サンプルが1本というのは目に留まった、そこ n=1 でいいのか」.

Two places where attention dropped, both explicit:

- **p3** 「CV の段落は数字の話が数字で続くので少し速く読んだ、正直ここは流した」
- **p6** 「質問設計の規則が 4〜5 連続で来て、ここで数字は飛ばし読みに入った。13/36 対 24/36 も 246ms 対 5227ms も、結論の一行だけ読んで数値は追ってない」

One snag at **p5**: 「Jev がここで急に土台として出てきたのが引っかかった。自分が
真似するときに Jev が必須なのか、structured output が返る API なら何でもいいのかが
分からなくて、そこで一瞬考えが逸れた」.

Peak at **p8**: 「表の『マーカー最適化した原稿』が段落の形では未編集 AI より遠い、
というのが今日一番刺さった数字」, and the counter-hypothesis check is what closed
it: 「元行番号を 252 組調べて 0 組、までやってるのでここは疑う気が起きない」.

**S (skeptic, trending-list skimmer, budget = first two lines) — finished
10/10, never quit.** Needle: +1 +2 +2 +2 0 −1 0 +1 +2 +1.

This is the review's strongest number: a reader whose patience budget was two
lines read all ten passages. The gate opened at p2 — 「これは『決定的な方法は
ない』を言うのではなく実際に壊して見せていて、今月読んだ十数本と質が違う。ここで
初めてタブを閉じる気が消えた」 — and the peak was p4: 「誤検出率 93% と、em ダッシュ
人間 0.0 対 AI 0.0。自分がこの手の記事で一番うんざりしていた与太話が、測った結果
として否定された。これが読みたかったやつ」.

The single attention trough is **p5→p6**, and S names the mechanism precisely:

> p5 (needle 0): 「ここまで反証は数字で殴ってきたのに、肝心の positive な主張の
> セルだけ言葉になっている。しかも判断層は Jev という著者自身の道具で、…『結論は
> 自作フレームワークを使え』に着地しつつあるのが見えてきた。急に宣伝の気配」

> p6 (needle −1): 「読みたかった検証が来ないまま自作ツールの使い方講座に入った。
> この記事の芯は『表層は洗浄で死ぬ』の実演だったので、その解毒剤が効くことは同じ
> 厳しさで見せてほしい」

S waited for one number across p5, p6 and p10, and recorded its absence as the
only complaint: 「expected=最後に判断層で洗浄版を見抜けた数字 got=『Jev の質問
セットはまだ閾値を校正していない』」.

S also raised, at p1, a methodological objection the draft never answers:
「日本語側も著者1人の18本なので、これは『人間の文章』じゃなく『mizchiの文章』の
分布でしょ、とツッコミたい気持ちが残っている」. The p9 disclosure answers the
English n=1 but not this.

**The two personas disagreed**, as the cast requires: p7 (the self-profile
section) was K's second-highest passage and S's flattest. K: 「飛ばし読みが止まって
普通に読み直した」. S: 「内容は著者固有の指紋で、著者を知らない自分には持ち帰る
ものがない。マーカーの比率は全部飛ばした」.

## 3. What survived

**Center of gravity — the finding of this review.** Both readers, independently,
located the live part of the piece somewhere other than its thesis.

- K: 「看板の『判定指標』より、失敗の記録のほうが生きていた」
- S: 「記事が掲げた『一本の軸』より、壊す側が生きていた」

The intended gist was the two-layer method and the situation/document axis. The
recalled gist is the debunking plus the author's record of being wrong. The axis
did survive as a phrase, but as one of several remembered lines rather than as
the piece's spine.

**What did not survive at all:** every number list. K: 「数字は多かったが値はほぼ
残っていない。質問設計の節は正直流した」. S: 「文長十分位・マーカー比率・ms の羅列は
全部飛ばした」. Neither could recall threshold values or the names of the three
dead signals.

**Endings survived, and correctly.** Both remembered the piece closing on unfinished
work. K noticed it matched the article's own measured closing move: 「9節で本人が
測っていた『未完の作業を指して終わる』形そのままなので筋は通っている」. K's one
request: 「持ち帰る基準が本文に散ったままで、最後に一覧が一箇所あると嬉しかった」.

**One action each, unprompted and concrete:**

- K: 「長い一文を、が/ので/のだが で限定節を中に抱えたまま出す。自分はその限定節を短文に割っていたので、今夜の下書きから割るのをやめる」
- S: 「em ダッシュと三連での判定をやめる。lint は件数ではなく位置を読む。マーカー比率より段落の形を見る。この3つは人に言う」

S would recommend it: 「勧める。今月の十数本と違い、folklore を実際に数えてどこが
壊れているかを出してきたから」.

**S's own verdict on the evidence split:**
> 取れていた: 表面シグナルは find-and-replace で消えること(7件→0件、CV 0.32→0.38)。
> 加えて対抗仮説を自分で潰した 252 組の検証。
> 取れていなかった: 「判断層なら差は残る」。第5節の表でそこだけ数字ではなく言葉で、
> 最後まで測定ではなく仮説のままだった。

## 4. The person behind it

The person these sentences imply is someone who would rather publish the number
that embarrasses them than the number that helps them. Both readers named this
without being asked, and it is what bought the read: the up-front synthetic-fixture
disclosure at p1, the miscount confession at p9, and three separate accounts of
the author's own tool misfiring.

**The seam** is at p5. Up to there the implied author is a person reporting
measurements, including against themselves. From p5 to p6 the voice shifts to
someone explaining how to use a tool they are connected to, and S read that shift
as sales: 「急に宣伝の気配」. The person returns at p7 and stays.

**Trust ledger.** `signals.py` is English-only and returns nothing usable on
Japanese — it reported `sentences: 1`, and zeros for first-person, hedging,
admissions and portable sentences because its patterns are English. Only its
language-agnostic counters hold: 97 numbers (15.5 per 100 tokens), 31 named
entities, 8 direct quotes. Recomputed for Japanese over 136 sentences / 6,687
characters:

| | | |
|---|---|---|
| costly | numbers | 55 sentences (40.4%) |
| costly | admissions against interest | 14 (10.3%) — signals.py reported 0 |
| costly | direct quotes 「」 | 20 (14.7%) |
| costly | first person 自分 | 13 (9.6%) |
| free | hedged | 7 (5.1%) |
| free | certainty | 1 (0.7%) |
| free | portable (fits any document) | **1 (0.7%)** |
| | epistemic commitment variance | 0.221 (0.0 = flat = machine) |

Costly signals dominate and portable sentences are effectively absent — one
sentence in 136. This is the mechanical counterpart of what both readers said
about trust, and it is the strongest part of the piece.

## 5. Questions

Neutral, no advice embedded:

1. 5 節の表を読んだ人に、その時点で何を感じていてほしかったですか。
2. この記事の読者は、Jev を持っている人ですか、持っていない人ですか。
3. 18 本が著者 1 人のものであることは、この記事の主張にとって制約ですか、それとも前提ですか。
4. 最後まで読んだ人に、明日何か 1 つ変えてほしいとしたら、それは何ですか。

## Opinions (by permission)

Anchored to the transcripts, decline freely:

1. 5 節の表の「判断層 = 残る」を実測値に替える。二人が 3 回待った数字はこれ一つ。**ただし Jev の API キーがないので、この場では測れない。**
2. Jev を前提にする前に、structured output が返る API で代替できるかを一行で言う。K と S が同じ場所で離れている。
3. 6 節の設計規則を 4〜5 連続で並べるのをやめる。二人とも数値を飛ばしていて、読まれていない。
4. コーパスが著者 1 人の 18 本であることを冒頭で認める。S の p1 の疑いに 9 節が答えていない。
5. 持ち帰る基準を最後に一箇所へ集める。K が明示的に欲しがった唯一のもの。
