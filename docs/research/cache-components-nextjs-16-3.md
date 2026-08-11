# Cache Components in Next.js 16.3

Research for [#30](https://github.com/MinecraftCommands/mcc-tools/issues/30), the fact base for the
rendering-and-caching architecture decision on the [#27](https://github.com/MinecraftCommands/mcc-tools/issues/27) map.

**Researched:** 2026-08-11. **Docs version at time of reading:** Next.js `16.3.0`.
**Repo currently on:** `next@16.0.3`.

Sources are Next.js official docs (`nextjs.org/docs`, each page reports the `16.3.0` doc version and a
`lastUpdated` date), the Next.js blog, and Vercel's own docs. Every claim below carries its source link.

---

## 1. The primitives, and what is stable vs experimental

### The flag

`cacheComponents: true` is a **top-level `next.config.ts` option, not under `experimental`**. It was
introduced in 16.0.0 and it subsumes three previously separate experimental flags:

> `cacheComponents` introduced. This flag controls the `ppr`, `useCache`, and `dynamicIO` flags as a
> single, unified configuration.
> — [cacheComponents version history](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)

It is **opt-in but not experimental**. The 16.3 blog states the intent plainly:

> This flag enables those new behaviors, and it will become a default in a future major version of Next.js.
> — [Next.js 16.3: Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations)

`cacheComponents` **requires the Node.js runtime**. `runtime = 'edge'` route exports must be removed
([cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)).
Not supported for static export
([use cache platform support](https://nextjs.org/docs/app/api-reference/directives/use-cache#platform-support)).

### The directives

There are **three** cache directives in 16.3, not one. All three ship with Cache Components and all were
introduced in 16.0.0.

| Directive | Server storage | Scope | Can read cookies/headers directly | Persists across deploys |
|---|---|---|---|---|
| `'use cache'` | in-memory LRU (or a configured handler) | shared, all users | No | No |
| `'use cache: remote'` | remote cache handler | shared, all users | No | No |
| `'use cache: private'` | none (browser only) | per-client | **Yes** | n/a |

— [use cache: remote comparison table](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote#how-use-cache-remote-differs-from-use-cache-and-use-cache-private)

`"use cache"` itself: introduced experimentally in `v15.0.0`, enabled via Cache Components from `v16.0.0`
([version history](https://nextjs.org/docs/app/api-reference/directives/use-cache#version-history)).

**The `use cache` default is in-memory and ephemeral on serverless.** This is the single most important
correction to the "obvious" mental model:

> **Serverless**: Cache entries typically don't persist across requests (each request can be a different
> instance), or during revalidation. Build-time caching works normally.
> — [Runtime caching considerations](https://nextjs.org/docs/app/api-reference/directives/use-cache#runtime-caching-considerations)

`use cache` is primarily a **prerender/static-shell declaration**, not a runtime data cache. If you want a
durable shared runtime cache you must opt into `'use cache: remote'`, which on Vercel is backed by
[Vercel Runtime Cache](https://vercel.com/docs/runtime-cache) and is **billed**.

**Nothing carries across deploys.** The cache key includes the build id (or `deploymentId`), so a new
deployment starts from an empty cache — including `remote` entries. This is deliberate: the function
identity hash or return shape may have changed
([persistence across deploys](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote#persistence-across-deploys)).

### `cacheLife`

Called **inside** a cache scope, never at module scope (throws). Accepts a preset name, a custom profile
name from `next.config.ts`, or an inline object. Presets
([cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife#preset-cache-profiles)):

| Profile | `stale` | `revalidate` | `expire` |
|---|---|---|---|
| `default` | 5 min | 15 min | never |
| `seconds` | 30 s | 1 s | 1 min |
| `minutes` | 5 min | 1 min | 1 h |
| `hours` | 5 min | 1 h | 1 d |
| `days` | 5 min | 1 d | 1 w |
| `weeks` | 5 min | 1 w | 30 d |
| `max` | 5 min | 30 d | 1 y |

Note `max` is **1 year, not infinite** — `expire: 1y`. For "cache this near-permanently" you want an inline
profile with a longer `expire`, or a redefined `max` in config.

Semantics: `stale` = client router freshness; `revalidate` = server background refresh interval; `expire` =
after this long with no traffic the next request blocks on a synchronous regeneration. `expire` must exceed
`revalidate` or Next.js errors.

Built-in profile names can be **redefined** in `next.config.ts`, including `default` and `max`. The
`cacheLife` TypeScript signature is generated from `next.config.ts` during `next dev` / `next build` /
`next typegen`, so autocomplete reflects your overrides.

### `cacheTag`

Called inside a cache scope. Takes one or more strings. **Tags may be computed at runtime from data fetched
inside the cached function** — the docs show exactly that pattern
([Creating tags from external data](https://nextjs.org/docs/app/api-reference/functions/cacheTag#creating-tags-from-external-data)).

Limits: **128 tags per `cacheTag()` call, 256 characters per tag.** Over-length tags are skipped, tags past
the 128th are dropped, both with a console warning. Tags are idempotent and case-sensitive.

### What Cache Components *removes*

Enabling the flag makes these route segment configs **error at build**:

- `dynamic` (`force-dynamic` / `force-static`) — everything is dynamic by default now; use `use cache` for the static side
- `revalidate` — replaced by `cacheLife`
- `fetchCache` — unnecessary; fetches inside a cache scope are cached
- `dynamicParams` — **not supported**, "Route segment config `dynamicParams` is not compatible with `nextConfig.cacheComponents`"
- `experimental_ppr` and `experimental.ppr` — removed entirely
- `runtime = 'edge'` — not supported

— [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components)

**Direct hit on our repo:** the `force-dynamic` hack (issue #4) is deleted, not migrated — it becomes a
build error under the flag. Note there are **two** occurrences, not one: `src/app/java/changelog/page.tsx:9`
(the one the map records, at line 9 rather than 8) and `src/app/about/advanced/page.tsx:12`. Both `use cache`
call sites in `src/lib/fetch.ts` and `src/server/highlighting/mcfunction.ts` keep working during migration.

`unstable_noStore()` is also unnecessary — nothing is cached unless you say so.

### Escape hatch: `export const instant = false`

16.3 added an opt-out per segment. It marks a segment as *allowed to block*; it does **not** force dynamic
rendering, and it does **not** silence synchronous-IO prerender errors (`new Date()`, `Math.random()`,
`crypto.randomUUID()` still fail the build). There is a codemod (`npx @next/codemod@canary
cache-components-instant-false ./src/app`) to apply it everywhere for an incremental migration.

Vercel also ships an adoption agent skill: `npx skills add vercel/next.js --skill next-cache-components-adoption`.

---

## 2. External invalidation from Convex

**Short answer: yes, and there are three viable mechanisms. The best one for a Convex cron is Vercel's REST
API, which needs no Next.js code at all.**

### Option A — Vercel REST API (recommended for an external cron)

```http
POST /v1/edge-cache/invalidate-by-tags?projectIdOrName=<id>&teamId=<id>
Authorization: Bearer <vercel token>
Content-Type: application/json

{ "tags": ["article-1-21-4"], "target": "production" }
```

— [REST API: invalidate-by-tag](https://vercel.com/docs/rest-api/reference/endpoints/edge-cache/invalidate-by-tag)

Crucially:

> When you purge by cache tag, Vercel purges all three types of cache: CDN cache, Runtime Cache, and Data
> Cache. This ensures your content updates consistently across all layers.
> — [Purging Vercel CDN Cache](https://vercel.com/docs/cdn-cache/purge#understanding-cache-purging)

and the same page explicitly lists `cacheTag()` from `next/cache` as one of the ways to attach a purgeable
tag. So a tag set with `cacheTag('article-1-21-4')` is purgeable from outside the app entirely.

Limits: **16 tags per bulk REST call**, 256 chars per tag, 128 tags per cached response. Tags are scoped to
project + environment; `target` is optional and defaults to all environments. Tags must not contain commas.

Also available as `vercel cache invalidate --tag <tag>` via CLI.

### Option B — a Route Handler that calls `revalidateTag`

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  // verify a shared secret from Convex first
  revalidateTag(tag, 'max')
  return Response.json({ ok: true })
}
```

`revalidateTag` works in **Server Functions and Route Handlers** (not Client Components, not Proxy). The
signature changed in 16.x:

```ts
revalidateTag(tag: string, profile: string | { expire?: number }): void
```

> The single-argument form `revalidateTag(tag)` is deprecated. It currently works if TypeScript errors are
> suppressed, but this behavior may be removed in a future version.
> — [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)

- `'max'` — stale-while-revalidate. **Recommended.**
- `{ expire: 0 }` — immediate expiry, next request blocks. The docs call this out as the pattern for
  webhooks and external systems that need immediate expiration.

The docs recommend exactly this shape for our use case:

> When content doesn't need time-based revalidation, for example data from a CMS, use `cacheTag` and a long
> `cacheLife` like `max` to keep it in the static shell. Configure the content source to trigger a webhook,
> or other notification, that calls `revalidateTag` when the content changes.
> — [Revalidating: what should I cache?](https://nextjs.org/docs/app/getting-started/revalidating#what-should-i-cache)

### Option C — `updateTag`: NOT available to us

`updateTag` is the read-your-own-writes API. It **can only be called from a Server Action** — calling it
elsewhere throws. So a Convex cron cannot use it.

| | `updateTag` | `revalidateTag` |
|---|---|---|
| Where | Server Actions only | Server Actions **and** Route Handlers |
| Behavior | Immediately expires cache | Stale-while-revalidate |
| Use case | Read-your-own-writes | Background refresh |

— [Revalidating](https://nextjs.org/docs/app/getting-started/revalidating#updatetag)

**Consequence for the map's annotation-promotion rule:** promoting an annotation happens in a Server Action
(a signed-in user with an elevated Discord role clicks a button), so `updateTag` *is* available there and is
the right call — the promoter should see their change immediately. Cron-driven article updates use
`revalidateTag`/REST. Two different APIs for the two paths in the map.

### Latency and consistency on Vercel

The headline number, from Vercel's ISR docs:

> **Globally consistent purging**: When you revalidate content, all caches across all regions update within
> 300ms. Vercel purges HTML and data payloads together, so users see consistent content across full page
> loads and client-side transitions.
> — [Incremental Static Regeneration](https://vercel.com/docs/incremental-static-regeneration#benefits-of-vercels-cdn-for-isr)

The same 300ms figure is repeated for Runtime Cache `expireTag`
([@vercel/functions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#getcache)).

Other characteristics worth recording:

- **Invalidation is lazy, not eager.** `revalidateTag` marks entries stale; regeneration happens on the next
  visit to a page carrying that tag. Next.js says so explicitly: "calling `revalidateTag` will not
  immediately trigger many revalidations at once."
- **Not read-your-writes across the boundary.** With `'max'`, the first request after a purge gets the
  *stale* body and triggers a background refresh; the *second* request gets the new one. If we need
  first-read-fresh from an external trigger, use `{ expire: 0 }` and accept a blocking regeneration.
- **Request collapsing.** Vercel collapses concurrent requests for the same uncached path into one function
  invocation per region.
- **Failure handling.** If revalidation fails (network error, status outside 200/301/302/307/308/404/410,
  or a function crash) Vercel keeps serving the stale content and sets a 30-second TTL to retry.
- **Durability.** The ISR cache "persists content for 31 days, or until you revalidate it," scoped per
  deployment. Rollbacks keep the old deployment's cache.
- **Client-side cache is bypassed on purge.** Calling `revalidateTag` / `revalidatePath` / `updateTag` /
  `refresh` from a Server Action clears the entire client cache immediately, bypassing `stale`.
- **Subdomains are separate.** "if you trigger on-demand revalidation for `example-domain.com/example-page`,
  Vercel won't revalidate `sub.example-domain.com/example-page`."

**One caveat to verify before relying on it.** Vercel's `@vercel/functions` page says the raw *Runtime Cache
API* "does not have first class integration with ISR", and that "Next.js's `revalidatePath` and
`revalidateTag` API does not invalidate the Runtime Cache." That statement is about the low-level
`getCache()` API, and it sits in tension with the CDN-purge page's claim that a tag purge hits all three
cache layers. If we adopt `'use cache: remote'`, confirm empirically that `revalidateTag` reaches those
entries. For plain `'use cache'` (in-memory + prerendered HTML) the question doesn't arise.

---

## 3. Partial prerendering interaction

**PPR is no longer a separate feature.** From the config reference:

> Additionally, `cacheComponents` implements **Partial Prerendering (PPR)** as the default behavior in the
> App Router. This means the `experimental.ppr` configuration flag and the `experimental_ppr` route segment
> configuration are no longer necessary and have been removed.
> — [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)

### What lands in the static shell

At build time Next.js renders the whole tree, and each component's fate depends on what it touches
([Prerendering](https://nextjs.org/docs/app/getting-started/caching#prerendering)):

| Component does | Result |
|---|---|
| `use cache` with a non-short lifetime | Result is cached and **included in the static shell** |
| Module imports, `fs.readFileSync`, pure computation | Completes during prerender, **included automatically** |
| Uncached async read, wrapped in `<Suspense>` | **Fallback** ships in the shell; content streams at request time |
| `cookies()` / `headers()` / `searchParams` / `params`, wrapped in `<Suspense>` | **Fallback** ships in the shell |
| `Math.random()` / `Date.now()` / `crypto.randomUUID()` | **Build error** unless preceded by `connection()` inside `<Suspense>`, or wrapped in `use cache` |

The shell is "HTML for initial page loads and a serialized RSC Payload for client-side navigation," and can
be served straight from a CDN without hitting the origin.

**Short lifetimes silently fall out of the shell.** A cache is "short-lived" and excluded from prerenders
when it uses the `seconds` profile, `revalidate: 0`, or `expire` under 5 minutes; it becomes a dynamic hole
instead. `stale` under 30 s also excludes it (a prefetch would expire before the click). `stale` between 30 s
and 5 min is included in prerenders but excluded from the App Shell. Of the presets only `seconds` trips
any of these ([Prerendering behavior](https://nextjs.org/docs/app/api-reference/functions/cacheLife#prerendering-behavior)).

### Is `<Suspense>` required?

**Yes, around every uncached or runtime-dependent read**, but the enforcement is graded:

- Omitting it surfaces a **blocking-route insight** in the dev overlay and dev-server console. Insights do
  *not* show up in the HTTP response — "An offending route still returns `200` with rendered HTML in dev."
  You can also query them via the [MCP `get_errors` tool](https://nextjs.org/docs/app/guides/mcp).
- Reading `cookies()` / `headers()` / `searchParams` outside a boundary raises the
  [`blocking-prerender-runtime`](https://nextjs.org/docs/messages/blocking-prerender-runtime) insight.
- Calling `cookies()`/`headers()` *inside* `use cache` is a hard error:
  [`next-request-in-use-cache`](https://nextjs.org/docs/messages/next-request-in-use-cache). The restriction
  follows the call stack, so a helper that reads them fails the same way. On a dynamically rendered route
  this can pass `next build` and only fail under `next start`.
- Client hooks that read the route (`usePathname`, `useParams`, `useSelectedLayoutSegment(s)`) suspend when
  params aren't known and **fail the build** if not wrapped. `useSearchParams` always needs a boundary.

Note the subtlety: `<Suspense>` does not itself make anything dynamic. "If a component only performs
synchronous work, it will complete during prerendering regardless of whether it is wrapped in `<Suspense>`."

Also: 16.3 extended validation from *direct visits* to *client navigations*, with an `instant()` Playwright
helper (`@next/playwright`) and a Navigation Inspector in DevTools.

### Can a cached component sit inside a dynamic page?

Yes — that's the whole point. The docs' canonical example has static header + `use cache` blog list (both in
the shell) + a `<Suspense>`-wrapped cookie reader (streams). "Reading `cookies()` here doesn't opt-in the
whole route into dynamic rendering, the way the previous rendering model did."

### `params` and `searchParams`

Both are **promises**, and awaiting them at the top of a page or layout ties the shell to one URL and
prevents App Shell generation. The prescribed pattern is to pass the promise down into a `<Suspense>`-wrapped
child and await it there, or unwrap with `.then()` inline:

```tsx
export default function Page({ params }: PageProps<'/java/changelog/[version]'>) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <Article params={params} />
    </Suspense>
  )
}
```

The ISR guide adds a sharp note: keep the read inside the boundary **even for params `generateStaticParams`
covers**, because "a statically known param still belongs to one URL, so awaiting it above the Suspense
boundary would tie this layout's App Shell to that URL."

Inside `use cache`, params passed as arguments become part of the cache key. Root params are special-cased:
"only the ones it actually reads become part of its cache key."

### `generateStaticParams` and ISR

- **Returning `[]` now errors** ([`empty-generate-static-params`](https://nextjs.org/docs/messages/empty-generate-static-params)).
  It must return at least one param so Next.js can validate a non-empty static shell.
- Unlisted params are still served: they get the **App Shell** (the URL-independent part of the prerender)
  instantly, then Next.js upgrades in the background with the now-known params; the next visitor gets the
  upgraded result from cache. A prefetch counts as that first visit.
- **This App Shell behaviour is new in 16.3**: "The App Shell for unlisted params is served from Next.js
  16.3. Earlier versions wait for a full server render before sending the response."
- ISR-with-Cache-Components requires **both** `cacheComponents: true` and `partialPrefetching: true`
  ([ISR with Cache Components](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components)).
- Params resolve in route order; an unresolved parent param blocks deeper params from upgrading.

`partialPrefetching` also changes prefetching from per-link to **one reusable shell per route**, cached on
the client for the session. `<Link prefetch={true}>` opts back into per-link prefetching, which costs one
server invocation per prefetchable link.

### Bots and crawlers — a real risk for us

> Bots and crawlers are detected by their user agent and handled differently: because they need a complete
> document, Next.js **skips the shell and renders the entire page dynamically at request time**.
> — [Bots and crawlers](https://nextjs.org/docs/app/getting-started/caching#bots-and-crawlers)

> If part of your shell depends on inputs that only exist while prerendering, such as build-time data or
> values that are not reachable in the request-time environment, a page that loads for a person can fail to
> render for a crawler.

For a public reference site this matters: our shell must be reproducible at request time.

---

## 4. Per-entry cache lifetimes

**Yes. This is directly supported and documented.** Different instances of `/java/changelog/[version]` can
carry different lifetimes, computed at runtime from the fetched data, via an **inline cache profile object**:

```ts
import { cacheLife, cacheTag } from 'next/cache'

async function getPostContent(slug: string) {
  'use cache'

  const post = await fetchPost(slug)
  cacheTag(`post-${slug}`)

  if (!post) {
    cacheLife('minutes')
    return null
  }

  // Use cache timing from CMS data directly as an object
  cacheLife({
    revalidate: post.revalidateSeconds ?? 3600,
  })

  return post.data
}
```

— [Using dynamic cache lifetimes from data](https://nextjs.org/docs/app/api-reference/functions/cacheLife#using-dynamic-cache-lifetimes-from-data)

That is almost exactly the mcc-tools shape: a two-year-old changelog article can compute
`cacheLife({ revalidate: 60*60*24*365, expire: ... })` while the newest computes `cacheLife('minutes')`,
from the same function, on the same route.

Two rules constrain it:

1. **Exactly one `cacheLife` call must execute per invocation.** "You can call it in different control flow
   branches, but only one should run per request."
2. Omitted properties in an inline object **inherit from the `default` profile** — so
   `cacheLife({ revalidate: N })` silently keeps `stale: 5min` and `expire: never`. Be explicit.

### Nesting rules (a trap)

- Outer scope **with** an explicit `cacheLife`: its own lifetime wins, longer or shorter than inner ones.
- Outer scope **without** one: uses `default` (15 min revalidate). A shorter inner cache **reduces** the
  outer to its own lifetime; a longer inner cache **cannot extend** it past `default`.
- A short-lived cache nested in an outer `use cache` with **no** explicit `cacheLife` is a **prerender-time
  error** — because the outer would silently become short-lived by propagation. The nested cache may be in
  an imported module or a third-party dependency.

Practical takeaway: **set an explicit `cacheLife` in every scope.** The docs recommend it on four separate
pages.

---

## 5. `unstable_cache`

**Coexisting, superseded, not removed.** As of 16.3 the API reference carries this banner:

> This API has been replaced by `use cache` in Next.js 16. We recommend opting into Cache Components and
> replacing `unstable_cache` with the `use cache` directive.
> — [unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)

Its version history table lists only `v14.0.0 unstable_cache introduced` — **no deprecation or removal entry**.
The migration guide is explicit that both layers run side by side during adoption: "Your existing `fetch` and
`unstable_cache` caching keeps working as a separate layer, so let the insights and errors guide what to
change."

And it retains one capability `use cache` genuinely lacks:

> For data that needs to persist across deploys, use `unstable_cache` for non-`fetch` functions or the
> `fetch` cache.
> — [Runtime caching considerations](https://nextjs.org/docs/app/api-reference/directives/use-cache#runtime-caching-considerations)

So `unstable_cache` and the `fetch` Data Cache survive deployments; **no `use cache` variant does**, not even
`remote`. If cross-deploy persistence ever matters, `use cache` is not the tool.

Migration is mechanical — the key-parts array disappears (arguments become the key), `options.revalidate`
becomes `cacheLife`, `options.tags` becomes `cacheTag`
([migration](https://nextjs.org/docs/app/guides/migrating-to-cache-components#unstable_cache)).

**For our repo:** `src/lib/fetch.ts` wraps `unstable_cache` with superjson. That superjson wrapper exists
precisely because `unstable_cache` round-trips through JSON. `use cache` uses RSC serialization instead
(section 6), which handles `Date`/`Map`/`Set` natively — so the superjson layer becomes redundant for those,
but **not** for class instances, which superjson supports and `use cache` does not.

---

## 6. The serialization boundary

`use cache` uses **React Server Components serialization** ("Flight"), not JSON and not structuredClone. And
critically, **arguments and return values use different, asymmetric serializers**:

> Arguments and return values use different serialization systems. Server Component serialization (for
> arguments) is more restrictive than Client Component serialization (for return values). This means you can
> return JSX elements but cannot accept them as arguments unless using pass-through patterns.
> — [use cache: Serialization](https://nextjs.org/docs/app/api-reference/directives/use-cache#serialization)

### Supported

**Arguments:** primitives (`string`, `number`, `boolean`, `null`, `undefined`), plain objects, arrays,
**`Date`**, **`Map`**, **`Set`**, TypedArrays, ArrayBuffers, and React elements *as pass-through only*.

**Return values:** all of the above, **plus JSX elements**.

### Not supported

- **Class instances** — explicitly listed as unsupported, with a worked "Error: Cannot serialize class
  instance" example.
- Functions (except as pass-through)
- Symbols, WeakMaps, WeakSets
- **`URL` instances**

> **Answering the ticket's question directly: no, `use cache` does not preserve class instances. It is
> RSC-serialization only.** Anything with methods must cross the boundary as a plain object and be rehydrated
> on the far side.

### Pass-through

Non-serializable values *can* be accepted "as long as you don't introspect them." `children`, other JSX
slots, and Server Actions can be threaded through a cached component untouched and won't affect its cache
entry. This is how a cached article body can wrap live Convex islands:

```tsx
async function CachedArticle({ children }: { children: ReactNode }) {
  'use cache'
  return <article>{await body()}{children}</article>
}
```

### Cache key composition

1. **Build ID** (or `deploymentId` if configured) — changing it invalidates everything
2. **Function ID** — a secure hash of the function's location and signature
3. **Serializable arguments** — including *closed-over variables from outer scopes*, which are automatically
   captured and bound as arguments
4. **HMR refresh hash** (dev only)

— [Cache keys](https://nextjs.org/docs/app/api-reference/directives/use-cache#cache-keys)

The closure capture is easy to miss and easy to blow up cache utilisation with.

### Other boundary constraints

- **`React.cache` is isolated.** Values stored via `React.cache` outside a `use cache` scope are invisible
  inside it. Pass data as arguments instead.
- **Draft Mode disables caching entirely** — all cached functions re-execute per request and results aren't
  saved. `draftMode().isEnabled` *is* readable inside `use cache`; `cookies()`/`headers()` still are not.
- **Passing an unresolved runtime promise into `use cache` hangs the build** for 50 seconds and then fails:
  "Error: Filling a cache during prerender timed out, likely because request-specific arguments such as
  params, searchParams, cookies() or uncached data were used inside `use cache`." Happens via props, closures,
  or a shared `Map`.
- **Client stale time floor: 30 seconds**, enforced by the client router regardless of config. Communicated
  server→client via the `x-nextjs-stale-time` response header.

### Size limits

Next.js documents no size limit for the default in-memory handler beyond `cacheMaxMemorySize`. Vercel's
Runtime Cache (which backs `'use cache: remote'`) does
([limits](https://vercel.com/docs/runtime-cache#limits-and-usage)):

| Property | Limit |
|---|---|
| Item size | **2 MB** (larger items are silently not cached) |
| Tags per item | 128 |
| Max tag length | 256 bytes |

Eviction is LRU. On **Hobby, all projects in the team share one cache** and one storage limit — a noisy
project evicts another's entries. Pro/Enterprise get a per-project cache. `production` and `preview` never
share.

**2 MB is a live constraint for us.** A fully processed, syntax-highlighted changelog article plus its
section tree and extracted plain text could plausibly approach that, and the failure mode is silent
(no cache, not an error).

---

## Implications for the map's standing decisions

Nothing in the primary sources contradicts the map. Three decisions gain sharper definition, and three new
constraints appear that weren't visible at charting time.

**Confirmed and sharpened:**

- *"Rendering uses PPR."* — correct, and it's now free: PPR **is** `cacheComponents`, with no separate flag.
- *"`/java/changelog` keeps its stable URL … cron-driven cache invalidation keeps it correct."* — fully
  supported. Tag the latest-article cache scope, purge it from the Convex cron. 300ms global propagation.
- *"Promoting an annotation invalidates the article's cache entry."* — supported, and the right API differs
  by caller: `updateTag` from the Server Action (immediate, read-your-own-writes), `revalidateTag`/REST from
  the cron (stale-while-revalidate).

**New constraints the map should absorb:**

1. **`use cache` is not a durable server cache on Vercel.** In-memory, per-instance, ephemeral on serverless,
   and wiped by every deploy. It's a *prerender declaration*. Durable shared caching costs `'use cache: remote'`
   plus Vercel Runtime Cache billing, with a **2 MB per-entry limit**. Since ingestion already stores fully
   processed articles in Convex, the Convex read may be cheap enough that plain `use cache` (for the static
   shell) is all we need — but that's now an explicit decision, not a default.

2. **`dynamicParams` is gone and `generateStaticParams` cannot return `[]`.** With ~hundreds of changelog
   versions, we must pick a prerender subset (newest N) and let the rest arrive via App Shell + background
   upgrade. That's the 16.3 ISR story and it needs `partialPrefetching: true` as well.

3. **Bots get no shell.** Crawlers bypass the static shell entirely and render the full page at request time.
   For a public reference site aiming at search, every input the shell depends on must be reachable at request
   time.

Two smaller notes: `cacheLife('max')` expires at **1 year**, not never — a "cache a two-year-old article
near-permanently" entry needs an explicit inline `expire`. And the repo's superjson wrapper in
`src/lib/fetch.ts` is partly redundant under `use cache` (Dates/Maps/Sets are native) but is *not* a drop-in
replacement in the other direction: `use cache` cannot carry class instances at all.

---

## Source index

**Next.js docs (all reporting version `16.3.0`)**

- [Caching](https://nextjs.org/docs/app/getting-started/caching) — updated 2026-08-10
- [Revalidating](https://nextjs.org/docs/app/getting-started/revalidating) — updated 2026-06-25
- [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) — updated 2026-07-22
- [`use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote) — updated 2026-06-08
- [`use cache: private`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private)
- [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) — updated 2026-06-22
- [`cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife) — updated 2026-07-31
- [`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag) — updated 2026-06-08
- [`revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) — updated 2026-06-25
- [`unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) — updated 2026-07-21
- [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components) — updated 2026-08-07
- [ISR with Cache Components](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components) — updated 2026-08-03

**Next.js blog**

- [Next.js 16.3: Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations) — 2026-06-25

**Vercel docs**

- [Incremental Static Regeneration](https://vercel.com/docs/incremental-static-regeneration) — updated 2026-04-30
- [Runtime Cache](https://vercel.com/docs/runtime-cache) — updated 2026-07-27
- [Purging Vercel CDN Cache](https://vercel.com/docs/cdn-cache/purge) — updated 2026-06-16
- [`@vercel/functions` API reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) — updated 2026-07-27
- [REST API: invalidate-by-tag](https://vercel.com/docs/rest-api/reference/endpoints/edge-cache/invalidate-by-tag) — updated 2026-08-11
