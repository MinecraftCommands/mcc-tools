# Prior art for anchoring annotations in content we do not control

Research for [#36](https://github.com/MinecraftCommands/mcc-tools/issues/36), feeding the anchor
model / re-anchoring decision on the wayfinder map ([#27](https://github.com/MinecraftCommands/mcc-tools/issues/27)).

Everything below is sourced from specs, source code, or published papers. Where the primary source
could not be reached, that is stated. Section 7 is original measurement against Mojang's actual
corpus (403 articles), performed for this ticket.

**Where this file lives.** The repo had no existing convention for research notes — `docs/agents/`
holds agent-skill configuration, not findings. This is filed under `docs/research/`.

---

## 1. Recommendation up front

### Selector set to store per annotation

| Field | Purpose | Survives |
|---|---|---|
| `quote: { exact, prefix, suffix }` | **The anchor.** Source of truth. 32 chars of context each side. | Content edits elsewhere, all structural change, all `processorVersion` change (if `textVersion` is pinned — §9) |
| `sectionPath: number[]` + `headingText: string[]` | Scope narrowing + disambiguation. Ordered index path into the section tree, *plus* verbatim heading text at each level. **Not** the kebab id. | Heading rewording (via text), heading insertion/removal (via alignment) |
| `position: { start, end }` | Fast path + proximity hint. Code-point offsets into normalised plain text. | Nothing on its own — always verified against `exact` |
| `textVersion: number` | Which plain-text normalisation produced `position` | — |
| `processorVersion: number` | Which render pipeline the annotation was authored against | — |
| `revisionId` | The article revision written against; permalink backstop | — |

Deliberately **not** stored: a CSS/XPath path into the rendered DOM, and the heading-derived
kebab `id`. Reasons in §8 and §9; both are empirically broken for this corpus.

### Fallback ladder

Run top to bottom, first success wins. Every rung except the last **must** verify its result
against `quote.exact` before accepting it — this is the single most important structural detail,
and the one the map's current wording does not capture (§10.1).

0. **Identity.** `revisionId` and `textVersion` both unchanged → use `position` directly. Verify
   against `exact`; on mismatch fall through (it means a bug, not an edit).
1. **Position fast path.** Slice `[start, end)` out of the new normalised text. If it equals
   `exact`, done. O(1), and will resolve the overwhelming majority of anchors even across edits,
   because edits are small and most annotations sit before the edit point.
2. **Section-scoped fuzzy quote.** Align the old and new heading sequences (order-preserving
   alignment, §8), resolve `sectionPath` to a section in the new tree, then run a bounded
   edit-distance quote match *within that section's text span only*, with `position.start` as a
   weak proximity prior. Accept above the auto-anchor confidence band.
3. **Document-wide fuzzy quote.** Same matcher, whole-article text, same prior. Accept above the
   auto-anchor band.
4. **Low-confidence band.** A best candidate that scores between the orphan and auto-anchor
   thresholds is *not* silently anchored. Treat as orphaned, but keep the candidate as a "best
   guess" the reader can jump to. This is Brush & Bargeron's guess/complete-orphan split (§6) and
   is directly supported by their user study.
5. **Orphan.** Margin, quoted text visible, permalink to `revisionId`.

### Matcher

**Do not use `diff-match-patch`'s `match_main`.** It throws on patterns longer than 32 characters
(§5.2) and our median quote candidate is 48 characters, p90 is 100 (§7.4). Use a bit-parallel
Myers approximate matcher with no word-size limit — [`approx-string-match`](https://github.com/robertknight/approx-string-match-js),
which is what Hypothesis themselves moved to.

Tune it **tighter than Hypothesis does.** Their budget is `maxErrors = Math.min(256, quote.length / 2)` —
50% edit distance. Our corpus is far more internally repetitive than general web prose (9.19% of
quote candidates are non-unique *within their own article*, §7.3), so a 50% budget invites
confident mis-anchoring. Start at ~25% and calibrate.

---

## 2. What the shape of the problem is

Three axes, and the prior art separates cleanly along them:

- **Structural anchors** (XPath, CSS, DOM paths) — cheap, exact, and the first thing everyone
  builds. Also the first thing everyone abandons.
- **Positional anchors** (character offsets) — cheap, and the spec itself calls them "very
  brittle".
- **Textual anchors** (the quoted text plus context) — expensive, fuzzy, and the only thing that
  actually survives.

The universal conclusion across the W3C spec, Hypothesis's implementation, and two decades of
academic work: **store all three, but let only the text decide.**

---

## 3. W3C Web Annotation Data Model

[Recommendation, 23 February 2017](https://www.w3.org/TR/annotation-model/). The Working Group has
since closed; there is **no successor spec**. The "Selectors and States"
[WG Note](https://www.w3.org/TR/2017/NOTE-selectors-states-20170223/) explicitly disclaims
novelty ("This document does not define any new approach to selection"). All 16 entries in the
[errata register](https://www.w3.org/annotation/errata/) are typos, links and JSON-LD nits — none
change selector semantics.

### Selector types ([§4.2](https://www.w3.org/TR/annotation-model/#selectors))

| Selector | JSON-LD fields | Identifies |
|---|---|---|
| `FragmentSelector` | `value`, `conformsTo` | Segment named by an IRI fragment |
| `CssSelector` | `value` | DOM segment via a CSS selector |
| `XPathSelector` | `value` | DOM segment via XPath |
| `TextQuoteSelector` | `exact`, `prefix`, `suffix` | Text by copying it plus surrounding context |
| `TextPositionSelector` | `start`, `end` | Text by start/end offsets |
| `DataPositionSelector` | `start`, `end` | Byte offsets |
| `SvgSelector` | `value` (well-formed SVG XML) | An area |
| `RangeSelector` | `startSelector`, `endSelector` | Boundaries expressed as nested selectors |

`start`/`end` are 0-based `xsd:nonNegativeInteger` ([vocab](https://www.w3.org/TR/annotation-vocab/)).
`RangeSelector` is half-open: "everything from the beginning of the starting selector through to
the beginning of the ending selector, but not including it."

### TextQuoteSelector — what the spec does and does not say

Purpose: "describes a range of text by copying it, and including some of the text immediately
before (a prefix) and after (a suffix) it to distinguish between multiple copies of the same
sequence of characters."

Cardinality: exactly 1 `exact`; `prefix` and `suffix` SHOULD each appear exactly once and MUST NOT
appear more than once — so **context is recommended but optional**.

**Prefix/suffix length is entirely unspecified.** There is no "32 characters" in the spec; that
number is Hypothesis's choice (§4).

Normalisation is normative but uneven: "The text MUST be normalized before recording in the
Annotation. Thus HTML/XML tags SHOULD be removed, and character entities SHOULD be replaced with
the character that they encode." Note the deliberate contrast — tag stripping and entity decoding
are only SHOULD, but "The selection of the text MUST be in terms of unicode code points … not in
terms of code units."

**Matching semantics: there is essentially none.** The only rule is: "If, after processing the
prefix, exact, and suffix, the user agent discovers multiple matching text sequences, then the
selection SHOULD be treated as matching all of the matches." The words *fuzzy*, *approximate* and
*similarity* do not appear in the document. Every fuzzy matcher in the wild — Hypothesis included —
is an **extension**, not conformance.

### TextPositionSelector

Offsets index into text "selected and normalized in the same way as for the Text Quote Selector" —
markup stripped, entities decoded, code points counted. Markup is not counted.

This is the spec's weakest point for third-party HTML: because the normalisation is only
SHOULD-level and whitespace collapsing, `<br>`, `display:none` and pseudo-element content are all
unaddressed, two conforming clients can compute different normalised strings and disagree on
offsets. The spec itself concedes: this selector "is very brittle with regards to changes to the
resource. Any edits or dynamically transcluded content may change the selection."

### The redundant-selector rule — **OR, not AND**

This is the sentence that matters most:

> "Multiple Selectors **SHOULD** select the same content, however some Selectors will not have the
> same precision as others. Consuming user agents **MUST** pick one of the described segments, if
> they are different."

A set of sibling `selector` values is an *alternatives* set — redundant descriptions of the same
segment, for robustness. It is not an intersection. And critically: **there is no defined
precedence order.** The spec never ranks the selector types, never says "prefer the most specific",
and gives no tie-break heuristic. Choosing the order, and reconciling conflicts, is entirely the
client's problem.

`refinedBy` is the narrowing axis — the nested selector applies *within* the segment the outer one
identifies. The trap: multiple `refinedBy` values are again alternatives ("If more than 1 is given,
then they are considered to be alternatives"); real chaining is expressed by nesting `refinedBy`
inside `refinedBy`. The canonical pattern for third-party HTML is Example 29 — a container selector
refined by a quote:

```json
"target": {
  "source": "http://example.org/page1",
  "selector": {
    "type": "FragmentSelector",
    "value": "para5",
    "refinedBy": {
      "type": "TextQuoteSelector",
      "exact": "Selected Text",
      "prefix": "text before the ",
      "suffix": " and text after it"
    }
  }
}
```

This is structurally what our `sectionPath` + `quote` pairing is, and it is worth noting that the
spec already blesses it.

### The gap

**The spec says nothing about failure.** No orphan concept, no fallback ordering, no requirement to
report or persist an unanchorable annotation, no conformance criterion for a client that cannot
resolve anything. The redundant-selector rule is its entire robustness story, and it stops at "MUST
pick one" without saying what to do when *none* resolve.

So: the data model is a useful **vocabulary** for what we store. It is not a design for
re-anchoring. That has to come from implementations.

---

## 4. Hypothesis — the reference implementation

The most complete production system anchoring into HTML nobody controls. Sources are the live
`hypothesis/client` tree on `main`.

### What it stores

[`src/annotator/anchoring/html.ts`](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts),
`describe()`:

```ts
const types = [MediaTimeAnchor, RangeAnchor, TextPositionAnchor, TextQuoteAnchor];
```

For ordinary HTML that yields three selectors: `RangeSelector` (XPath containers + offsets),
`TextPositionSelector` (offsets into `root.textContent`), `TextQuoteSelector`.

Context length, from [`types.ts`](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/types.ts):

```ts
// Number of characters around the quote to capture as context.
const contextLen = 32;
```

The code carries a note that logical boundaries (sentence/paragraph, via `Intl.Segmenter`) would be
better. Quote and context are taken from *rendered* text — `renderedTextOf` substitutes each `<br>`
with a space so `<p>foo<br>bar</p>` does not serialise as `foobar`.

### How it resolves — and the detail most summaries get wrong

```ts
const maybeAssertQuote = (range: Range) => {
  if (quote?.exact && range.toString() !== quote.exact) {
    throw new Error('quote mismatch');
  } else {
    return range;
  }
};

// From a default of failure, we build up catch clauses to try selectors in
// order, from simple to complex.
let promise: Promise<Range> = Promise.reject('unable to anchor');
if (range)    { promise = promise.catch(() => querySelector(RangeAnchor.fromSelector(root, range_), options).then(maybeAssertQuote)); }
if (position) { promise = promise.catch(() => querySelector(TextPositionAnchor.fromSelector(root, position_), options).then(maybeAssertQuote)); }
if (quote)    { promise = promise.catch(() => querySelector(TextQuoteAnchor.fromSelector(root, quote_), options)); }
```

Two things follow, and both are load-bearing for our design:

1. **The order is Range (XPath) → Position → Quote**, as a promise-rejection chain.
2. **The first two are not trusted.** Both pipe through `maybeAssertQuote`, a strict
   `range.toString() !== quote.exact` equality check that throws and falls through on mismatch.
   Only the quote branch is allowed to return a range unverified — because it *is* the
   verification.

Additionally, during selector collection the position is copied into the matcher's hint
(`options.hint = position.start`) *unconditionally*, before any attempt runs. So
`TextPositionSelector` plays two roles: a verified fast path, and a proximity prior for the fuzzy
matcher.

The design in one line: **the quote is truth; XPath and offsets are accelerators.**

### The matcher

[`match-quote.ts`](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/match-quote.ts).
No diff-match-patch — it imports `approx-string-match` (Myers' bit-parallel algorithm,
`O((k/w)·n)`, no pattern-length limit), with an exact-match fast path first:

```ts
// Do a fast search for exact matches. The `approx-string-match` library
// doesn't currently incorporate this optimization itself.
```

Error budget:

```ts
const maxErrors = Math.min(256, quote.length / 2);
```

Scoring weights, verbatim:

```ts
const quoteWeight = 50;  // Similarity of matched text to quote.
const prefixWeight = 20; // Similarity of text before matched text to `context.prefix`.
const suffixWeight = 20; // Similarity of text after matched text to `context.suffix`.
const posWeight = 2;     // Proximity to expected location. Used as a tie-breaker.
```

Sub-scores are `1 - errors/length`; missing prefix/suffix score `1.0` (no penalty); position scores
`1.0 - |match.start - hint| / text.length`. Normalised against `maxScore = 92`, best candidate
wins.

**Finding worth flagging:** the JSDoc claims it returns "`null` if no match exceeding the minimum
quality threshold was found", but **there is no minimum score threshold in the code**. `matchQuote`
returns `null` only for an empty quote or zero candidates. The only real gate is
`maxErrors = quote.length / 2` — up to 50% edit distance is accepted, and whatever scores highest
is anchored. There is no low-confidence band. That is a gap we should not copy (§1, rung 4).

### How failure is detected and presented

[`guest.ts`](https://github.com/hypothesis/client/blob/main/src/annotator/guest.ts) — failure is a
swallowed exception producing an anchor with no `region`:

```ts
annotation.$orphan =
  anchors.length > 0 &&
  anchors.every(anchor => anchor.target.selector && !anchor.region);
```

The sidebar adds a timeout (`const ANCHORING_TIMEOUT = 500;` in
`src/sidebar/store/modules/annotations.ts`) that marks still-pending annotations as
`$anchorTimeout`. Orphans get their own tab, labelled **"Unanchored"**, which only renders when
`orphanCount > 0`; the quote is rendered with `p-redacted-text` styling. The annotation is never
deleted — it stays stored with its selectors, visible, just unhighlighted.

This is essentially the behaviour the map already specifies for our margin. Good sign.

### XPath form and why it fails

[`xpath.ts`](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/xpath.ts)
generates root-relative, 1-based, same-tag-sibling-indexed paths of the form `/div[1]/article[1]/p[3]`,
and resolves them with a hand-rolled walker rather than `document.evaluate` when they match
`/^(\/[A-Za-z0-9-]+(\[[0-9]+\])?)+$/`. Broken by any insertion, removal or reordering of same-tag
siblings anywhere along the path — ads, lazy-loaded blocks, cookie banners, A/B tests, framework
re-renders, and Hypothesis's own `<hypothesis-highlight>` wrappers. By contrast `text-range.ts` is
explicitly designed so that DOM changes which do not affect text content leave the anchor intact.

### Published robustness material

- [Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/) — the canonical write-up.
  Documents the move away from Annotator's XPath-only model to the three-selector design still in
  place. **No failure-rate numbers.**
- [`hypothesis/anchoring-test-tools`](https://github.com/hypothesis/anchoring-test-tools) — a
  harness that reports per-URL anchor/orphan counts and diffs runs. Exists; **no published
  results**. Worth copying the *idea*: a corpus-replay harness is how you'd validate our ladder.
- [client#3919](https://github.com/hypothesis/client/issues/3919) — the perf incident behind the
  `Math.min(256, …)` cap.

The only quantitative field data is third-party: Aturban, Nelson & Weigle,
[*Quantifying Orphaned Annotations in Hypothes.is*](https://arxiv.org/abs/1512.06195) (2015), over
**20,953** highlight annotations — **~22% could no longer be attached** to their live pages; only
~12% of those were recoverable from web archives; and **53% of still-attached annotations were
judged in danger** of orphaning. Their recommendation: archive the target at annotation time.

Caveat: that measures *content decay on the open web* (redesigns, dead pages), not matcher quality.
Our corpus is nothing like it — see §7.5. But the "archive the target at annotation time" advice
maps directly onto the map's decision to store fully-processed revisions.

### `dom-anchor-text-quote` / `dom-anchor-text-position`

- [`dom-anchor-text-quote`](https://github.com/tilgovi/dom-anchor-text-quote) — npm **4.0.2,
  2017-02-10**; depends on `diff-match-patch ^1.0.0`. Not formally deprecated, just dormant.
  Constants: `SLICE_LENGTH = 32`, `CONTEXT_LENGTH = SLICE_LENGTH`. Tolerance is expressed through
  diff-match-patch's `Match_Distance`: `root.textContent.length * 2` for the first slice
  (effectively "anywhere"), then `64` for subsequent adjacent slices. **The 32-char slicing exists
  purely to work around Bitap's 32-character pattern ceiling** — so its "fuzziness" is not a clean
  global edit-distance bound. That is exactly what Hypothesis's `match-quote.ts` fixed.
- [`dom-anchor-text-position`](https://www.npmjs.com/package/dom-anchor-text-position) — 5.0.0,
  2020-04-01. Trivial offset ↔ Range conversion over `dom-seek`.
- Both are **superseded inside the client**. The current client has no `diff-match-patch`
  dependency at all. Robert Knight's [`anchor-quote`](https://github.com/robertknight/anchor-quote)
  is the explicit successor experiment ("a more quantifiable definition of fuzziness").

**Do not adopt `dom-anchor-*`.** They are the previous generation, and they carry the Bitap ceiling
with them.

---

## 5. Approximate string matching

### 5.1 `match_main`

[API](https://github.com/google/diff-match-patch/wiki/API): `match_main(text, pattern, loc) → location`,
"locates a pattern within text near an expected location, returning the closest matching position",
weighting both character accuracy and proximity. From the
[JS source](https://raw.githubusercontent.com/google/diff-match-patch/master/javascript/diff_match_patch_uncompressed.js)
it returns **`-1` on failure**, with no score — you cannot distinguish a marginal match from a
perfect one without re-deriving the score yourself.

### 5.2 `Match_MaxBits` — the 32-character wall

```js
this.Match_MaxBits = 32;  // The number of bits in an int.
```

and, at the top of both `match_main` and `match_bitap_`:

```js
if (pattern.length > this.Match_MaxBits) { throw new Error('Pattern too long for this browser.'); }
```

**It throws.** Not degraded quality — an exception. Bitap holds the pattern state in one machine
word, so the pattern cannot exceed the word size; Neil Fraser's
[write-up](https://neil.fraser.name/writing/patch/) states the limit plainly. The Python port is the
only one where long patterns work (arbitrary-precision ints, with the cost that implies).

**This alone disqualifies `match_main` for us.** Our median quote candidate is 48 characters and
p90 is 100 (§7.4) — over 90% of realistic annotations would throw.

### 5.3 `Match_Threshold` and `Match_Distance`

```js
this.Match_Threshold = 0.5;   // 0.0 = perfection, 1.0 = very loose
this.Match_Distance  = 1000;  // A match this many characters away from the expected
                              // location will add 1.0 to the score
```

`match_bitapScore_`:

```js
var accuracy = e / pattern.length;
var proximity = Math.abs(loc - x);
if (!dmp.Match_Distance) { return proximity ? 1.0 : accuracy; }
return accuracy + (proximity / dmp.Match_Distance);
```

The score is **error rate plus normalised displacement**, both penalties, and `Match_Threshold` is a
cutoff on it (lower is better). Concretely with defaults: a candidate 500 characters from `loc`
carries a 0.5 penalty which alone exhausts the threshold — so nothing beyond ~500 characters can
ever match, however perfect the text. `Match_Distance = 0` makes location a hard constraint.

Note how differently this treats position compared to Hypothesis: diff-match-patch makes proximity a
*hard constraint co-equal with text accuracy*; Hypothesis makes it a `posWeight = 2` tie-breaker
against `quoteWeight = 50`. **Hypothesis is right for our case** — a document edit above the anchor
shifts every subsequent offset arbitrarily far.

### 5.4 `patch_apply`, `Patch_Margin`, `Patch_DeleteThreshold`

`Patch_Margin = 4`; `patch_addContext_` grows context by that step until the pattern is unique,
bounded by `pattern.length < Match_MaxBits - 2*Patch_Margin` so the result stays under 32 bits.
`patch_splitMax` splits every patch to ≤32 characters. `Patch_DeleteThreshold = 0.5` rejects a patch
when `diff_levenshtein(diffs) / text1.length` exceeds it — a real quality gate that `match_main`
lacks.

For text longer than 32 characters `patch_apply` does a **two-pass head/tail anchor**: `match_main`
on the first 32 characters, `match_main` on the last 32, and if `end_loc == -1 || start_loc >= end_loc`
it drops the patch ("Can't find valid trailing context"). It never matches the interior.

Verdict: `patch_apply` is designed to *edit* text, not to *locate* a span. The head/tail idea is
worth knowing; the machinery is not worth borrowing.

Fraser's tuning guidance is sparse but useful on context sizing: English prose rarely repeats within
15 characters, source code repeats heavily, so grow context in 4-character steps until unique. **Our
corpus behaves like source code, not prose** (§7.3) — a point in favour of generous context.

### 5.5 What to use instead

[`approx-string-match`](https://github.com/robertknight/approx-string-match-js) — Myers'
bit-parallel approximate matching, `O((k/w)·n)` with `w = 32`, **no pattern-length limit**, explicit
error budget `k`. `anchor-quote`'s README states the motivation for leaving diff-match-patch
bluntly: it "exhibits very poor performance in certain cases when the text is not found", with a
benchmark over 453 anchorable quotes of **13,342 ms → 936 ms (~14×)**.

---

## 6. Other prior art

**`annotator.js` / `xpath-range`.** [openannotation/xpath-range](https://github.com/openannotation/xpath-range)
stores `(xpath, offset)` pairs — simplified child-axis paths like `/html/body/article/p[3]` plus a
character offset. Survives nothing textual; it is purely structural. Broken by any DOM
restructuring. Failure is detected when the XPath resolves to nothing, or resolves but the text no
longer matches. Hypothesis's Fuzzy Anchoring post documents the replacement directly: store three
selectors, try four strategies (XPath verified against the quote → global offset → context-first
fuzzy → quote-only fuzzy). **This is the single clearest "we tried structural-only and it did not
work" data point in the field.**

**Brush, Bargeron, Gupta & Cadiz, *Robust Annotation Positioning in Digital Documents*, CHI 2001**
([MSR-TR-2000-95](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2000-95.pdf)).
12 participants, 216 annotations, 302 position ratings on a 7-point scale. Their deliberately naive
algorithm stored only the anchor text and alternately trimmed words off the front and back until a
partial match was found or the anchor dropped below 15 characters.

Results:
- Unchanged anchor text (47 ratings): median **7.0**.
- Moved but unchanged text (121 ratings): **100% found**, median **7.0**.
- Modified text (134 ratings): 71 found, 63 orphaned.
- For orphans, satisfaction **rose** with the degree of modification: median 1.5 at modification
  score 1, 3.0 at 2–3, and **7.0 for total deletion** (25 annotations).

Three conclusions that bear directly on our design: users pay little attention to surrounding
context, so "algorithms may want to give the surrounding context relatively little weight"; users
expect keyword / proper-noun / quotation matching; and **there is a point at which orphaning beats a
confident-but-wrong reattachment.**

**Brush & Bargeron, *Robustly Anchoring Annotations Using Keywords***
([MSR-TR-2001-107](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2001-107.pdf)).
The follow-up. Anchors store a bookmark, offset from document start, anchor length, small text
windows at the start/end points, and **keywords** — the lowest-document-frequency words in the
anchor text (all hapaxes; widen until ≥3 keywords), each with its distance from the anchor's start
and end. Repositioning seeds a candidate at every keyword occurrence, extends by other keywords
(candidate may not exceed 2× the original length), and scores on relative change in inter-keyword
distance (max 100), start/end recovery (50), length (50), document offset (20), outer context (10
each), normalised to 0–100.

Two thresholds, and this is the part worth stealing: below the **guess threshold** the annotation is
orphaned *but the candidate is offered as a best guess*; below a later-added **complete orphan
threshold** no guess is shown at all. Study: 8 participants, 115 annotations, guess threshold 50.
Keyword medians 6.5 vs 5.0–5.5 for simple text search, Friedman χ²(3, N=8) = 9.813, p = .02.
Notable failure mode: candidates containing only **one** keyword scored a median of **1.0
("terrible")** — which is exactly why the complete-orphan threshold was added. The
[patent](https://patents.google.com/patent/US7747943B2/en) gives concrete bands: ~98 auto-anchor,
70–80 confirm, <40 orphan.

**Phelps & Wilensky, *Robust Intra-document Locations*, WWW9 / Computer Networks 33:105–118 (2000).**
The canonical URLs are dead or parked, so the original could not be read; the account below is from
Brush & Bargeron's description. Points are identified **redundantly** by (a) a unique identifier,
(b) a **tree walk** — a root-to-leaf sequence of child indices and node tags ending in a media
offset — and (c) context. Span anchors carry two robust points plus the whole anchor text.
Resolution tries ID, then tree walk, then context, "continuing only if the previously tried methods
are ineffective." Only "some initial testing" is reported; **no success rates**. This is the
earliest statement of the redundant-selector-ladder idea that the W3C model later codified.

**Browser text fragments** ([`#:~:text=`](https://wicg.github.io/scroll-to-text-fragment/)). Syntax
`text=[prefix-,]start[,end][,-suffix]`. Only `start` is required and it matches "the first instance
of this exact text string". Two hard constraints: **matching is exact — there is no fuzzy provision
anywhere in the spec** (only whitespace allowances and percent-encoding), and each part "will only
match text within a single block", so a directive cannot span block boundaries. On failure it
silently does nothing and falls back to an element-id fragment. The strictest point on the spectrum:
free, URL-portable, zero tolerance. Relevant to us as a *sharing* mechanism, not a storage one.

**PDF.** The PDF spec anchors `/Highlight`, `/Underline`, `/Squiggly`, `/StrikeOut` geometrically via
a `QuadPoints` array (8×n numbers in default user space, one quad per run of contiguous words, so
highlights follow line breaks); readers fall back to `Rect` when it is absent or out of bounds.
Known interop wart: ISO 32000-1 Table 179 specifies counter-clockwise vertex order but Acrobat
expects Z-order, and most viewers follow Acrobat. Geometry survives nothing but a byte-identical
file. pdf.js-based annotators (Hypothesis included) therefore anchor on the *extracted text layer*
instead, which is viewer-specific ([client#3737](https://github.com/hypothesis/client/issues/3737)).
Their PDF path also strips *all* whitespace from both document and quote before matching, runs the
matcher **per page** sorted by distance from the hinted page, and caches per quote+hint. The
whitespace-stripping normalisation is a technique worth remembering (§9).

**Genius, Medium, Readwise, Instapaper.** No primary engineering sources found for any of them —
only press coverage and third-party reimplementations. Treat as unknown; do not cite.

---

## 7. What Mojang's corpus actually looks like

Original measurement for this ticket, over the live
`https://launchercontent.mojang.com/v2/javaPatchNotes.json` manifest and its articles
(**403 versions**, fetched 2026-08-11). These numbers are the reason several of the recommendations
above diverge from Hypothesis's defaults.

### 7.1 Shape

- Body sizes: min **70** bytes, median **5,664**, max **179,854**.
- Headings per article: min **0**, median **5**, max **194**. **8 of 403 articles have no headings
  at all** → the section tree needs a synthetic root section, or `sectionPath` must be allowed to be
  empty.
- `<h1>`/`<h2>`/`<h3>` are used as a real hierarchy (e.g. `Data Pack Version 115.0` → `Commands` →
  `Changes to swing`).
- **Zero headings anywhere in the corpus carry a pre-existing `id` attribute.** The
  `if (!attribs.id …)` branch in `parseHeader` has never fired on real data — which matters, because
  when it *does* fire the heading silently renders as a `<p>` (`HElem` is only reassigned inside
  that branch) and is omitted from `articleSections` entirely.

### 7.2 The markup is malformed, on purpose

Sampling 101 articles:

- **42** have unbalanced `<li>` tags and **44** have unbalanced `<p>` tags — Mojang emits HTML-4
  style optional close tags (`<p>…<p>…`, `<li>…<li>…`).
- **74** contain a `<ul>` nested inside an `<li>`.
- **11.4%** of all article text sits inside `<code>` or `<pre>`.

The first point is the important one: **the DOM shape of these articles is entirely a product of the
parser's error recovery.** Two HTML parsers — or two versions of `html-dom-parser` — can legitimately
build different trees from the same bytes. Any structural anchor is hostage to that.

### 7.3 Quotes are not unique — context is mandatory

Over 5,548 candidate quotes (text runs ≥15 characters, sampled across 68 articles):

| | count | share |
|---|---|---|
| Non-unique within their own article | 510 | **9.19%** |
| Still ambiguous with 32-char prefix + suffix | ≤42 | **≤0.76%** |

Examples of the collisions: `Buried Treasure Map` (×4), `minecraft:attack_animation` (×3),
`If omitted, defaults to` (×2), `no longer changes the type of the item it is applied to` (×2).

Two conclusions:

1. **Hypothesis's `contextLen = 32` is empirically well-chosen for this corpus** — it cuts ambiguity
   by an order of magnitude. Keep it.
2. A 9.19% base rate of exact internal duplication is *much* higher than general prose. Combined
   with a 50%-edit-distance budget, that is a mis-anchoring engine. **Tighten the error budget
   (§1).**

### 7.4 Quote lengths — the diff-match-patch verdict

| p10 | p50 | p90 | p99 | max |
|---|---|---|---|---|
| 18 | **48** | **100** | 223 | 603 |

More than half of realistic quotes already exceed `Match_MaxBits = 32`; over 90% do if the user
selects a whole bullet. `match_main` would throw on nearly every annotation. Settled.

### 7.5 Articles are content-addressed, and old ones do not change

`contentPath` is a hash-named blob: `javaPatchNotes/<64-hex>.json`. That means **any in-place edit
necessarily changes the `contentPath` in the manifest**, giving revision detection for free from the
manifest alone — cheaper than the content hash the map already plans, and it composes with the
`If-Modified-Since` short-circuit.

Cross-checking 40 archived copies of the manifest on the Wayback Machine (2024-02-03 → 2026-07-25,
401 distinct versions observed): **zero versions changed `contentPath`**. That sampling is far too
coarse to catch same-day edits to the newest article (which is where the map says edits happen), but
it is decent evidence that **older articles are effectively immutable**.

Practical consequence: for the overwhelming majority of articles, re-anchoring is not about content
change at all — it is *only* about `processorVersion`/`textVersion` change. That makes the map's "run
on every article regardless of age" cheap, provided results are cached (§9).

---

## 8. Twist 1 — fuzzy heading matching given stable section order

### The current ids cannot be the anchor key

`parseHeader` derives ids by `toKebabCase(headingText)` and de-duplicates with a counter. The
counter is keyed on the *already-suffixed* id:

```ts
let id = toKebabCase(headingText);
const dups = ids.get(id) ?? 0;
if (dups > 0) { id += `-${dups}`; }
ids.set(id, dups + 1);   // `id` has been reassigned — the count lands on the suffixed key
```

Simulating this over the whole corpus: **7 of 403 articles emit literally duplicate DOM ids.** The
worst is `1.14`, which emits `parameters-1` **ten times**; `1.20.5` emits `advancements-1` twice;
`26.3-snapshot-4` emits `removed-minecraft:reference-1` twice. A further 31 articles have exactly
two identical headings, where the dedup happens to work.

So heading-derived ids are not unique **within a single revision today**, let alone stable across
revisions. They cannot be an anchor key. (Fixing the counter is a good idea independently — and
fixing it is itself a `processorVersion` bump that would change ids for those 7 articles, which is
precisely the scenario §9 is about.)

### What fuzzy heading matching should be

Not per-heading best-match. **Sequence alignment.**

Store, per annotation, the ordered path of *verbatim heading text* (`["Data Pack Version 115.0",
"Commands", "Changes to swing"]`) alongside the index path. To re-anchor, run a global
order-preserving alignment (Needleman–Wunsch over the heading sequence, with normalised edit
similarity as the substitution score and a gap penalty for insertion/deletion) between the old and
new heading lists. Because section *order* is stable, alignment is cheap, unambiguous, and handles
the three real cases correctly:

- Heading reworded → aligned by position, matched by similarity.
- Heading inserted/removed → absorbed as a gap; everything after still aligns.
- Heading moved → alignment degrades gracefully, and the quote match downstream still saves it.

### Why independent fuzzy matching would be wrong

Measuring pairwise similarity between distinct headings within the same article (6,204 pairs):
**only 3 pairs (0.05%) exceed 0.80 normalised similarity.** So a naive threshold looks safe — but
look at what those 3 pairs are:

```
26.3-snapshot-7  0.85  Added minecraft:attack_animation || Added minecraft:interact_animation
24w12a           0.86  minecraft:food                   || minecraft:tool
1.21.4-pre1      0.86  Changed minecraft:time numeric property || Changed minecraft:compass numeric property
```

These are the *semantically most distinct* headings in the article — different components — and
they are the ones a correction annotation is most likely to target. An independent
best-fuzzy-match would silently swap them. Order-anchored alignment cannot, because their relative
order is fixed.

**Recommendation:** alignment, not independent matching; verbatim heading text stored, not the
kebab id; and the section is a *scope* for the quote match, never an anchor on its own.

---

## 9. Twist 2 — surviving `processorVersion` changes

### Split the version number in two

This is the sharpest single recommendation in this document.

`processorVersion` as the map currently describes it covers everything the pipeline does:
sanitising, list-nesting repair, heading id generation and demotion, syntax highlighting, section
tree construction. Those change for all sorts of reasons — a Shiki upgrade, a theme change, a
`sanitize-html` bump, fixing the id counter bug in §8.

But **anchors only care about one thing: the normalised plain text.** So introduce a second,
much more stable number:

- **`textVersion`** — versions the plain-text extraction and normalisation *only*: which nodes
  contribute text, whitespace collapsing, entity decoding, `<br>` handling, code-point counting.
- **`processorVersion`** — versions everything else about the rendered output.

Then the rule is simple and checkable:

| Anchor component | Survives `processorVersion` bump? | Survives `textVersion` bump? |
|---|---|---|
| `quote.exact` / `prefix` / `suffix` | **Yes** | Needs re-anchoring (fuzzy will usually still hit) |
| `position.start` / `end` | **Yes**, if `textVersion` unchanged | **No** — offsets are meaningless |
| `sectionPath` index path | Yes, if section-splitting rules unchanged | n/a |
| `headingText` | **Yes** | n/a |
| Heading kebab `id` | **No** | n/a |
| CSS/XPath into the rendered DOM | **No** | n/a |

`textVersion` should be treated as near-frozen. If it must change, that is a corpus-wide re-anchor
job, and it should be run and its results persisted, not computed at read time.

### Why structural selectors are worse for us than for Hypothesis

Hypothesis's XPath is computed against a DOM the *browser* built from bytes the publisher shipped.
Ours would be computed against a DOM that **our own pipeline has deliberately mutated**, four times
over:

1. `sanitize-html` drops disallowed tags while keeping their text — removes elements, preserves
   characters.
2. The `li` fixup in `patch-notes.tsx` splits a malformed `<li><x>…<li></li></x></li>` into two
   sibling elements — **re-parents content without changing a single character**. 74 of 101 sampled
   articles contain the nested-list pattern this targets.
3. `parseHeader` demotes every heading by one level (`h1` → `h2`) and appends an `<a>#</a>` into it.
4. `highlightToHtml` replaces the entire interior of every `<pre>`/`<code>` with generated spans —
   **11.4% of all article text**, and the output changes with every Shiki/theme upgrade.

Every one of those changes the tree while leaving the text intact. That is the exact signature of a
change that breaks structural anchors and leaves textual ones untouched. Layer on §7.2 — that 42%
of articles have unbalanced `<li>` and 44% unbalanced `<p>`, so the baseline tree is already a
parser-error-recovery artefact — and a DOM path is not merely fragile here, it is unjustifiable.

Two smaller consequences worth writing down:

- **Extract the plain text from the sanitised source DOM, before the render transforms.** If it is
  taken from the rendered output, every heading contributes a spurious `#` (the anchor link
  `parseHeader` appends) and every code block contributes highlighter-dependent text. That would
  couple `textVersion` to `processorVersion`, which is the thing we are trying to avoid.
- The current section tree (`ArticleSection` / `ArticleSubSection` in `patch-notes.tsx`) carries
  `text`, `id`, `level` and a flat `children` array — **and no offsets**. To be usable as an anchor
  scope it needs to carry the character range each section covers in the normalised text. That is a
  small, self-contained change to make while the tree is being persisted anyway.

### Caching

Because old articles are effectively immutable (§7.5), re-anchoring results should be memoised on
`(annotationId, revisionId, textVersion)`. A `processorVersion` bump alone should not invalidate
them.

---

## 10. Where this refines or contradicts the map's settled design

The map ([#27](https://github.com/MinecraftCommands/mcc-tools/issues/27)) says:

> Re-anchoring uses a redundant selector set (structural path + text quote + character offset) tried
> in order, with fuzzy matching on section headings. Failures orphan to the margin, stay visible
> with their quoted text, and permalink to the revision they were written against. Runs on every
> article regardless of age.

Broadly confirmed. Four refinements, one of which is a genuine correction.

### 10.1 "Tried in order" is not enough — the fast paths must be quote-verified

This is the correction. Read literally, "tried in order" is the W3C rule: alternatives, take the
first that resolves. That is also what the spec mandates ("MUST pick one"). But it is **not** what
Hypothesis does, and doing it literally would silently mis-anchor.

Hypothesis pipes both the structural and the offset branch through `maybeAssertQuote`, which
compares the resolved range's text to `quote.exact` with **strict equality** and falls through on
mismatch. A structural path or an offset that still resolves after an edit will resolve to the
*wrong* text — and that is the common case, not the rare one, because deleting a paragraph leaves
the DOM path valid and pointing at the next paragraph.

**The ladder is not "first that resolves" — it is "first that resolves *and* whose text matches the
quote", with only the quote matcher allowed to answer unverified.**

### 10.2 The "structural path" leg should be the section tree, not a DOM path

The map's phrase "structural path" is ambiguous. Given §9, a CSS/XPath path into our rendered DOM
should not be stored at all — it survives neither content edits nor `processorVersion` bumps, and
our own pipeline mutates the tree in four separate places.

What *should* fill that slot is the **section path**: an ordered index path plus verbatim heading
text. It is semantic rather than presentational, it is the thing the map already decided to
persist, and it degrades into a search *scope* rather than a hard answer. This is exactly the W3C
`refinedBy` pattern from §3 — container narrows, quote decides.

### 10.3 Heading ids are broken today, so the section tree needs work first

7 of 403 articles currently emit duplicate DOM ids (§8), one of them ten times over. Any design
that keys on the id — including in-page permalinks and the table of contents — is already
subtly broken. The section tree also carries no character offsets, which it needs in order to scope
a quote match.

Neither is a blocker for the anchoring decision, but both are prerequisites for implementing it,
and the id fix will itself be a `processorVersion` bump.

### 10.4 Add a low-confidence band between "anchored" and "orphaned"

The map has two outcomes: re-anchored (inline, if promoted) or orphaned (margin). Both Brush papers
argue for three, and the CHI 2001 data is unusually direct about it — orphan satisfaction *rises*
with the amount of modification (median 7.0 for total deletion), while a wrong-but-confident
reattachment rates near the floor (median 1.0 for a one-keyword candidate). Their patent bands are
~98 auto-anchor / 70–80 confirm / <40 orphan.

Hypothesis has no such band — `matchQuote` has no minimum score threshold at all, despite its JSDoc
claiming one — and this is the clearest place where the reference implementation is *not* the thing
to copy.

Concretely: keep the map's binary *placement* rule (inline vs margin) exactly as decided, but let a
mid-confidence match render marginally **with** a "best guess" jump target, rather than being
discarded. It costs one number in the schema and it is what the only real user study on this
question recommends.

### 10.5 Confirmed, with a caveat on the expected failure rate

- "Failures orphan to the margin, stay visible with their quoted text" — matches Hypothesis's
  "Unanchored" tab behaviour exactly. Well-supported.
- "Permalink to the revision they were written against" — matches Aturban et al.'s recommendation to
  archive the target at annotation time, and the map already stores processed revisions.
- "Runs on every article regardless of age" — fine, and cheap given §7.5, **provided results are
  cached on `(revisionId, textVersion)`**.
- The 22% orphan rate from the Hypothesis field study should **not** be used to set expectations. It
  measures open-web content decay — redesigns, dead pages, paywalls. Our corpus is 403 immutable
  blobs behind a content-addressed CDN, with edits confined to the newest article. Expect a rate an
  order of magnitude lower. Build the replay harness anyway
  ([anchoring-test-tools](https://github.com/hypothesis/anchoring-test-tools) is the model) so the
  number is measured rather than assumed.

---

## 11. Open questions this research does not settle

- **Where the quote comes from at authoring time.** The reader selects in the *rendered* DOM;
  the anchor must be recorded against the *normalised source* text. That mapping needs designing,
  and it is where `textVersion` earns its keep.
- **Selections that span code spans.** 11.4% of text is inside `<code>`/`<pre>`, where the
  highlighter's DOM bears no resemblance to the source. Hypothesis's PDF path solves the analogous
  problem by stripping whitespace on both sides before matching; something similar may be needed.
- **Exact confidence thresholds.** §1 proposes ~25% error budget as a starting point on the basis of
  §7.3's duplication rate; the real numbers should come from a replay harness over the 403-article
  corpus with synthetic edits.
- **Whether annotations should span block boundaries at all.** Text fragments forbid it outright;
  restricting selections to a single block would make section scoping trivially reliable and cut the
  ambiguity rate further. Worth a product decision.

---

## Sources

**Specs.** [Web Annotation Data Model (REC, 2017-02-23)](https://www.w3.org/TR/annotation-model/) ·
[§4.2 Selectors](https://www.w3.org/TR/annotation-model/#selectors) ·
[Web Annotation Vocabulary](https://www.w3.org/TR/annotation-vocab/) ·
[Selectors and States (WG Note)](https://www.w3.org/TR/2017/NOTE-selectors-states-20170223/) ·
[Errata](https://www.w3.org/annotation/errata/) ·
[Text Fragments](https://wicg.github.io/scroll-to-text-fragment/)

**Hypothesis.** [html.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts) ·
[match-quote.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/match-quote.ts) ·
[types.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/types.ts) ·
[text-range.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/text-range.ts) ·
[xpath.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/xpath.ts) ·
[pdf.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/pdf.ts) ·
[guest.ts](https://github.com/hypothesis/client/blob/main/src/annotator/guest.ts) ·
[annotation-metadata.ts](https://github.com/hypothesis/client/blob/main/src/sidebar/helpers/annotation-metadata.ts) ·
[tabs.ts](https://github.com/hypothesis/client/blob/main/src/sidebar/helpers/tabs.ts) ·
[Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/) ·
[anchoring-test-tools](https://github.com/hypothesis/anchoring-test-tools) ·
[client#3919](https://github.com/hypothesis/client/issues/3919) ·
[product-backlog#954](https://github.com/hypothesis/product-backlog/issues/954)

**Matching libraries.** [diff-match-patch API wiki](https://github.com/google/diff-match-patch/wiki/API) ·
[diff-match-patch JS source](https://raw.githubusercontent.com/google/diff-match-patch/master/javascript/diff_match_patch_uncompressed.js) ·
[Neil Fraser, *Diff Strategies / Patch*](https://neil.fraser.name/writing/patch/) ·
[approx-string-match-js](https://github.com/robertknight/approx-string-match-js) ·
[anchor-quote](https://github.com/robertknight/anchor-quote) ·
[dom-anchor-text-quote](https://github.com/tilgovi/dom-anchor-text-quote) ·
[xpath-range](https://github.com/openannotation/xpath-range)

**Papers.** [Brush et al., *Robust Annotation Positioning in Digital Documents*, CHI 2001 (MSR-TR-2000-95)](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2000-95.pdf) ·
[Brush & Bargeron, *Robustly Anchoring Annotations Using Keywords* (MSR-TR-2001-107)](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2001-107.pdf) ·
[US7747943B2](https://patents.google.com/patent/US7747943B2/en) ·
[Aturban, Nelson & Weigle, *Quantifying Orphaned Annotations in Hypothes.is* (arXiv:1512.06195)](https://arxiv.org/abs/1512.06195) ·
Phelps & Wilensky, *Robust Intra-document Locations*, WWW9 / Computer Networks 33:105–118 (2000) —
**primary source unreachable; described via Brush & Bargeron**

**Corpus measurement (§7, §8).** `https://launchercontent.mojang.com/v2/javaPatchNotes.json` and its
403 articles, fetched 2026-08-11.

**Unknown / no primary source found.** Genius, Medium highlights, Readwise, Instapaper.
