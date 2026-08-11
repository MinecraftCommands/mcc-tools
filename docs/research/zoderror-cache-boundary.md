# Does `Result`/`ZodError` still need to cross a cache boundary?

Research for [#35](https://github.com/MinecraftCommands/mcc-tools/issues/35), under the architecture map [#27](https://github.com/MinecraftCommands/mcc-tools/issues/27). Read 2026-08-11.

## Verdict

**The problem dissolves.** After the Convex cutover there is no boundary left that a `ZodError` needs
to cross. `SuperJSON.registerClass(ZodError)` and the whole superjson wrapper in `src/lib/fetch.ts`
get deleted along with request-time fetching, and nothing replaces them. Every remaining boundary —
Convex storage, Convex function args/returns, `use cache`, the RSC server→client boundary — carries
plain data by construction, and three of the four *reject class instances outright*.

Three things make this stronger than "we happen not to need it":

1. `registerClass` has **no analogue** under `use cache`. `use cache` uses the RSC wire format, not
   JSON, and a class instance is a hard serialization error there — the string-smuggling trick in
   `src/lib/fetch.ts` cannot be ported even if we wanted it.
2. Convex's value system **cannot represent a class instance** at all, at any boundary — documents,
   function arguments, return values, or `ConvexError` payloads.
3. In **zod v4, `ZodError` no longer extends `Error`**, so the `instanceof` this whole design rests on
   is already scheduled for demolition independently of Convex. See §2.4 — this is a live hazard in
   the current code, not a hypothetical.

The one thing the wrapper does that is *not* about `ZodError` — preserving `Date` across the cache —
is also answered: `use cache` preserves `Date` natively, and Convex stores timestamps as numbers.

If a `ZodError` ever does have to cross a wire again, the fix is one line and does not require
reconstructing the class: `createMessageBuilder(opts)(issues)`. See §3.

---

## 1. Confirming the `instanceof`

Read at the `v3.4.0` tag of [causaly/zod-validation-error](https://github.com/causaly/zod-validation-error)
(source lives in `lib/`, not `src/`), cross-checked against the published tarball on
`unpkg.com/zod-validation-error@3.4.0/dist/index.mjs`. The two agree — dist is a straight tsup concat.

### 1.1 The call chain

`fromError` is a one-liner delegating to a curried `toValidationError`
([`lib/fromError.ts:8-13`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/fromError.ts)):

```ts
export function fromError(
  err: unknown,
  options: FromZodErrorOptions = {}
): ValidationError {
  return toValidationError(options)(err);
}
```

The dispatch is a three-way branch
([`lib/toValidationError.ts:8-20`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/toValidationError.ts)):

```ts
export const toValidationError =
  (options: FromZodErrorOptions = {}) =>
  (err: unknown): ValidationError => {
    if (isZodErrorLike(err)) {
      return fromZodErrorWithoutRuntimeCheck(err, options);
    }

    if (err instanceof Error) {
      return new ValidationError(err.message, { cause: err });
    }

    return new ValidationError('Unknown error');
  };
```

`fromZodIssue` is not in this path at all.

### 1.2 The exact predicate

It is **not** `err instanceof ZodError`. It is duck-typing — but gated behind `instanceof Error`
([`lib/isZodErrorLike.ts:3-10`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/isZodErrorLike.ts),
the complete file body):

```ts
export function isZodErrorLike(err: unknown): err is zod.ZodError {
  return (
    err instanceof Error &&
    err.name === 'ZodError' &&
    'issues' in err &&
    Array.isArray(err.issues)
  );
}
```

**Line 5 — `err instanceof Error` — is the single place a structurally identical plain object gets
rejected.** The ticket's hypothesis was right that a real instance is required, though the mechanism
is a prototype-chain check rather than a nominal `instanceof ZodError`.

### 1.3 What a plain object actually does

Given `{ name: 'ZodError', issues: [...], message: '...' }` with the prototype lost (a JSON
round-trip):

- `isZodErrorLike(err)` → `false` (fails `instanceof Error`)
- `err instanceof Error` → `false`
- falls through to `new ValidationError('Unknown error')`

It **does not throw**. You get a `ValidationError` whose message is literally `"Unknown error"`, whose
`name` is `"ZodValidationError"`, and whose `details` is `[]` — the `cause` option is not even passed
on that branch, so the issue data is silently discarded. This is the worst failure mode: a rendered
error alert that says nothing.

The package asserts this deliberately
([`lib/isZodErrorLike.test.ts`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/isZodErrorLike.test.ts)):

```ts
test('returns false when argument is object, even if it carries the same props as an actual ZodError', () => {
  const err = {
    name: 'ZodError',
    issues: [],
  };

  expect(isZodErrorLike(err)).toEqual(false);
});
```

(The stricter `fromZodError` — which we do not call — *does* throw a `TypeError` on a plain object,
[`lib/fromZodError.ts:27-31`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/fromZodError.ts).)

No exported guard survives a structural-only object. `isValidationError` is a real
`err instanceof ValidationError`; `isValidationErrorLike` still requires `instanceof Error`.

### 1.4 Landmine: half-restoring the instance is worse than not restoring it

`fromZodErrorWithoutRuntimeCheck` reads **`zodError.errors`, not `.issues`**
([`lib/fromZodError.ts:36-51`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/fromZodError.ts)):

```ts
const zodIssues = zodError.errors;

let message: string;
if (isNonEmptyArray(zodIssues)) {
```

In zod v3, `errors` is a **getter on `ZodError.prototype`**
([`zod@3.24.x/lib/ZodError.d.ts`](https://unpkg.com/zod@3.24.1/lib/ZodError.d.ts)):

```ts
export declare class ZodError<T = any> extends Error {
    issues: ZodIssue[];
    get errors(): ZodIssue[];
    constructor(issues: ZodIssue[]);
```

Only `issues` and `name` are own enumerable properties; `errors`, `message`, `format`, `flatten`,
`toString` all live on the prototype.

So the tempting cheap fix — `Object.assign(new Error(msg), { name: 'ZodError', issues })` — **passes
`isZodErrorLike` and then crashes**: `zodError.errors` is `undefined`, and `isNonEmptyArray(undefined)`
dereferences `.length` → `TypeError: Cannot read properties of undefined (reading 'length')`. A
half-restored `ZodError` is more dangerous than a fully plain one. If we ever reconstruct, it must be
a real `new ZodError(issues)` or a full prototype restore.

### 1.5 Why the current superjson wrapper works — and why it is fragile

Two facts explain `src/lib/fetch.ts:9` exactly.

First, **`unstable_cache` is JSON**, confirmed in the Next source
([`packages/next/src/server/web/spec-extension/unstable-cache.ts`](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/unstable-cache.ts)):
it stores `body: JSON.stringify(result)` under the *fetch* cache entry shape and reads back with
`JSON.parse(cacheEntry.value.data.body)`. Anything that does not survive `JSON.stringify`/`JSON.parse`
is destroyed — `Date` → string, `Map`/`Set` → `{}`, `undefined` dropped, `ZodError` → prototype-less
object. Hence the wrapper hands `unstable_cache` a *string* so JSON cannot touch it.

Second, **superjson's built-in `Error` rule is lossy**. It copies only `name`, `message`, `cause`,
restores `stack`, and reconstructs a **generic `Error`**, not the subclass
([`superjson/src/transformer.ts`](https://github.com/flightcontrolhq/superjson/blob/main/src/transformer.ts)):

```js
const e = 'cause' in v ? new Error(v.message, { cause: v.cause }) : new Error(v.message);
```

A `ZodError` through that rule loses `issues` and its `name`, so `fromError` would fall to the second
branch and return `ValidationError(err.message)` with no issue detail. `registerClass` instead does:

```js
return Object.assign(Object.create(clazz.prototype), v);
```

and the registered `classRule` is evaluated **before** the built-in error rule
(`compositeRules = [classRule, symbolRule, customRule, typedArrayRule]` runs first; `simpleRules`,
which holds the error rule, second). So `registerClass(ZodError)` wins,
`Object.create(ZodError.prototype)` puts `Error.prototype` back on the chain *and* restores the
`errors` getter, and `issues` rides along as an own enumerable prop.

The current code is therefore correct — but it depends on rule ordering, on `issues` being
own-enumerable, and on the `.errors` getter returning with the prototype. Three separate
implementation details of two third-party libraries.

**Already-latent bug:** `TypeError` — the other error type in `FetchAndParseResult`
(`src/lib/fetch.ts:40`) — is **not** registered, so it round-trips through the lossy rule and comes
back as a plain `Error`. The `e instanceof Error` check at `src/lib/fetch.ts:66` still passes, so
nothing visibly breaks, but the subclass is silently lost today.

---

## 2. Does it survive the cutover?

**No.** Enumerating every boundary, none of them carries a `ZodError` or any other class instance.

### 2.1 The boundaries that exist today

| # | Boundary | Crosses it today | After cutover |
|---|---|---|---|
| 1 | `unstable_cache` via `cache()`, `src/lib/fetch.ts:11-33` — two call sites, `getVersionManifest` (`src/server/java/versions.ts:49`) and `getPatchNotes` (`:98`) | `Result<T, ZodError \| TypeError \| string>`, plus `Date` inside `VersionManifestEntry` | **Deleted.** #41 lists "the `cache` wrapper in `src/lib/fetch.ts` and request-time fetching in `src/server/java/versions.ts`" under *What gets deleted*. |
| 2 | `unstable_cache` in `src/server/highlighting/mcfunction.ts:6` | plain JSON only — the file's own comment reads *"We don't need the fancy SuperJSON stuff here"* | Unaffected. Already proves the codebase caches fine without superjson. |
| 3 | RSC server→client props: `<PublishDate date={patchNotes.date} />`, `src/components/java/patch-notes.tsx:165` | a `Date` | `Date` is explicitly serializable across RSC. Post-cutover it becomes a Convex `v.number()` timestamp anyway. |
| 4 | RSC server→client props: `ReleaseVersionEntry` → `version-link.tsx` / `release-version-link-set.tsx` (both `"use client"`) | plain strings/objects — `layout.tsx:115-146` rebuilds the entries by hand and drops `date` | Plain data, unaffected. |
| 5 | Error rendering: `src/components/java/patch-notes.tsx:69-75`, `src/app/java/changelog/layout.tsx:41-43` | **nothing** — `fromError(...).toString()` runs server-side; only the resulting `string` enters JSX | No `ZodError` reaches the client boundary even today. |

Two supporting observations from the code:

- `fetchAndParseErrToString` (`src/lib/fetch.ts:52-73`) — the most `instanceof`-entangled function in
  the repo, and the only other `e instanceof Error` — has **zero call sites**. It is dead code, and
  should be deleted regardless of how this question resolves.
- So the live `ZodError` consumers are exactly two (`patch-notes.tsx:71`, `layout.tsx:43`), both of
  which exist only to render the failure of a *request-time* fetch.

### 2.2 Why nothing replaces boundary 1

The map's standing decisions make this structural, not incidental:

- **Ingestion moves to a Convex cron.** #40 states it outright: *"Parse failures are handled here and
  must never reach a rendered page — that is the premise the ZodError research is testing."* The
  `safeParse` that produces a `ZodError` runs inside a Convex action; the error is consumed (logged,
  retried, alerted on) in the same function that created it. It never returns, never gets cached,
  never gets rendered.
- **Clean cutover, no dual path.** #27: *"no permanent dual-path back to request-time Mojang fetching."*
  There is no residual code path where a request-time parse failure could still reach a page.
- **Articles are stored fully processed.** Rendering reads already-valid documents. A read cannot
  produce a `ZodError`, only a "not found".

### 2.3 Every remaining boundary rejects class instances

This is the part that makes the finding robust rather than contingent on our own discipline.

**`use cache` (Next 16.3).** Not JSON — the RSC wire format.
[nextjs.org/docs/app/api-reference/directives/use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache):

> Arguments to cached functions and their return values must be serializable. […] **Good to know:**
> Arguments and return values use different serialization systems. Server Component serialization
> (for arguments) is more restrictive than Client Component serialization (for return values).

Its own supported/unsupported list:

> **Supported — Arguments:** Primitives; Plain objects; Arrays; Dates, Maps, Sets, TypedArrays,
> ArrayBuffers; React elements (as pass-through only). **Return values:** Same as arguments, plus JSX
> elements.
> **Unsupported types:** Class instances; Functions (except as pass-through); Symbols, WeakMaps,
> WeakSets; URL instances.

with an explicit example commented `// Error: Cannot serialize class instance`. And from the caching
guide: *"A cached function's output is serialized into an RSC payload."* So a `ZodError` in a
`use cache` boundary is a **hard error**, not silent mangling — and there is no `registerClass`
escape hatch. `Date`/`Map`/`Set` are preserved natively, which removes the wrapper's other job.
(Note `URL` is unsupported even though `Date` is — worth remembering separately.)

**RSC server→client props.** [react.dev/reference/rsc/use-client](https://react.dev/reference/rsc/use-client)
lists primitives, iterables (`String`/`Array`/`Map`/`Set`/`TypedArray`/`ArrayBuffer`), `Date`, plain
objects, promises, JSX, and server functions as serializable, and explicitly rejects:

> Classes … objects that are instances of any class (other than the built-ins mentioned) or objects
> with a null prototype

React's runtime message is *"Only plain objects, and a few built-ins, can be passed to Client
Components from Server Components. Classes or null prototypes are not supported."* An `Error` is a
class instance and is **not** among those built-ins, so passing a `ZodError` as a prop was never
going to work, cache or no cache.

The apparent counterexample — `error.js` receiving an `Error` — is a different mechanism (Flight
serializes *thrown* errors specially, with a digest) and is deliberately redacted in production
([nextjs.org/docs/app/api-reference/file-conventions/error](https://nextjs.org/docs/app/api-reference/file-conventions/error)):

> Errors forwarded from Server Components show a generic message with an identifier. This is to
> prevent leaking sensitive details.

Next's own guidance for exactly our case
([error handling](https://nextjs.org/docs/app/getting-started/error-handling)):
*"For these errors, avoid using `try`/`catch` blocks and throw errors. Instead, model expected errors
as return values."* — i.e. return plain data, which is what §3 option 1 recommends.

**Convex.** [docs.convex.dev/database/types](https://docs.convex.dev/database/types) and
[/functions/validation](https://docs.convex.dev/functions/validation): the value set is `Id`, `Null`,
`Int64` (`bigint`), `Float64`, `Boolean`, `String`, `Bytes` (`ArrayBuffer`), `CommitTs`, `Array`,
`Object`, `Record`. Quoted restrictions:

> Convex only supports "plain old JavaScript objects"

and `undefined` "is not a valid Convex value". Limits: 1MB per value, 16 levels of nesting, 8192
array entries, 1024 object entries. A document field **cannot** hold a class instance.

`ConvexError`'s payload is bound by the same rule
([application errors](https://docs.convex.dev/functions/error-handling/application-errors)):
*"You can pass the same data types supported by function arguments, return types and the database, to
the `ConvexError` constructor."* And non-`ConvexError` exceptions are redacted in production — the
client gets a generic "Unexpected error occurred". So a `ZodError` cannot be smuggled to the client as
a thrown error either.

Net: **Convex's value system is a strict subset of what `use cache` and the RSC boundary accept.**
Anything read out of Convex is safe to pass through both with no custom serialization layer. There is
no "make the class survive" option to consider anywhere in the new stack. One mismatch to design
around in the other direction: Convex forbids `undefined` while RSC/`use cache` support it.

### 2.4 Zod v4 — the `instanceof` is doomed anyway

The repo pins `zod@^3.24.2` / `zod-validation-error@^3.4.0`. This section is the one genuinely
*new* hazard the research turned up, and it argues for deleting this code sooner rather than later.

**In zod v4, `ZodError` no longer extends `Error`.** From [zod.dev/packages/core](https://zod.dev/packages/core):

> For performance reasons, `$ZodError` *does not* extend the built-in `Error` class! So using
> `instanceof Error` will return `false`.
>
> ```ts
> export class $ZodError<T = unknown> implements Error {
>   public issues: $ZodIssue[];
> }
> ```

Confirmed by the maintainer on [colinhacks/zod#4334](https://github.com/colinhacks/zod/issues/4334):

> Known & documented. This decision wasn't made lightly. Note that in recent betas the errors thrown
> by `parse`/`parseAsync` *do* extend `Error`. The ones returned by `safeParse`/`safeParseAsync`
> still do not.

We use `safeParse`/`safeParseAsync` everywhere (`src/lib/fetch.ts:38`,
`src/server/java/versions.ts:112`). So on a zod v4 upgrade:

- `src/lib/fetch.ts:66` (`e instanceof Error`) silently changes branch;
- `src/components/java/patch-notes.tsx:71` (`maybePatchNotes.error instanceof Error`) silently
  changes branch, and the `else` assigns a `ZodError` to a `string`-typed variable;
- `zod-validation-error@3.4.0`'s `isZodErrorLike` returns `false` for a v4 `safeParse` error even
  when the object is a live, never-serialized instance.

**`.errors` was also removed** ([zod.dev/v4/changelog](https://zod.dev/v4/changelog)): *"This API was
an alias for `.issues` in Zod v3 but has been removed. Use `.issues` instead."* — which is precisely
the property `fromZodErrorWithoutRuntimeCheck` reads (§1.4). And the issue formats were *"dramatically
streamlined"* (`ZodInvalidEnumValueIssue` + `ZodInvalidLiteralIssue` → `$ZodIssueInvalidValue`, etc.),
so any persisted issue shape is not v3/v4 portable.

`zod-validation-error` v4 was updated to match
([`lib/v4/isZodErrorLike.ts:3-11`](https://github.com/causaly/zod-validation-error/blob/v4.0.2/lib/v4/isZodErrorLike.ts)):

```ts
export function isZodErrorLike(err: unknown): err is zod.$ZodError {
  return (
    err instanceof Object &&
    'name' in err &&
    (err.name === 'ZodError' || err.name === '$ZodError') &&
    'issues' in err &&
    Array.isArray(err.issues)
  );
}
```

`instanceof Error` → `instanceof Object`, `'$ZodError'` accepted, and `lib/v4/fromZodError.ts:40`
now reads `zodError.issues`. **A JSON-round-tripped plain object passes this end to end.** So if a
serialization boundary ever did reappear, upgrading the pair to v4 fixes it with no change at the
call sites.

But zod v4 also ships first-party formatting — `z.prettifyError()`, `z.treeifyError()`,
`z.flattenError()` ([zod.dev/error-formatting](https://zod.dev/error-formatting)) — and
`z.prettifyError()` covers 100% of our use of `zod-validation-error`
(`fromError(e).toString()`, three sites). So the cleanest outcome is to **drop the dependency**, not
upgrade it. Caveat if anyone does swap them: the output format differs — `prettifyError` returns a
multi-line `✖ message\n  → at path` string, `zod-validation-error` a single-line
`Validation error: … at "path"`.

Incidental note: the lockfile already resolves both, side by side —
`node_modules/zod@3.24.2` + `zod-validation-error@3.4.0` for the app, and
`node_modules/eslint-plugin-react-hooks/node_modules/zod@4.1.12` +
`zod-validation-error@4.0.2` transitively. Nothing to fix, but it means a v4 upgrade will not be a
fresh introduction to the tree.

---

## 3. If any paths remain — the options

None do. Recording the options anyway, because the same shape recurs whenever validation output has
to move (e.g. an annotation-write path returning field errors to a form).

1. **Convert to a plain shape at the boundary and format from that. (Recommended if ever needed.)**
   `ZodIssue[]` is already plain JSON — objects with `code`/`path`/`message` — and is a valid Convex
   value as-is. Carry `error.issues`, not the error. On the read side call the exported
   `createMessageBuilder`
   ([`lib/MessageBuilder.ts:9,21`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/MessageBuilder.ts)):

   ```ts
   type MessageBuilder = (issues: NonEmptyArray<ZodIssue>) => string;
   function createMessageBuilder(props?: CreateMessageBuilderProps): MessageBuilder;
   ```

   This is the *same* function `fromZodError` calls internally (`lib/fromZodError.ts:44-45`), so the
   string is byte-identical to what we render today. It takes a bare issues array, requires no
   prototype, and needs no superjson. Defaults from `lib/config.ts`: `prefix = 'Validation error'`,
   `prefixSeparator = ': '`, `issueSeparator = '; '`, `unionSeparator = ', or '`,
   `maxIssuesInMessage = 99`, `includePath = true`. This also matches Next's own advice to *"model
   expected errors as return values"*.

2. **A lower-level API taking a plain issues array** — this *is* option 1; `createMessageBuilder` is
   the only such export. Note there is no `fromZodIssues` (plural). `fromZodIssue` is singular and
   internally constructs a real `new zod.ZodError([issue])` anyway
   ([`lib/fromZodIssue.ts:18,25`](https://github.com/causaly/zod-validation-error/blob/v3.4.0/lib/fromZodIssue.ts)).
   Full v3.4.0 export surface: `ValidationError`, `isValidationError`, `isValidationErrorLike`,
   `isZodErrorLike`, `errorMap`, `fromError`, `fromZodIssue`, `fromZodError`, `toValidationError`,
   `createMessageBuilder`, plus types.

3. **Drop the dependency and format ourselves** — viable now, and nearly free on zod v4 via
   `z.prettifyError`. Since the two live call sites disappear at cutover, "drop it" and "do nothing"
   are the same action here.

4. **Reconstruct the instance on the read side** — possible but the worst option, and it stops working
   on zod v4 where the thing you would reconstruct is not an `Error`. It must be a real
   `new ZodError(issues)`; the decorated-`Error` shortcut passes the guard and then throws (§1.4).
   Only worth it if we needed a populated `ValidationError.details`, in which case:
   `new ValidationError(createMessageBuilder(opts)(issues), { cause: new ZodError(issues) })`,
   mirroring `fromZodIssue.ts:25`.

**Recommendation: option 1 as the standing pattern, but do not implement it now.** Nothing in the
post-cutover design needs it, and implementing it pre-emptively would preserve the shape of a problem
the architecture removes.

---

## 4. Consequences for other tickets

- **#41 (rendering and caching on Convex)** — the "What gets deleted" list is safe to execute in full;
  deleting the `cache` wrapper strands no consumer. Delete `fetchAndParseErrToString`
  (`src/lib/fetch.ts:52-73`) too — already dead. Do **not** attempt to port the superjson wrapper to
  `use cache`; class instances are a hard error there and `Date`/`Map`/`Set` no longer need help.
- **One caveat for whoever sequences the migration:** the wrapper is load-bearing for `Date` as well
  as `ZodError`. `VERSION_MANIFEST_ENTRY_SCHEMA.date` transforms to a `Date`
  (`src/server/java/versions.ts:16-19`), which is then compared (`:56`) and `.toISOString()`'d
  (`src/app/java/changelog/[version]/page.tsx:30`). Dropping superjson *while keeping*
  `unstable_cache` + request-time fetching would break version sorting silently. Dropping it *at* the
  cutover is safe. Moving to `use cache` before the cutover is also safe, since `use cache` preserves
  `Date`.
- **#40 (ingestion cron)** — its premise holds; parse failures are terminal at ingest. The failure
  record it stores must be plain; storing `error.issues` verbatim is the natural choice since
  `ZodIssue[]` is already a valid Convex value. Be aware the issue *shape* is not v3/v4 portable, so
  either store a pre-rendered message alongside it or version the record.
- **#29 (upgrade to Next.js 16.3) / any future zod v4 upgrade** — flag separately: the `instanceof Error`
  checks at `src/lib/fetch.ts:66` and `src/components/java/patch-notes.tsx:71` break *silently* on
  zod v4 (§2.4). If the zod upgrade lands before the Convex cutover, these two sites need attention;
  if the cutover lands first, they will already be gone. Prefer the latter ordering.
- **`zod-validation-error` becomes removable** once `patch-notes.tsx:15` and `layout.tsx:7` lose their
  error branches. If it is kept for form validation on the annotation-writing path, note that
  validation there lives entirely on one side of a boundary — browser-side, or inside a Convex
  mutation — so the `instanceof` is never in question.

---

## Sources

All primary.

**zod-validation-error**
- v3.4.0 source: https://github.com/causaly/zod-validation-error/tree/v3.4.0/lib — `isZodErrorLike.ts`,
  `fromError.ts`, `toValidationError.ts`, `fromZodError.ts`, `fromZodIssue.ts`, `ValidationError.ts`,
  `MessageBuilder.ts`, `config.ts`, `index.ts`, `isZodErrorLike.test.ts`
- published tarball cross-check: https://unpkg.com/zod-validation-error@3.4.0/dist/index.mjs
- v4 predicate: https://github.com/causaly/zod-validation-error/blob/v4.0.2/lib/v4/isZodErrorLike.ts

**zod**
- v3 `ZodError` shape: https://unpkg.com/zod@3.24.1/lib/ZodError.d.ts
- v4 core (`$ZodError` does not extend `Error`): https://zod.dev/packages/core
- v4 changelog (`.errors` removed, issue formats): https://zod.dev/v4/changelog
- error formatting (`prettifyError` / `treeifyError` / `flattenError`): https://zod.dev/error-formatting
- maintainer confirmation: https://github.com/colinhacks/zod/issues/4334

**Next.js / React**
- `use cache` serialization: https://nextjs.org/docs/app/api-reference/directives/use-cache
- caching guide (RSC payload): https://nextjs.org/docs/app/getting-started/caching
- `unstable_cache` source (`JSON.stringify`): https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/unstable-cache.ts
- error file convention / production redaction: https://nextjs.org/docs/app/api-reference/file-conventions/error
- error handling guidance: https://nextjs.org/docs/app/getting-started/error-handling
- RSC serializable props: https://react.dev/reference/rsc/use-client and https://react.dev/reference/rsc/use-server

**superjson**
- transformer (error rule, class rule, rule ordering): https://github.com/flightcontrolhq/superjson/blob/main/src/transformer.ts

**Convex**
- value types: https://docs.convex.dev/database/types
- argument/return validation: https://docs.convex.dev/functions/validation
- application errors: https://docs.convex.dev/functions/error-handling/application-errors

**Repo**
- `src/lib/fetch.ts`, `src/lib/result.ts`, `src/server/java/versions.ts`,
  `src/server/highlighting/mcfunction.ts`, `src/components/java/patch-notes.tsx`,
  `src/app/java/changelog/layout.tsx`, `src/app/java/changelog/[version]/page.tsx`,
  `package.json`, `package-lock.json`
- tickets: #27 (map), #29 (Next 16.3 upgrade), #40 (ingestion cron), #41 (rendering and caching)
