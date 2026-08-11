# Convex built-in full-text search — capabilities, limits, and schema implications

Research for [#31](https://github.com/MinecraftCommands/mcc-tools/issues/31), part of the map in
[#27](https://github.com/MinecraftCommands/mcc-tools/issues/27). Investigated 2026-08-11.

**Sources.** Everything below is from Convex's own docs
([`docs.convex.dev`](https://docs.convex.dev)), the open-source backend
([`get-convex/convex-backend`](https://github.com/get-convex/convex-backend)), Convex's pricing page,
and Convex's own blog. Where the docs and the source disagree, or the docs are silent, the source is
cited directly and marked as such. Corpus measurements are taken live from
`https://launchercontent.mojang.com/v2/`.

---

## Verdict

**Yes — Convex's built-in FTS is enough to ship changelog search, and cost is not the constraint.**
The corpus is ~4 MB of plain text; both the storage and per-query billing dimensions are far inside
the free tier (see [Cost](#cost-and-metering)).

What is constrained is **matching quality**, and it is constrained in ways that will be visible to
Minecraft users on day one:

1. **Multi-term queries are OR, not AND.** There is no way to require all terms.
2. **No stemming.** `block` does not match `blocks`.
3. **Version strings are destroyed by tokenization.** `1.21.4` becomes the three terms `1`, `21`, `4`.
4. **No phrase queries, no negation, no operators.**
5. **Hard ceiling of 1024 results, ever** — pagination cannot go past it, and hitting the end of a
   broad query throws rather than terminating cleanly.

None of these are fatal for a first release, but 1–3 are the ones that will generate "search is bad"
feedback. See [When to reach for an external index](#when-to-reach-for-an-external-index).

---

## Answers to the ticket's questions

### Index definition

| Constraint | Value | Source |
| --- | --- | --- |
| Search indexes per table | **4** | [Limits § Full text search](https://docs.convex.dev/production/state/limits) |
| Search fields per index | **exactly 1** | [Full Text Search § Limits](https://docs.convex.dev/search/text-search) |
| Filter fields per index | **16** | Limits, Full Text Search |
| Also counts against | the 32 indexes-per-table budget | [Full Text Search § Limits](https://docs.convex.dev/search/text-search) |
| Index name length | 64 chars, unique per table | [Limits § Database](https://docs.convex.dev/production/state/limits) |

- The `searchField` **must be of type `string`**. Not an array of strings, not a number. Nested paths
  are allowed (`properties.name`).
- `filterField`s "support fields of any type (not just text)" and match by **exact equality only**.
  `q.eq("fieldName", undefined)` matches documents missing the field.
- Indexes can be declared `staged: true` to backfill asynchronously without blocking the deploy —
  relevant to the historical backfill, see [Operational hazards](#operational-hazards).

**Schema consequences:**

- Only *one* field is searchable per index. To search title + body together, Convex's own guidance is
  to **denormalize into a single concatenated string field**
  ([convex.dev/can-do/search](https://www.convex.dev/can-do/search): "consolidating values into a
  single search field"). Two indexes over two fields means two queries and hand-merged results with
  no shared relevance scale.
- Anything you want to *filter* on must be a scalar equality field on the same document. Filtering
  on a member of an array does not work — `eq` compares the whole array value.

### Result limits and pagination

- **Hard cap: 1024.** `crates/search/src/constants.rs` sets
  `MAX_CANDIDATE_REVISIONS: usize = 1024`, described as "the maximum number candidate revisions will
  we load into memory". `crates/search/src/lib.rs` passes it as `max_results` on every
  `PostingListQuery` — **fixed, regardless of your `.take(n)`**. The engine always computes the top
  1024.
- `.collect()` throws if it would collect more than 1024 documents
  ([docs](https://docs.convex.dev/search/text-search)).
- **Pagination does not escape the cap.** `crates/database/src/query/search_query.rs` runs the search
  once, then filters the 1024 candidates by cursor interval. Paging is slicing a fixed 1024-element
  list; there is no page 1025.
- **Paging to the end of a broad query throws.** In `SearchResultIterator::next`, when
  `next_index == MAX_CANDIDATE_REVISIONS` the backend bails with
  `SearchQueryScannedTooManyDocumentsError` — "Search query scanned too many documents (fetched
  1024). Consider using a smaller limit, paginating the query, or using a filter field to limit the
  number of documents pulled from the search index." So an "infinite scroll" over a query matching
  ≥1024 documents errors instead of reporting `Exhausted`. Cap the UI's total result count below 1024.
- Search queries **cannot be reordered**. "Search queries always return results in relevance order…
  Different ordering of results are not supported." There is no "sort by date" — you can only
  re-sort a page client-side, which is incoherent under pagination.
- Pagination is otherwise normal Convex pagination (cursor-based, fully reactive, page sizes can
  grow/shrink). `split_cursor_position` returns `None` — search pages cannot be split, so
  `maximumBytesRead` back-pressure works differently than on index scans.

### Filter fields — what can be combined with a search query

- Inside `withSearchIndex`: **1 `.search()` + 0..8 `.eq()`** (`MAX_FILTER_CONDITIONS = 8`, matching
  the docs' "up to 8 filter expressions").
- Equality only. **There is no range filter inside a search index.** A date-range filter must be
  either:
  - a post-`.filter()` over the ≤1024 candidates — correct but lossy: the search picks its top 1024
    *before* your date filter runs, so "posts from 2023 mentioning X" can come back empty even when
    matches exist; or
  - bucketed into an equality-filterable field (`releaseYear: 2023`), which only lets you pick one
    bucket per query since filter expressions are ANDed.
- **Version type filtering is the easy case**: `type` (`release` / `snapshot`) is a natural
  `filterField` and works exactly as wanted.
- Post-`.filter()` also costs transaction budget: each candidate examined is a full document read
  (`bytes_read += document.size()` in `SearchResultIterator::next`) against the 16 MiB
  data-read / 32,000 documents-scanned transaction limits
  ([Limits § Transactions](https://docs.convex.dev/production/state/limits)). With fat article
  documents this bites fast — see [Schema recommendations](#schema-recommendations).

### Matching semantics

Determined from `crates/search/src/constants.rs` and `crates/search/src/lib.rs`:

```rust
pub fn convex_en() -> TextAnalyzer {
    TextAnalyzer::from(SimpleTokenizer)
        .filter(RemoveLongFilter::limit(MAX_TEXT_TERM_LENGTH))  // 32
        .filter(LowerCaser)
}
```

That is the entire analysis pipeline. Therefore:

| Feature | Supported? | Detail |
| --- | --- | --- |
| Prefix matching | **Yes, last term only** | "the final search term has *prefix search* enabled" — `search("body", "r")` matches `rabbit` and `send request`. Designed for as-you-type. |
| Fuzzy / typo tolerance | **No (deprecated)** | "After January 15, 2025, search results will not include `snake` for a typo like `stake`." The Levenshtein machinery is still in the source but the documented behaviour is off. |
| Stemming | **No** | The pipeline has no stemmer. (`MAX_QUERY_TERMS` is commented "after stemming", but no stemmer is installed — the comment is stale.) `block` ≠ `blocks`, `render` ≠ `rendering`. |
| Stop words | **No** | No stop-word filter. `the`, `and`, `a` are indexed and matched. BM25's IDF de-weights them, but they still consume query-term budget. |
| Phrase queries | **No** | No quoting, no proximity operator. Match proximity is a *ranking* signal only. |
| Boolean operators / negation | **No** | Nothing in the query language. |
| Multi-term behaviour | **OR** | In `lib.rs`, user query tokens become `or_terms`; `and_terms` are only the filter-field terms. A document matching any single term is a candidate; documents matching more terms rank higher via BM25. There is **no way to require all terms**. |
| Case / punctuation | Ignored | `LowerCaser`; `SimpleTokenizer` "splits on whitespace and punctuation" ([tantivy docs](https://docs.rs/tantivy/latest/tantivy/tokenizer/struct.SimpleTokenizer.html)). |
| Ranking | BM25 + proximity + exact-match count; newest wins ties | "**Relevance order is subject to change.**" |
| Term length | **>32 bytes silently dropped** | `RemoveLongFilter::limit(32)`. Source comment: "We will silently drop terms that exceed this length." Long URLs, hashes, and base64 in the body simply do not exist in the index. |
| Query terms | **max 16, extras silently dropped** | `lib.rs` stops tokenizing at `MAX_QUERY_TERMS` and only logs a server-side metric. |

**The Minecraft-specific landmine.** `SimpleTokenizer` splits on punctuation, so:

- `1.21.4` → `1`, `21`, `4`. Searching for a version number produces three meaningless high-frequency
  terms OR'd together. Version lookup **must not go through the search index** — use a normal index
  on a `version` field, or expose version as a `filterField`.
- `minecraft:stone` → `minecraft`, `stone`.
- `24w45a` survives intact (alphanumeric, no punctuation) — snapshot IDs are fine.
- `entity_data` → `entity`, `data`; `/execute` → `execute`.

### Document size limits and truncation

- Convex's document limit is **1 MiB total per document**
  ([Limits § Documents](https://docs.convex.dev/production/state/limits)). A write exceeding it fails
  — nothing is silently truncated at the document level.
- **No documented or source-visible cap on the length of an indexed string field**, and no truncation
  of the field. Everything under 1 MiB is fully indexed.
- The only silent loss is per-*term*: anything longer than 32 bytes is dropped by
  `RemoveLongFilter`. That is a silent, undocumented-in-the-limits-table behaviour worth remembering.
- **Measured corpus** (live, 2026-08-11): the `javaPatchNotes.json` manifest lists **403 entries**.
  Sampling 7 articles across the range gives an average of **~15 KB of HTML / ~9.9 KB of plain text**
  per article, largest sampled 41.7 KB HTML. Projected whole corpus: **~5.9 MB HTML, ~3.9 MB plain
  text**. Every article is comfortably inside 1 MiB; the biggest is ~4% of the limit. Document size
  is a non-issue.

### HTML vs extracted plain text — index the plain text

Confirmed, and for a stronger reason than "it's cleaner":

- `SimpleTokenizer` splits on punctuation, so `<p class="x">Fixed</p>` tokenizes to
  `p`, `class`, `x`, `Fixed`, `p`. Tag names, attribute names, class names, and `&amp;`-style entities
  all become searchable terms and pollute the term dictionary.
- BM25 scores **inversely with field length** ("How long is the text field?"). HTML markup inflates
  the token count by roughly 50% at this corpus's markup density (15 KB HTML vs 9.9 KB text), which
  systematically depresses relevance for exactly the long, information-dense articles users search
  for.
- Common tag names (`p`, `li`, `code`) appear in every document, so a user searching `code` would
  match everything.

So: **store both, index only the extracted plain text.** This matches the standing decision in #27 to
store "extracted plain text for search" alongside the processed HTML.

### Cost and metering

Convex bills search on two dedicated dimensions, separate from function calls and database I/O
([Limits § Search pricing](https://docs.convex.dev/production/state/limits),
[convex.dev/pricing](https://www.convex.dev/pricing)):

| Dimension | Free/Starter | Overage |
| --- | --- | --- |
| **Search storage** (text + vector indexes) | 0.5 GB | $0.55/GB/mo |
| **Search queries** | **3,000 query-GBs/mo** | $0.11 per 1,000 query-GBs |

The unit matters. From `crates/usage_tracking/src/lib.rs`:

```rust
pub fn track_text_query(&self, component_path: ComponentPath, index_name: IndexName, index_size: u64) {
    *state.text_query_usage.entry(key).or_default() += TextIndexQueryUsage {
        num_searches: 1,
        bytes_searched: index_size,
    };
}
```

and the call site in `crates/database/src/transaction.rs`:

```rust
let index_size = index.metadata().config.estimate_pricing_size_bytes()?;
```

`estimate_pricing_size_bytes` for a text index sums `size_bytes_total` over all on-disk segments
(`crates/common/src/bootstrap_model/index/index_config.rs`). So:

> **query-GBs = (total size of the search index in GB) × (number of searches).**
> Every search is billed the *entire index size*, no matter how narrow the query or how small the
> `.take(n)`.

Convex confirms this framing in [their April 2026 pricing
post](https://news.convex.dev/enterprise-launch/): "For every GB in a search index and for every
search, there is a price — think of it as GB/searches"; and warns "for developers who heavily use
text search and don't use file storage, your bill may go up a bit (our math said no more than 25%)."

**Running the numbers for mcc-tools.** ~3.9 MB of plain text; a Tantivy index over that is on the
order of 2–6 MB, call it **0.005 GB**. Free tier allows `3,000 / 0.005 = ~600,000 searches/month`.
At a realistic community-site volume this is not close to a limit, and search storage (~0.005 GB of
0.5 GB) is negligible.

Caveats that could change the arithmetic by an order of magnitude:

- **Do not index article revisions.** Indexing every historical revision multiplies index size, and
  index size multiplies *every* search. Index only the current revision of each article.
- **Reactive subscriptions re-execute.** Each re-run of a subscribed search query is another billed
  search. A search box wired to `useQuery` that re-subscribes on every keystroke bills per keystroke.
  Debounce, and prefer a one-shot query over a live subscription for search. (Whether Convex's query
  *cache* suppresses billing on an identical cached query was **not verified** — treat every
  execution as billed.)
- Search queries are also ordinary function calls and count against the 1M/month function-call
  allowance.

`text_search_query_bytes` is exposed per function execution in log streams
([Tracking Usage](https://docs.convex.dev/platform-apis/track-usage)), so this is measurable in
production rather than guessed.

---

## Operational hazards

- **Backfilling a table that already has a search index can fail.** `TEXT_INDEX_SIZE_HARD_LIMIT` is
  100 MiB (`crates/common/src/knobs.rs`) on the *in-memory, not-yet-flushed* portion of the index.
  `Transaction::validate_memory_index_sizes` rejects writes past it with a `TextIndexTooLarge`
  overloaded error: "Too many writes to `<index>`. Spread your writes out over time or throttle them
  to avoid errors. If you're importing data into a new application, consider removing the index and
  adding it again after the import (you can re-add the index as a staged index to avoid blocking your
  pushes)." Note the source comment: **deletes and updates also grow the in-memory index**, so you
  cannot dig out by deleting.

  Directly relevant to #27's "clean cutover once the cron has backfilled all history". At ~4 MB the
  corpus will not hit 100 MiB, but a re-process pass that rewrites all 403 articles in a tight loop
  (a `processorVersion` bump — explicitly planned) is exactly the write pattern this guards against.
  **Throttle the re-process pass**, or use `staged: true`.
- **Relevance order is explicitly unstable.** Convex reserves the right to change ranking. Don't
  build tests, permalinks, or UI affordances that assume a stable result order.
- Search results are transactional and reactive, and **do include documents written earlier in the
  same mutation** (the memory index is queried alongside disk segments).
- An empty search string short-circuits to zero results and skips usage tracking
  (`Transaction::text_search`) — a blank search box costs nothing but also returns nothing, so the
  "no query yet" UI state must be handled explicitly.

---

## Schema recommendations

1. **Put the search index on a lean projection table, not on the fat article document.**
   Post-`.filter()` and candidate iteration load *whole documents* into the transaction's 16 MiB
   read budget. If the searchable text lives on the same document as the processed HTML, the section
   tree, and the raw HTML, every scanned candidate costs ~4× what it needs to. A table like:

   ```ts
   articleSearch: defineTable({
     articleId: v.id("articles"),
     versionId: v.string(),
     type: v.union(v.literal("release"), v.literal("snapshot")),
     releaseYear: v.number(),
     haystack: v.string(),   // title + version + extracted plain text, concatenated
   }).searchIndex("search_haystack", {
     searchField: "haystack",
     filterFields: ["type", "releaseYear", "articleId"],
   })
   ```

   keeps candidate documents small and leaves the article table free of search concerns.

2. **One concatenated `haystack` field**, because only one field per index is searchable and
   cross-index result merging has no shared relevance scale. Title text can be repeated once or twice
   in the haystack as a poor-man's field boost.

3. **Consider one search row per article *section* rather than per article.** Pros: shorter fields
   score better under BM25, results deep-link to the heading anchors the processing pipeline already
   emits, and it aligns with the annotation anchoring model. Cons: results need per-article dedup,
   and sections burn the 1024-candidate budget ~10× faster. Worth prototyping before the schema is
   frozen — this is the one open design choice that the schema cannot defer.

4. **Do not route version lookup through search.** `1.21.4` tokenizes to `1`/`21`/`4`. Version
   navigation needs a normal database index on a `version` field; version *filtering* of search
   results needs a `filterField`.

5. **Reserve the index budget.** 4 search indexes per table is the ceiling and vector indexes share
   the same "search storage" billing dimension. The out-of-scope semantic-search ambition in #27
   would consume vector index slots on whichever table it targets — another reason to keep search
   concerns on their own table.

6. **Index the current revision only.** Every extra byte in the index is charged on every search.

---

## When to reach for an external index

Nothing here forces Typesense/Meilisearch **now**. The escape hatch becomes worth building when any
of these show up:

- **Users complain that multi-word searches are noisy.** This is the most likely first failure. OR
  semantics with no AND, no phrase queries, and no negation means `chunk loading fix` ranks documents
  containing only `fix` above nothing at all. There is no configuration knob for this — it is
  hard-coded in `lib.rs`. It cannot be tuned, only replaced.
- **Users expect `blocks` to find `block`.** No stemmer, no way to add one. Partial mitigations
  (indexing a stemmed copy of the text produced by the ingestion pipeline, doubling index size and
  therefore per-query cost) are ugly enough to be a signal in themselves.
- **Result counts approach 1024**, or the UI wants faceted counts / "about N results". Convex cannot
  report a total match count at all, and cannot page past 1024.
- **Date-range filtering becomes a first-class UI affordance.** Equality-only filter fields plus
  top-1024-before-filtering means "articles from 2021 mentioning X" is silently wrong, not slow.
- **Sorting by date is requested.** Not supported at any price.
- **Search moves beyond changelog bodies** — indexing comments and annotations too would push index
  size up, and index size multiplies every search's cost.

The economics point *against* leaving early: at ~5 MB of index, Convex FTS is effectively free,
reactive, transactional, and requires no second system to operate, seed in preview deployments, or
keep in sync. The reasons to leave are all about **match quality**, and they will surface as user
feedback rather than as a bill.

**Concrete de-risking now, at zero cost:** keep the search index on its own projection table
(recommendation 1). That table is exactly the document that would be shipped to an external index
later, so the escape hatch reduces to "write the same rows to a second place" rather than a schema
migration.

---

## Open / unverified

- Whether Convex's **query result cache** suppresses `text_search_query_bytes` billing on a cache
  hit. Not determinable from the OSS backend; the metering runs inside function execution, so a true
  cache hit presumably skips it, but this was not confirmed.
- Whether documents **missing** the `searchField` (i.e. `v.optional(v.string())`) are simply not
  indexed. Not documented; assumed but unverified.
- Real Tantivy index size for this corpus — the 2–6 MB figure is an estimate from the measured 3.9 MB
  of plain text, not a measurement. Measurable exactly once a deployment exists, via the
  `current_storage_usage` log-stream event.
