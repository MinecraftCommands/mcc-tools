# Convex free-tier limits and cron constraints

Research for [#32](https://github.com/MinecraftCommands/mcc-tools/issues/32), the fact base for the
**ingestion and tiered polling** decision on the map ([#27](https://github.com/MinecraftCommands/mcc-tools/issues/27)).

Gathered 2026-08-11 from Convex's official docs, pricing page and open-source backend, plus direct
measurement of Mojang's `launchercontent.mojang.com` CDN. Every number below is either quoted from a
primary source or derived from one, with the derivation shown.

---

## TL;DR

**Recommended cadence: poll the manifest every 5 minutes, plus one daily full reconcile sweep.**

```ts
// convex/crons.ts
crons.interval("poll-manifest", { minutes: 5 }, internal.ingest.pollManifest);
crons.daily("reconcile-articles", { hourUTC: 7 }, internal.ingest.reconcileAll);
```

At that cadence, ingestion consumes **under 3% of every metered free-tier dimension**:

| Free-tier resource | Included (Free plan) | Ingestion use | % used |
| --- | --- | --- | --- |
| Function calls | 1,000,000 / month | ~26,100 | **2.6%** |
| Action compute | 20 GB-hours / month | ~0.11 GB-h | **0.5%** |
| Database I/O | 1 GB / month | ~10 MB | **1.0%** |
| Data egress | 1 GB / month | ~10 MB | **1.0%** |
| Database storage | 0.5 GB total | ~19–92 MB after full backfill | **4–18%** |
| Search storage | 0.5 GB total | ~5 MB | **~1%** |

**5 minutes is not a cost-driven choice.** Even a 1-minute cadence fits comfortably (13% of function
calls, 2% of action compute). 5 minutes is chosen because Mojang's CDN sets a **4-minute edge TTL**,
so polling faster cannot return fresher data — it just re-reads the same cached blob.

Three findings materially change the ingestion design, and are called out in
[Consequences for the design](#consequences-for-the-design):

1. Outbound `fetch` **response** bodies are **not** metered — only the outbound request bytes are.
2. Per-article `If-Modified-Since` is **useless** against Mojang's CDN — all 403 article blobs share
   one `Last-Modified`, because the whole container is re-uploaded on every publish.
3. Convex bills **whole documents** on read. The article body must not live in the same document as
   the metadata the cron scans, or the cron alone blows the 1 GB/month database I/O budget.

---

## 1. Cron constraints

| Constraint | Value | Source |
| --- | --- | --- |
| Minimum interval | **1 second** | `crons.interval()` has "seconds-level granularity"; client-side validation is `Interval must be an integer greater than 0` ([cron.ts:198](https://github.com/get-convex/convex-js/blob/main/src/server/cron.ts)) |
| Maximum number of cron jobs | **Not documented.** No published per-deployment cap. | [Limits](https://docs.convex.dev/production/state/limits) lists no cron count limit |
| Concurrent scheduled jobs (Free/Starter, S16) | **8** | Limits → Concurrent Function Executions |
| Outstanding scheduled functions | 1,000,000 | Limits → Execution time and scheduling |
| Concurrent I/O operations per function | **1,000** (a fetch counts as one) | Limits → Execution time and scheduling |
| Query / mutation execution time | **1 second** — "applies only to user code and doesn't include database operations" | Limits |
| Convex-runtime action execution time | **30 minutes** | Limits |
| Node-runtime action execution time | **10 minutes** | Limits |
| Overlap behaviour | "At most one run of each cron job can be executing at any moment. If the function scheduled by the cron job takes too long to run, following runs of the cron job may be skipped to avoid execution from falling behind." Skips are logged to the dashboard. | [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs) |
| Failure — mutations | "Once scheduled, mutations are guaranteed to be executed exactly once. Convex will automatically retry any internal Convex errors, and only fail on developer errors." | [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) |
| Failure — actions | "actions will be executed **at most once**, and permanently fail if there are transient errors while executing them. Developers can retry those manually…" | Scheduled Functions |
| Run-history retention | Scheduled function results available for **7 days** | Scheduled Functions |
| Cron identifiers | Must be unique; registering twice throws `Cron identifier registered twice` | cron.ts:289 |
| Crons available on Free plan? | **Yes** — "Crons | Yes | Yes | Yes" | [Pricing](https://www.convex.dev/pricing) feature comparison |

Two operational notes:

- **`crons.interval` restarts its clock on deploy** — "The first run occurs when the cron job is
  first deployed to Convex." A busy deploy day means more polls than the interval implies.
- **Avoid the top of the hour.** Convex explicitly recommends against `minuteUTC: 0` and ships an
  ESLint rule (`@convex-dev/no-top-of-hour-crons`) to flag it. For `crons.daily`, omit `minuteUTC`
  and let Convex spread the run across the hour.

**Consequence for us:** the poll action is at-most-once. A transient network error against Mojang's
CDN silently drops that tick. That is fine at a 5-minute cadence (the next tick recovers, since the
tick is idempotent and stateless), but it means the *backfill* must not be a single fire-and-forget
action — it needs a resumable cursor in the database so a failure resumes rather than restarts.

---

## 2. Free tier metering — actual numbers

Convex distinguishes **Free** from **Starter**. Both get identical quotas and the same S16
deployment class; the difference is only what happens at the ceiling.

> "Free and Starter share the same S16 provisioned performance tier. **Free has hard resource caps,
> while Starter can exceed its included resource amounts with usage-based pricing.**"
> — [Limits](https://docs.convex.dev/production/state/limits)

Quotas are measured **per team**, not per project: "your team's usage of a resource is calculated as
the sum of all your projects' individual usage"
([Pricing FAQ](https://www.convex.dev/pricing/faq)). Dev, preview and production deployments all
draw on the same pool.

| Resource | Free / Starter included | Starter overage rate | Notes (verbatim) |
| --- | --- | --- | --- |
| Function calls | **1,000,000 / month** | $2.20 per additional 1M | "Explicit client calls, scheduled executions, subscription updates, and file accesses count as function calls." |
| Query / mutation compute | Free | — | Only billed on dedicated deployments |
| Action compute | **20 GB-hours / month** | $0.33 / GB-hour | "Convex runtime: 64 MiB RAM. Node.js runtime: 512 MiB RAM." |
| Database storage | **0.5 GB total** | $0.22 / GB / month | "Includes database rows and indexes but not files or backups." |
| Database I/O | **1 GB / month** | $0.22 / GB | "Document and index data transferred between Convex functions and the underlying database." |
| File storage | **1 GB total** | $0.033 / GB / month | "Includes user files and backups." |
| Data egress | **1 GB / month** | $0.132 / GB | "Bandwidth used serving file downloads, **outgoing fetch requests**, and log stream egress." |
| Search storage | **0.5 GB total** | $0.55 / GB / month | "Shared by text and vector search indexes." |
| Search queries | **3,000 query-GBs / month** | $0.11 per 1,000 | "Shared by text and vector search queries." |
| Developers | 1–6 | — | |
| Deployments | 40 | — | |

Structural limits that matter for us:

| Limit | Value |
| --- | --- |
| Document size | **1 MiB** |
| Tables per deployment | 10,000 |
| Indexes per table | 32 |
| Full-text search indexes per table | 4 |
| Max FTS result set | 1,024 |
| Data read per transaction | 16 MiB |
| Documents scanned per transaction | 32,000 |
| Documents written per transaction | 16,000 |
| Concurrent queries / mutations (S16) | 16 / 16 |
| Concurrent sessions (S16) | 1,000 |

**There is no document-count limit.** Free-tier sizing is a *bytes* question, not a *rows* question.

### What happens at the ceiling: throttle, bill, or hard stop?

**Free plan — hard stop, never billed:**

> "On the Free plan, we'll send you notification emails as you approach a resource limit. If you
> exceed the resource limit for an extended period of time, **your deployment may return HTTP errors
> in response to function calls**."
> — [Pricing FAQ](https://www.convex.dev/pricing/faq)

Storage specifically:

> "After these limits are hit on the Free plan, **new mutations that attempt to commit more
> insertions or updates may fail**."
> — [Limits](https://docs.convex.dev/production/state/limits)

The failure mode is graceful in one important respect:

> "on any Convex account on any plan, **we'll never delete a record that was written to your tables
> in a mutation that returned successfully**." — Pricing FAQ

**Starter plan — billed, never stops serving:**

> "If you exceed it, metered charges may apply at the rate indicated in our pricing table above.
> Starter Plus plan deployments will always continue to serve traffic." — Pricing FAQ

**Making the stop deliberate rather than accidental.** Convex ships per-deployment
[usage limits](https://docs.convex.dev/production/usage-limits) with a **warning threshold** (logs an
event) and a **disable threshold** (hard — "the deployment is disabled for the rest of the window,
and new function calls return an error explaining that the deployment exceeded a usage limit").
Windows are calendar-based UTC, daily or monthly, and "A deployment disabled by a usage limit is
re-enabled automatically when the window rolls over." Configurable metrics include function calls,
action compute, database I/O, search queries and data egress.

Team-wide **spending limits** exist too, but "When you have an active Convex subscription" — i.e.
they are a Starter/Pro control, not a Free-plan one. On Free the hard cap *is* the plan.

**Recommendation:** stay on Free (no card, hard cap, an OSS project can't get a surprise bill), and
set a daily **disable** usage limit on the *dev* deployment only, sized at roughly 1/20th of the
monthly allowance, so an agent or a runaway loop in development cannot eat the production budget.
Leave production uncapped so a traffic spike degrades at the plan ceiling rather than at ours.

**Escape hatch if we ever outgrow it:** the Convex backend is
[open source and self-hostable](https://www.convex.dev/open-source). There is no proprietary
lock-in, so the free-tier ceiling is a cost constraint, not an architectural one.

---

## 3. Outbound HTTP from actions — is fetching Mojang metered?

**Yes, but only the request bytes, not the response bytes.** This is the single most consequential
finding for the polling design.

The docs are ambiguous — the usage-limits table lists "Data egress … Bandwidth used serving file
downloads, **outgoing fetch requests**, and log stream egress" without saying which direction is
counted. The open-source backend resolves it. In
[`crates/isolate/src/environment/action/fetch.rs`](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/environment/action/fetch.rs),
the fetch handler computes both a `request_size` and a `response_size`, logs both — and meters only
one:

```rust
self.usage_tracker.track_fetch_egress(origin, request_size);
```

And in [`crates/usage_tracking/src/lib.rs`](https://github.com/get-convex/convex-backend/blob/main/crates/usage_tracking/src/lib.rs):

```rust
/// Only track egress - because AWS only charges egress
pub fn track_fetch_egress(&self, url: String, egress: u64) { … }
```

**A `GET` of Mojang's 250 KB manifest costs us roughly the size of the request headers — call it
500 bytes — not 250 KB.** A naive assumption that response bodies count would have made a 5-minute
manifest poll cost `8,640 × 250 KB = 2.16 GB/month`, i.e. 216% of the free egress allowance. It
actually costs `8,640 × 500 B ≈ 4.3 MB`, **0.43%**.

Two caveats:

- This applies to the **Convex runtime**. Node-runtime actions meter via a different path
  (`track_fetch_egress("node_actions", node_outcome.egress_bytes)`) whose contents I could not
  confirm from the source. **Do the ingestion fetch in the Convex runtime, not `"use node"`** — it
  is also 8× cheaper on action compute (64 MiB vs 512 MiB RAM).
- This is undocumented implementation detail, not a contract. It could change. The recommendation
  below is comfortable at 1-minute cadence even under the pessimistic reading, so nothing breaks if
  it does.

A `fetch` is **not** a function call — it counts against the per-function concurrent-I/O limit
(1,000), not the 1M/month function-call budget. Fanning out 403 fetches inside a single action costs
**one** function call.

---

## 4. Storage — how many articles and revisions fit?

### Measured source data (2026-08-11)

Direct measurement of `https://launchercontent.mojang.com/v2/`:

| Measurement | Value |
| --- | --- |
| Manifest (`javaPatchNotes.json`) uncompressed | **249,726 bytes** |
| Manifest gzipped over the wire | **67,294 bytes** |
| Entries in the v2 manifest | **403** (359 snapshot, 44 release) |
| Date range | 2018-07-18 → 2026-08-04 (8.05 years → **~50 new articles/year**) |
| Article JSON, mean / median / max (n=40) | **15.7 KB / 10.2 KB / 121 KB** |
| Article `body` HTML, mean / median / max | **15.3 KB / 9.6 KB / 120 KB** |

Note the discrepancy with the ticket's brief: the v2 manifest carries **403** articles today, not
800–1000. The sizing below is given per-article so it holds either way, with 1,000 used as the
pessimistic case.

### Cost per stored revision

We store the *processed* body (sanitized, list-nesting fixed, headings id'd, syntax-highlighted) plus
a section tree and extracted plain text. Syntax highlighting with CSS-variable output is the main
inflator. Three scenarios against the measured 15.3 KB mean body:

| Scenario | Multiplier | Bytes / revision |
| --- | --- | --- |
| Lean (light markup, little code) | 1.5× | ~23 KB |
| Mid (realistic) | 3× | ~46 KB |
| Fat (code-heavy, verbose highlighter output) | 6× | ~92 KB |

### One revision of everything

| Corpus | Lean | Mid | Fat |
| --- | --- | --- | --- |
| 403 articles (actual) | 9.2 MB (1.8%) | 18.5 MB (3.6%) | 37 MB (7.2%) |
| 1,000 articles (pessimistic) | 23 MB (4.5%) | 46 MB (9.0%) | 92 MB (18%) |

Percentages are of the 512 MB database-storage cap.

### How many revisions fit

Reserving **half** the 512 MB for annotations, comments, users, system tables and index overhead
leaves **256 MB** for article revisions:

| Scenario | Total revisions in 256 MB | Revisions per article @ 1,000 articles | @ 403 articles |
| --- | --- | --- | --- |
| Lean (23 KB) | 11,130 | **11.1** | 27.6 |
| Mid (46 KB) | 5,565 | **5.6** | 13.8 |
| Fat (92 KB) | 2,782 | **2.8** | 6.9 |

Using the *whole* 512 MB roughly doubles those figures.

**Verdict: "keep every revision indefinitely" is affordable, but it is not unbounded.** The realistic
budget is **single-digit revisions per article**. Given that Mojang article edits are rare and
usually confined to the newest article in the hours after publication, that is comfortable — but it
is a ceiling worth knowing about, not headroom to spend freely.

### The growth rate is negligible; the backfill dominates

At ~50 new articles/year, assume 2 revisions each plus ~20 late edits to older articles:
~120 new revisions/year × 46 KB = **~5.5 MB/year**. Against a 256 MB reserve that is roughly
**45 years of runway** once the backfill has landed. The one-time backfill is essentially the whole
storage bill.

### The one thing that breaks the storage budget: `processorVersion` re-processing

The map's standing decision requires "a `processorVersion` and a re-process path". If a
`processorVersion` bump writes a **new revision** for every article, each bump costs another full
corpus:

- +46 MB per bump at 1,000 articles (mid) — **5 bumps consumes the entire 256 MB reserve.**

**Re-processing must overwrite the processed body in place**, keyed on the *source* content hash. A
revision should be created only when Mojang's source content changes, never when our processor
changes. Otherwise storage multiplies by the number of processor versions we ever ship — and
`processorVersion` will get bumped far more often than Mojang edits articles.

The write cost of an in-place re-process is bounded and affordable: 1,000 × 46 KB read + written
= **~92 MB, or 9% of the monthly 1 GB database I/O**. Roughly ten full re-processes per month fit.

### Search storage is a separate bucket

Full-text search indexes draw on the **separate 0.5 GB search-storage allowance**, not the 0.5 GB
database allowance. Extracted plain text runs ~0.3× the body (~4.6 KB/article), so 1,000 articles
index to **~4.6 MB, under 1%** of the search allowance. Search storage is not a constraint. Search
*queries* are metered separately again (3,000 query-GBs/month) and are a read-path concern, out of
scope here.

---

## 5. Sizing the schedule — the arithmetic

All figures per 30-day month = **43,200 minutes = 720 hours**. (A 31-day month is 44,640 minutes;
add 3.3% to everything.)

### Ticks per month

| Interval | Ticks / month |
| --- | --- |
| 1 minute | 43,200 |
| 2 minutes | 21,600 |
| **5 minutes** | **8,640** |
| 10 minutes | 4,320 |
| 15 minutes | 2,880 |
| hourly | 720 |
| daily | 30 |

### Function calls (budget 1,000,000 / month)

A tick is one action (the poll) plus, worst case, one query and one mutation to read and update
ingestion state — **budget 3 calls/tick**. Fetches are not function calls.

| Interval | Calls / month | % of 1M |
| --- | --- | --- |
| 1 minute | 43,200 × 3 = 129,600 | 13.0% |
| 2 minutes | 21,600 × 3 = 64,800 | 6.5% |
| **5 minutes** | **8,640 × 3 = 25,920** | **2.6%** |
| 10 minutes | 4,320 × 3 = 12,960 | 1.3% |

Plus the daily sweep: `30 × 5 = 150` calls, **0.015%**.

Function calls are not the constraint on cadence. They are the constraint on the *site*, because
**"subscription updates … count as function calls"** — every re-run of a live Convex query, for
every connected client, is a call. At the 5-minute cadence ingestion leaves **~974,000 calls/month
≈ 32,000/day** for readers. That is what will actually run out first, and it is the reason the map's
PPR decision (static article body, live islands only for comments and non-inline annotations) is
load-bearing on cost, not just on UX.

### Action compute (budget 20 GB-hours / month)

Convex runtime = 64 MiB = **0.0625 GB**. Billed on **wall-clock** duration — the backend records
`duration` as "Total wall-clock time from the start of executing a request to its completion", and
CPU-time pricing is a Business/Enterprise-only feature per the pricing comparison table.

**Total action wall-clock available: 20 ÷ 0.0625 = 320 hours/month** (out of 720 — a 44% duty
cycle). One continuously-running action would exhaust it; short ticks will not.

Assume **0.5 s** wall clock for a tick that gets a `304`:

- GB-hours per tick = `(0.5 / 3600) × 0.0625` = **8.68 × 10⁻⁶ GB-h**

| Interval | GB-hours / month | % of 20 |
| --- | --- | --- |
| 1 minute | 0.375 | 1.9% |
| 2 minutes | 0.188 | 0.9% |
| **5 minutes** | **0.075** | **0.4%** |

Daily full sweep at 60 s wall clock: `30 × (60/3600) × 0.0625` = **0.031 GB-h, 0.16%**.

In the **Node runtime** (512 MiB = 0.5 GB) every figure above is **8× worse** — a 1-minute cadence
becomes 3 GB-h (15%). Another reason to stay in the Convex runtime.

### Data egress (budget 1 GB / month) — outbound request bytes only

~500 B per outbound conditional `GET`:

| Interval | Egress / month | % of 1 GB |
| --- | --- | --- |
| 1 minute | 21.6 MB | 2.2% |
| **5 minutes** | **4.3 MB** | **0.43%** |

Daily full sweep of 403 articles: `30 × 403 × 500 B` = **6.0 MB, 0.6%**.

### Database I/O (budget 1 GB / month) — the metric that actually constrains cadence

This is where a naive implementation dies. Three designs, all at the **same** 5-minute cadence:

| Design | Bytes / tick | I/O / month @ 5 min | % of 1 GB |
| --- | --- | --- | --- |
| **A. One tiny state doc** (ETag + `lastCheckedAt`, ~250 B each way) | 500 B | **4.3 MB** | **0.43%** ✅ |
| **B. One fat state doc** holding 1,000 content hashes (~100 KB) | 100 KB | 864 MB | 86% ⚠️ |
| **C. `.collect()` the articles table** (1,000 × 46 KB) | 46 MB | 389 GB | 38,880% ❌ |

Design B is already fatal at a 2-minute cadence (`21,600 × 100 KB` = **2.16 GB, 216%**). Design C is
fatal at any cadence — over the budget by four orders of magnitude.

Design A at every cadence:

| Interval | I/O / month | % of 1 GB |
| --- | --- | --- |
| 1 minute | 21.6 MB | 2.2% |
| 2 minutes | 10.8 MB | 1.1% |
| **5 minutes** | **4.3 MB** | **0.43%** |

Daily reconcile sweep, reading a **narrow** `articleHashes` table (1,000 × ~120 B = 120 KB):
`30 × 120 KB` = **3.6 MB, 0.36%**. Reading **full article documents** instead
(1,000 × 46 KB = 46 MB): `30 × 46 MB` = **1.35 GB, 135% — fatal**.

**The rule that falls out: the steady-state tick must touch a constant, tiny number of bytes,
independent of corpus size.** Cadence is cheap; scanning is not.

---

## 6. Measured facts about Mojang's CDN that set the cadence

Measured 2026-08-11 against `https://launchercontent.mojang.com/v2/`.

**The CDN caches for 4 minutes.** Both the manifest and every article blob return:

```
Cache-Control: public, max-age=240
```

Polling faster than 4 minutes cannot surface fresher data — it re-reads the same edge-cached object.
This, not free-tier cost, is what sets the floor.

**Conditional GET on the manifest works.** `If-Modified-Since` against the manifest's `Last-Modified`
returned `304` with a 0-byte body. Verified.

**But per-article `If-Modified-Since` is worthless.** Every blob in the container shares one
`Last-Modified`:

| Article | Published | `Last-Modified` |
| --- | --- | --- |
| `26.3-snapshot-7` | 2026-08-04 | Mon, 10 Aug 2026 16:02:37 GMT |
| `25w41a` | 2025-10-09 | Mon, 10 Aug 2026 16:02:36 GMT |
| `20w09a` | 2020-02-26 | Mon, 10 Aug 2026 16:02:37 GMT |
| `1.13` | **2018-07-18** | Mon, 10 Aug 2026 16:02:36 GMT |

An article from 2018 reports the same modification time as one from last week: **Mojang re-uploads
the entire container on every publish.** After any publish, 403 conditional GETs would all return
`200` with full bodies. The `ETag` (`0x8DEF6F8C5AD9E3A`) is an Azure blob upload-sequence token, not
a content hash, so it inherits the same problem.

**This directly qualifies the map's standing decision** that "`If-Modified-Since` short-circuits
re-fetches". It short-circuits the *manifest* fetch, which is the one that matters at high cadence —
but it does nothing for per-article fetches. Only a content hash detects real change.

**Useful compensations:**

- The manifest carries `Content-MD5: 7KcsvZXEYM2M50RWkv0Ksg==` — a **true content hash**. Comparing
  it gives a byte-exact "did anything change anywhere?" gate even when the `ETag` has churned.
- `contentPath` is an opaque 64-hex identifier
  (`javaPatchNotes/50a6e5c5d834b50e…d1b2.json`). I confirmed it is **not** the SHA-256 of the file,
  the body, or the canonicalised JSON, so I could not verify whether it changes when a body is
  edited. Treat it as a *hint* that an article changed, never as proof that one did not — which is
  precisely why the daily reconcile sweep exists as a backstop.

---

## 7. Recommended schedule

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fast path: one conditional GET of the manifest. 8,640 runs/month.
crons.interval("poll-manifest", { minutes: 5 }, internal.ingest.pollManifest);

// Backstop: full corpus hash reconcile. 30 runs/month.
// minuteUTC omitted deliberately - Convex spreads the run across the hour.
crons.daily("reconcile-articles", { hourUTC: 7 }, internal.ingest.reconcileAll);

export default crons;
```

**`pollManifest`, per tick:**

1. Read one tiny `ingestState` document (ETag, `Last-Modified`, `Content-MD5`, `lastCheckedAt`).
2. Conditional `GET` the manifest. `304` → update `lastCheckedAt`, return. This is the overwhelmingly
   common path: ~500 B egress, ~500 B database I/O, ~0.5 s of a 64 MiB action.
3. `200` → compare `Content-MD5`. Unchanged → store the new ETag and return without parsing.
4. Changed → parse, diff each entry's `contentPath` against the stored per-version hash, and fetch
   **only** the entries that differ. Hash each fetched body; write a revision only if the *content*
   hash changed.

**`reconcileAll`, daily:** fetch all 403 article bodies (one action, one function call, ~403
concurrent I/O against the 1,000 limit), hash each, compare against the narrow `articleHashes` table,
and write revisions for any drift the manifest diff missed. ~60 s wall clock, 0.16% of action
compute, 0.6% of egress, 0.36% of database I/O.

### Why 5 minutes and not 2, or 1

Cost does not decide this — 1-minute polling fits the free tier at 13% of function calls and 1.9% of
action compute. Three things decide it:

- **The CDN's 4-minute TTL.** Anything under 4 minutes is guaranteed to re-read a cached object at
  least half the time. 5 minutes is the smallest round interval strictly above the TTL, so nearly
  every poll can observe fresh data.
- **Worst-case staleness is 4 + 5 = 9 minutes** for a new Mojang snapshot. For a changelog reference
  site that is well inside acceptable.
- **Politeness.** 8,640 conditional requests/month to a third party we do not pay is defensible;
  43,200 requests that mostly re-read a cached blob is not.

If freshness ever needs to be tighter, **2 minutes is affordable** (6.5% of function calls, 0.9% of
action compute, 1.1% of database I/O) and buys a 6-minute worst case. Below 2 minutes there is
nothing left to buy.

### Tiering the older articles

The map calls for "older articles rarely or never" polled. The measurements support going further:
**never poll individual older articles on a schedule at all.** The manifest diff covers new articles
and any article whose `contentPath` moves, and the daily sweep covers everything else at a cost of
0.36% of database I/O. A per-article tier would add cost without adding coverage.

---

## Consequences for the design

Three findings should propagate into the ingestion and schema tickets:

1. **The article body must live in its own document, separate from ingestion metadata.** Convex has
   no column projection — `db.get` and `db.query` bill the whole document, and "All results returned
   from `.collect` count towards database bandwidth (even ones filtered out by `.filter`)"
   ([Best Practices](https://docs.convex.dev/understanding/best-practices)). A narrow
   `articleHashes` (or equivalent) table is what makes the daily sweep cost 3.6 MB/month instead of
   1.35 GB/month. This is a hard requirement, not an optimisation.

2. **`processorVersion` re-processing must overwrite in place, not create a revision.** A revision
   means "Mojang's source changed". Otherwise storage multiplies by the number of processor versions
   we ship, and five bumps consume the entire storage reserve.

3. **`If-Modified-Since` only helps on the manifest.** The map's standing decision should be narrowed
   to say so. Per-article change detection is a content hash, full stop, because Mojang re-touches
   every blob in the container on every publish.

Two smaller ones:

4. **Do the ingestion fetch in the Convex runtime, not `"use node"`** — 8× cheaper action compute,
   and the metering behaviour of outbound fetches is confirmed only for the Convex runtime.

5. **The 1M function-call budget is spent by readers, not by the cron.** "Subscription updates count
   as function calls", so every live Convex query re-run for every connected client is billed. The
   PPR boundary (static body, live islands only where liveness is genuinely required) is a cost
   decision as much as a UX one.

---

## Sources

All accessed 2026-08-11.

- [Convex — Limits](https://docs.convex.dev/production/state/limits)
- [Convex — Pricing](https://www.convex.dev/pricing)
- [Convex — Pricing FAQ](https://www.convex.dev/pricing/faq)
- [Convex — Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs)
- [Convex — Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex — Usage Limits](https://docs.convex.dev/production/usage-limits)
- [Convex — Teams (spending limits)](https://docs.convex.dev/dashboard/teams/teams)
- [Convex — Best Practices](https://docs.convex.dev/understanding/best-practices)
- [Convex — Crons API reference](https://docs.convex.dev/api/classes/server.Crons)
- [Convex — Open Source / self-hosting](https://www.convex.dev/open-source)
- [`convex-js` — `src/server/cron.ts`](https://github.com/get-convex/convex-js/blob/main/src/server/cron.ts) (interval validation)
- [`convex-backend` — `crates/isolate/src/environment/action/fetch.rs`](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/environment/action/fetch.rs) (fetch egress metering)
- [`convex-backend` — `crates/usage_tracking/src/lib.rs`](https://github.com/get-convex/convex-backend/blob/main/crates/usage_tracking/src/lib.rs) (`track_fetch_egress`, wall-clock duration)
- Direct measurement of `https://launchercontent.mojang.com/v2/javaPatchNotes.json` and 40 sampled
  article blobs, 2026-08-11.
