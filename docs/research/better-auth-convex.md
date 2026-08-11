# better-auth on Convex, Discord guild gating, and `better-convex`/kitcn

Research for [issue #34](https://github.com/MinecraftCommands/mcc-tools/issues/34). Charted against primary sources only: the `get-convex/better-auth` repo and its docs, `better-auth/better-auth`'s docs, `docs.convex.dev`, `udecode/kitcn`, the npm registry, and `docs.discord.com/developers`.

Date of research: **2026-08-11**. Version numbers and maintenance figures are as of that date and will rot.

---

## TL;DR

- **Adopt `@convex-dev/better-auth`** (the official Convex component, currently `0.12.5`). It is first-party, actively released, and it is exactly the integration layer we need.
- **Skip `better-convex`/kitcn.** Not a template — a full framework that replaces Convex's own function API, schema definition, data access, and client hooks. Single maintainer, breaking changes in every minor since 0.11, ~1.2% of the official component's npm adoption, and since v0.13.0 it has **forked** the official Convex better-auth component rather than depending on it. Nothing in it is worth that.
- **Convex verifies identity itself via JWT**, not by trusting Next.js. Better Auth runs *inside* Convex as HTTP actions, mints a short-lived RS256 JWT, and publishes a JWKS endpoint on the Convex `.site` domain; `convex/auth.config.ts` registers that as a `customJwt` provider so the Convex backend validates the signature, `iss`, `aud` and `exp` on every function call before our handler runs. Client-written annotations are therefore safe.
- **Discord roles are a snapshot, not a live feed.** With the user's own OAuth token we can read role IDs at sign-in; there is no push mechanism for role or ban changes that works without a persistent WebSocket process, which Convex cannot host.
- **Ban status is not readable with a user token at all.** It needs a bot token with `BAN_MEMBERS` in the MCC guild.
- **Convex Auth does not become the better choice.** It is still `0.0.94`, self-described as beta and incomplete, with Next.js support marked experimental. Nothing found flips the assumption.

---

## 1. The better-auth Convex component

### What it is

[`@convex-dev/better-auth`](https://www.npmjs.com/package/@convex-dev/better-auth) is a **Convex Component** maintained in [`get-convex/better-auth`](https://github.com/get-convex/better-auth) under the Convex org, Apache-2.0, docs at [labs.convex.dev/better-auth](https://labs.convex.dev/better-auth).

It is not a wrapper that calls a Better Auth server running somewhere else. Better Auth *runs inside the Convex deployment*:

- `app.use(betterAuth)` in `convex/convex.config.ts` installs the component, which brings its own isolated tables (`user`, `session`, `account`, `verification`, `jwks`, `twoFactor`, `oauth*`, …) in the component's namespace ([`src/component/schema.ts`](https://github.com/get-convex/better-auth/blob/main/src/component/schema.ts)).
- `authComponent.adapter(ctx)` is passed to `betterAuth({ database })` — the Convex component *is* Better Auth's database adapter.
- `authComponent.registerRoutes(http, createAuth)` mounts Better Auth's HTTP handlers on the Convex HTTP router as `httpActionGeneric` handlers ([`src/client/create-client.ts:389`](https://github.com/get-convex/better-auth/blob/main/src/client/create-client.ts)). They serve from the deployment's `.convex.site` domain. Because they are **actions**, `fetch` is available inside the OAuth callback — which is what makes the Discord guild check below possible.
- In Next.js, `app/api/auth/[...all]/route.ts` is a thin proxy (`convexBetterAuthNextJs`) forwarding to Convex. Next.js holds no auth logic.

### Maturity

| Signal | Value |
| --- | --- |
| Latest version | `0.12.5`, published **2026-06-27** |
| First release | `0.6.0`, 2025-06-12 |
| Minor cadence | 0.6 (Jun 25) → 0.7 (Jul 25) → 0.8 (Sep 25) → 0.9 (Oct 25) → 0.10 (Dec 25) → 0.11 (Mar 26) → 0.12 (Apr 26) |
| Repo | 765 stars, 111 open issues, last push 2026-08-10 |
| Contributors | `erquhart` 545 of ~600 commits (Convex staff), then renovate, `ianmacartney`, `Nicolapps` (Convex staff) |
| npm downloads | ~151k/week |
| Peer deps (0.12.5) | `convex ^1.25.0`, `better-auth >=1.6.11 <1.7.0`, `react ^18.3.1 \|\| ^19` |

Honest read: **pre-1.0 with a documented breaking migration at nearly every minor** (`docs/content/docs/migrations/migrate-to-0-{8,9,10,11,12}.mdx`). But it is Convex-staff-maintained, has 151k weekly downloads, and Better Auth itself is a mature 1.x (`better-auth@1.6.26` latest, 29.5k stars, MIT, 1.0 shipped 2024-11-23). The `>=1.6.11 <1.7.0` upper bound means **we cannot upgrade Better Auth minors ahead of the component** — a real but bounded constraint, and one we'd inherit from any Convex/Better Auth pairing.

The bus factor of one on `erquhart` is the main risk. It is materially mitigated by him being a Convex employee, the repo living in the Convex org, and Convex staff appearing in the contributor list.

### Configuration, in outline

```ts
// convex/auth.config.ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;

// convex/auth.ts
export const authComponent = createClient<DataModel>(components.betterAuth);
export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.SITE_URL!,
    database: authComponent.adapter(ctx),
    socialProviders: { discord: { /* … */ } },
    plugins: [convex({ authConfig })],
  });

// convex/http.ts
authComponent.registerRoutes(http, createAuth);
```

Env vars: `BETTER_AUTH_SECRET` and `SITE_URL` on the Convex deployment; `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` (the `.site` twin), `NEXT_PUBLIC_SITE_URL` in `.env.local`.

### Notable features we will want

- **Triggers** ([docs](https://labs.convex.dev/better-auth/features/triggers)) — `onCreate`/`onUpdate`/`onDelete` per component table that run **in the same transaction** as the auth write. This is the clean way to mirror a Better Auth user into our own `users` table when they first sign in. Better Auth's own `databaseHooks` cannot do this transactionally.
- **`preloadAuthQuery` / `usePreloadedAuthQuery`** for authenticated SSR from server components.
- **Static JWKS** (experimental) — see §2.

### Known sharp edge: `user.additionalFields` needs Local Install

The default install has a **fixed, generated component schema**. `user.additionalFields` in the Better Auth config silently does nothing — confirmed in [get-convex/better-auth#258](https://github.com/get-convex/better-auth/issues/258): *"the fields only appear when using local install."*

[Local Install](https://labs.convex.dev/better-auth/features/local-install) moves the component into `convex/betterAuth/` in our own repo, generates the schema with `npx auth generate`, and unlocks schema-dependent config and unsupported plugins — at the cost of owning the schema and a `createAuthOptions`/`createAuth` split.

**Implication for us:** if we want Discord role IDs *on the Better Auth user record* (and therefore in the JWT, see §2), we need Local Install. If we keep roles in **our own** `users` table and read them inside mutations, we don't. §4 argues for the latter.

---

## 2. Server-side identity verification — how Convex knows who the caller is

This is the load-bearing question for the map's decision that annotations are written from the client straight to Convex.

**Convex verifies a JWT itself, on every function call, before our handler runs. Next.js is not in the trust path.**

The mechanism, from [`src/auth-config.ts`](https://github.com/get-convex/better-auth/blob/main/src/auth-config.ts):

```ts
export const getAuthConfigProvider = (opts?) => ({
  type: "customJwt",
  issuer: `${process.env.CONVEX_SITE_URL}`,
  applicationID: "convex",
  algorithm: "RS256",
  jwks: `${process.env.CONVEX_SITE_URL}${opts?.basePath ?? "/api/auth"}/convex/jwks`,
});
```

So:

1. The Better Auth `convex()` plugin mints an **RS256 JWT**, signed with a keypair stored in the component's `jwks` table, and exposes the public set at `https://<deployment>.convex.site/api/auth/convex/jwks`.
2. `convex/auth.config.ts` registers that as a Convex [`customJwt` provider](https://docs.convex.dev/auth/advanced/custom-jwt). Convex validates `kid`/`alg`/`typ` in the header and `sub`, `iss`, `exp` (and expects `iat`) in the payload, checks `aud === "convex"`, and verifies the signature against the fetched JWKS.
3. Only then does our query/mutation run, with `ctx.auth.getUserIdentity()` populated.

The Convex client obtains the token via `ConvexBetterAuthProvider`, refreshes it, and attaches it to both the WebSocket session and every HTTP call.

**Token lifetime is 15 minutes by default** (`jwt.expirationSeconds`, default `900`), configurable.

### Two levels of check, and the difference matters

| Call | Cost | Semantics |
| --- | --- | --- |
| `ctx.auth.getUserIdentity()` | free (already validated) | Trusts the JWT. **Does not check whether the session still exists.** A revoked session stays "valid" until the JWT expires — up to 15 minutes. |
| `authComponent.getAuthUser(ctx)` | 2 component queries | Reads `identity.sessionId` from the JWT, looks the session up in the component's `session` table with `expiresAt > now`, then loads the user doc. Throws `ConvexError("Unauthenticated")` if either is missing. |

Source: [`src/client/create-client.ts:144`](https://github.com/get-convex/better-auth/blob/main/src/client/create-client.ts) (`safeGetAuthUser`). The docs say it plainly: *"You can get the current user from the auth component with session validation… Note that [`ctx.auth.getUserIdentity`] does not validate the session."*

**For annotation writes we should use `getAuthUser`/`safeGetAuthUser`,** not bare `getUserIdentity`, so that banning a user (which we implement as revoking their sessions) takes effect immediately rather than up to 15 minutes later. For read paths, `getUserIdentity` is fine.

### Custom claims

`definePayload` controls the JWT payload. Default:

```ts
definePayload: ({ user, session }) => ({
  ...omit(user, ["id", "image"]),
  sessionId: session.id,
  iat: Math.floor(new Date().getTime() / 1000),
})
```

Convex surfaces non-standard claims on the identity object — nested fields are reachable with dot notation, e.g. `identity["properties.favoriteColor"]` ([custom JWT docs](https://docs.convex.dev/auth/advanced/custom-jwt)).

So Discord roles *could* ride in the JWT. The catch: `definePayload` only sees the Better Auth user record, so roles-in-JWT requires `user.additionalFields`, which requires Local Install (§1) — and it reintroduces up to 15 minutes of staleness on a role revocation. See §4 for why we should not do this.

### Performance note

From the [experimental docs](https://labs.convex.dev/better-auth/experimental): *"every request must include a token and be validated by the Convex backend. Token validation is never cached. By default, validation requires the Convex backend to make two blocking http requests serially: one for OIDC discovery… and one for fetching the JWKS."* The component already avoids the discovery hop by using `customJwt` with a static JWKS **URL**; the experimental **Static JWKS** option inlines the key set as a data URI and removes both. Worth turning on once we have HTTP-path (SSR) authenticated queries.

---

## 3. Discord data access

All endpoints below are on `docs.discord.com/developers` (the old `discord.com/developers/docs/*` URLs now 301 there).

### Roles, at sign-in, with the user's own token

- Scope `guilds.members.read` — *"allows `/users/@me/guilds/{guild.id}/member` to return user's member information"* ([OAuth2 scopes](https://docs.discord.com/developers/topics/oauth2)).
- `GET /users/@me/guilds/{guild.id}/member` returns a full [guild member object](https://docs.discord.com/developers/resources/guild): `roles` (**array of role ID snowflakes** — IDs only, no names), `nick`, `joined_at`, `pending` (has not passed membership screening), `communication_disabled_until` (timeout expiry), `premium_since`, `flags`.
- Scope `guilds` alone is **not enough**: it returns partial guild objects with a computed guild-level `permissions` bitfield, but no role IDs.
- Resolving role IDs to names needs `GET /guilds/{guild.id}/roles` with a bot token. For us that's fine — we can hard-code the MCC role IDs we care about in Convex env vars.
- Better Auth requests extra scopes via the provider's `scope` option:
  ```ts
  discord: { clientId, clientSecret, scope: ["identify", "email", "guilds.members.read"] }
  ```

**Gating sign-in on guild membership.** Better Auth's own docs are explicit that this must happen *before* sign-in completes: *"If a provider claim controls who may sign in, enforce the policy before Better Auth completes OAuth sign-in. Do not defer the check until after sign-in, because Better Auth may already have issued a valid session."* The sanctioned hook is a custom [`getUserInfo`](https://www.better-auth.com/docs/concepts/oauth#getuserinfo) on the Discord provider that fetches `/users/@me/guilds/{MCC}/member` and **returns `null`** when the user is not a member. This works because the auth routes are Convex HTTP actions and `fetch` is available there.

Note the Discord-specific gotcha Better Auth documents: *"Discord returns `email: null` for phone-only accounts, even with the `email` scope granted"* — use `mapProfileToUser` to synthesize `${profile.id}@discord.invalid`.

### Do role changes propagate? No — it is a snapshot.

- The OAuth token response carries no guild or member data at all (just `access_token`, `token_type`, `expires_in`, `refresh_token`, `scope`). Access tokens live **7 days** (`expires_in: 604800`); refreshing gets a new token pair and *nothing else* — it does not re-check membership.
- Every membership read is a live request-time call. There is no ETag/`If-None-Match` support and no documented cache semantics.
- Better Auth persists the Discord `accessToken`/`refreshToken`/`accessTokenExpiresAt`/`scope` on the component's `account` table, and `auth.api.getAccessToken({ body: { providerId: "discord", userId } })` returns a **fresh** token, refreshing if expired. So a Convex cron/action can re-poll `/users/@me/guilds/{MCC}/member` per user on a schedule without asking the user to re-consent.
- **Tokens are stored in plaintext by default.** Better Auth: *"Better Auth doesn't encrypt tokens by default and that's intentional."* Encryption is a `databaseHooks.account.create.before` we would have to write ourselves. Worth doing, or worth deciding we accept it.

### Bans — bot token only

- There is **no** way to read ban status with a user's OAuth token. A banned user is simply absent from `/users/@me/guilds`, which is indistinguishable from having left or been kicked.
- `GET /guilds/{guild.id}/bans/{user.id}` needs a **bot token with `BAN_MEMBERS`** and returns **404 when the user is not banned** — 404 is the negative answer, not an error. The ban object is just `{ reason, user }`; who/when needs the audit log (`VIEW_AUDIT_LOG`).
- 404s do **not** count against Discord's invalid-request budget (only 401/403/429 do, 10,000 per 10 min → temporary Cloudflare IP ban), so per-user ban polling is safe. But a misconfigured bot token throwing 401s from Convex's shared egress IPs would burn that budget fast — fail loudly and stop on 401.
- Global bot limit is **50 requests/second**; per-route buckets are unpublished and must be read off `X-RateLimit-*` headers at runtime. Buckets key on the top-level resource, so all `/guilds/{MCC}/...` calls share one bucket.

### Real-time propagation would need a process Convex cannot host

- The only push for role/ban changes is the Gateway: `GUILD_MEMBERS` intent → `GUILD_MEMBER_ADD/UPDATE/REMOVE` (the `UPDATE` payload carries the full new `roles` array, so we could diff), and `GUILD_MODERATION` intent → `GUILD_BAN_ADD`/`GUILD_BAN_REMOVE` (also needs `BAN_MEMBERS` or `VIEW_AUDIT_LOG` in-guild).
- The Gateway is a persistent WebSocket with mandatory heartbeats, IDENTIFY/READY/RESUME lifecycle. **This cannot run on Convex or any serverless runtime.** It needs a separate always-on host that writes into Convex via an HTTP mutation.
- `GUILD_MEMBERS` is a **privileged** intent. The gate is no longer "100 servers" — it is now **10,000 unique users** who can see the app, with a 90-day application window and **annual reapplication** ([privileged intent review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review), [support article](https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps)). Sending a disallowed intent closes the Gateway with code 4014.
- [Webhook Events](https://docs.discord.com/developers/events/webhook-events) — the serverless-friendly push channel — **do not cover member, role or ban changes**. The full event list is `APPLICATION_AUTHORIZED`, `APPLICATION_DEAUTHORIZED`, the `ENTITLEMENT_*` set, `QUEST_USER_ENROLLMENT`, and the lobby/game-DM message events. Nothing useful here.
- Discord itself points at fetch-on-demand as the alternative: [*"You Might Not Need a Privileged Intent"*](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent) recommends `GET /guilds/{guild.id}/members/{user.id}` (bot token, **no intent and no documented permission required**) for single-member lookups instead of maintaining a member cache.

---

## 4. Recommended shape for mcc-tools

Not a decision — a proposal for the auth-stack ticket to accept or shoot down.

1. **`@convex-dev/better-auth`, default (non-local) install**, Discord provider with `scope: ["identify", "email", "guilds.members.read"]`.
2. **Gate sign-in in `getUserInfo`**: fetch `/users/@me/guilds/{MCC_GUILD_ID}/member`; return `null` if it 404s. Non-members never get a session.
3. **Keep Discord state in our own `users` table, not on the Better Auth user.** A component **trigger** on `user.onCreate` inserts our `users` doc transactionally; a Convex action refreshes `discordRoleIds`, `discordBanned`, `lastCheckedAt` on it. This avoids Local Install entirely, and — more importantly — means a role or ban change takes effect on the **next mutation**, because the mutation reads roles from our table rather than from a ≤15-minute-old JWT claim.
4. **Refresh policy**: re-check via `auth.api.getAccessToken` + `/users/@me/guilds/{MCC}/member` (a) on every sign-in, (b) lazily when `lastCheckedAt` is older than some TTL and the user attempts an elevated write, and (c) on a Convex cron for anyone who has written recently. This is the pragmatic middle between a live Discord call per mutation and an indefinite snapshot.
5. **Bans need a bot.** Register a bot in the MCC guild with `BAN_MEMBERS`, store its token as a Convex env var, and call `GET /guilds/{MCC}/bans/{userId}` from an action, treating 404 as "not banned". No Gateway, no privileged intent, no always-on process.
6. **Write paths use `authComponent.getAuthUser(ctx)`** (session-validated), not bare `ctx.auth.getUserIdentity()`.
7. **Encrypt the stored Discord tokens** via `databaseHooks.account.create.before`, or consciously decide not to.

Open follow-ons this leaves: the actual role-ID → permission mapping (already listed as "not yet specified" on the map), the refresh TTL, and whether we ever want the always-on Gateway bot for instant ban propagation. The design above does not preclude adding one later — it would just write into the same `users` fields.

---

## 5. `better-convex` / kitcn — **skip**

### It is not called `better-convex` any more

- `udecode/better-auth-convex` → **archived**, description reads *"Moved to https://github.com/udecode/better-convex"*.
- `udecode/better-convex` → redirects to **[`udecode/kitcn`](https://github.com/udecode/kitcn)** (same GitHub repo ID `1027166955`). Docs at [kitcn.dev](https://kitcn.dev).
- npm [`better-convex`](https://www.npmjs.com/package/better-convex) is **frozen at v0.11.0 (2026-03-15)** and **not marked deprecated** — no tombstone, no README. It still pulls ~840 downloads/week from stale lockfiles. Anyone arriving from a blog post gets an abandoned package with no signal that it moved.
- Current package is [`kitcn`](https://www.npmjs.com/package/kitcn), **v0.16.0, 2026-07-30**.

### What it actually is: a framework, not a template

Its own README: *"Type-safe Convex framework with a tRPC-style server API, Drizzle-style ORM, and TanStack Query client integration."* Its docs index: *"kitcn is a complete framework for Convex… **This is not just a query wrapper.** It's how you build production Convex applications."*

Modules at v0.16.0: `kitcn/server` (cRPC — a tRPC clone with `c.query`/`c.mutation`/`c.action`, Zod input/output, middleware, `CRPCError`), `kitcn/orm` (a Drizzle-style ORM over Convex with `convexTable`, relations, `findMany`/`with`, aggregates, **RLS policies**, triggers, foreign keys with cascade, soft deletes, scan guardrails), `kitcn/react` (TanStack Query bindings), `kitcn/rsc`, `kitcn/auth`, `kitcn/ratelimit`, `kitcn/aggregate`, `kitcn/solid`, plus a `kitcn` CLI (`init`, `add`, `dev`, `codegen`, `migrate`, `env push`, `deploy`, `aggregate backfill`).

The engineering looks genuinely good — ADRs, changesets, real tests, a serious ORM. That is not the problem.

### Lock-in is total, not incremental

Despite the docs advertising *"Incremental adoption — add features as you need them, migrate function by function"*:

- You stop importing `query`/`mutation`/`action` from `convex/server` and use a generated cRPC builder instead. **Every backend function** is in kitcn's dialect.
- `defineSchema`/`convexTable` come from `kitcn/orm`, not `convex/server`. Our schema file is kitcn-shaped.
- Docs state *"Docs use the ORM (`ctx.orm`) everywhere"*; `ctx.db` becomes the escape hatch.
- Client reads go through `crpc.*.queryOptions()` into TanStack Query, not Convex's `useQuery`. **This collides directly with the map's PPR plan** — our live islands are built on Convex React subscriptions.
- Mandatory codegen and a wrapped dev loop (`npx kitcn dev` wraps `convex dev`); `generated/server.ts` is *"the canonical server contract"*.
- A prescribed directory layout (`convex/functions/`, `convex/lib/crpc.ts`, `convex/shared/api.ts`, `kitcn.json`, a `@convex/*` tsconfig alias).

Peer ranges gate *our* upgrade schedule: `convex >=1.42` (moved `>=1.32 → 1.33 → 1.35 → 1.36 → 1.38 → 1.42` across five minors), `better-auth >=1.6.11 <1.7.0`, and `hono` **pinned exactly to `4.12.9`**.

### Maintenance

| Signal | kitcn | `@convex-dev/better-auth` |
| --- | --- | --- |
| Version | 0.16.0 (2026-07-30) | 0.12.5 (2026-06-27) |
| Stars | 434 | 765 |
| npm downloads/week | **1,838** | **151,335** |
| Human commits | 581 of ~607 from `zbeyens` (~87%) | 545 of ~600 from `erquhart` |
| Backing | one individual (Plate/udecode author) | Convex, the company |
| Commit cadence | Apr ≥38, May 27, Jun 23, **Jul 12, Aug 0** | releases through Jun, active PR branches Aug |

Both are bus-factor-1. The difference is *whose* bus. `erquhart` is Convex staff shipping into the Convex org with other Convex engineers in the contributor list; `zbeyens` is one person with a day job on Plate.

`VISION.md` states the breakage policy outright: *"Closed-alpha evolution defaults to hard cuts after deliberate confirmation, not compatibility debris"* and *"Prefer deletion and direct ownership over aliases, forwarding wrappers, fallback parsing, and migration bridges."* The changelog delivers: **"Breaking changes" sections in 0.6.0, 0.7.0, 0.11.0, 0.12.0, 0.13.0, 0.14.0, 0.15.0 and 0.16.0** — every minor since 0.11. Meanwhile the sole open issue (#295, 2026-06-28) has one comment — *"any updates ?"* — unanswered since 2026-07-08.

Minor hygiene flag: a `.netrc` containing a `ghs_` GitHub App installation token is committed at repo root. Almost certainly expired and harmless, but not what you want to find in the project you're handing your entire data layer to.

### The decisive fact: it forks the official component

- `better-convex@0.11.0` and `kitcn@0.12.0` depended on `@convex-dev/better-auth ^0.11.1`.
- **From `kitcn@0.13.0` onward that dependency is gone.** kitcn ships its own reimplementation.
- Its [migration guide](https://kitcn.dev/docs/migrations/auth) is literally titled *"From Better Auth Component"*: *"we'll migrate from `@convex-dev/better-auth` (the component-based auth package) to `kitcn`. You'll remove the component pattern, update imports, and configure the new trigger system."* Auth data moves out of the component namespace into the app namespace, which for existing data means a **destructive `npx convex import --replace`** with the docs' own warning that *"Convex internals can change over time, which can invalidate this migration."*
- kitcn keeps up by having its maintainer manually re-derive fixes from a personal fork ([`zbeyens/convex-better-auth`](https://github.com/zbeyens/convex-better-auth)), driven by an agent skill named `sync-convex-auth`. The repo even carries incident write-ups for this exact failure mode (`docs/solutions/integration-issues/convex-better-auth-upstream-sync-runtime-fixes-20260416.md`).

So adopting kitcn means our **authentication layer's correctness depends on one person manually syncing security fixes** that the official component's 151k weekly users receive automatically.

### Verdict: skip. Not even cherry-pick.

Cherry-picking is not really on the table — the pieces are not separable. cRPC assumes the generated builder; the ORM assumes kitcn's `defineSchema`; the rate limiter and aggregate modules are `kitcn/*` subpath exports of the same package, so "just using the rate limiter" still installs the framework and inherits its peer ranges.

What we can take for free is the **ideas**: the RLS-policy shape and scan guardrails are good patterns worth reimplementing in a few lines of our own helpers, and for rate limiting and aggregation there are first-party Convex components with no framework attached.

**Recommendation: skip kitcn entirely. Use `@convex-dev/better-auth` directly.**

---

## 6. Would Convex Auth be better after all?

**No.** The working assumption holds. Convex Auth (`@convex-dev/auth`, [labs.convex.dev/auth](https://labs.convex.dev/auth)) is not deprecated or archived, but it is materially weaker on every axis we care about.

Convex's own docs say so, verbatim ([docs.convex.dev/auth](https://docs.convex.dev/auth)):

> Convex Auth is in beta (it isn't complete and may change in backward-incompatible ways) and doesn't provide as many features as third party auth integrations. Since it doesn't require signing up for another service it's the quickest way to get auth up and running.

And [labs.convex.dev/auth](https://labs.convex.dev/auth) opens with: *"NOTE: Convex Auth is in beta. Please share any feedback you have on Discord."* Plus, on the docs page: *"Support for Next.js is under active development. If you'd like to help test this experimental support please give it a try!"* — **Next.js support is still explicitly experimental**, which is disqualifying for us on its own.

| | `@convex-dev/auth` | `@convex-dev/better-auth` |
| --- | --- | --- |
| Latest npm | **0.0.94** (2026-06-09) | 0.12.5 (2026-06-27) |
| Version history | 0.0.90 (Sep 25) → 0.0.94 (Jun 26) — five patches in ~9 months | seven minors in ~14 months |
| GitHub releases | **none at all** (tags only) | tagged + documented migrations |
| Stars | 175 | 765 |
| Open issues / PRs | **90 / 38** | 111 / — |
| Last commit on `main` | 2026-06-16 | 2026-06-27 |
| Next.js | *"under active development"*, experimental | first-class framework guide |
| Discord OAuth + arbitrary scopes | via Auth.js provider configs | via Better Auth `socialProviders.discord` with `scope`, `getUserInfo`, `mapProfileToUser` |

The one thing that would flip this is if Convex Auth had a materially better security story. It does not — both issue a JWT that the deployment verifies through `auth.config.ts`, so the trust model in §2 is identical.

**One honest caveat.** Better Auth is *not* listed on [docs.convex.dev/auth](https://docs.convex.dev/auth). That page steers readers to Clerk, WorkOS AuthKit, Auth0 and "Custom Auth Integration" first, then Convex Auth. The only mention of Better Auth anywhere in the main Convex docs is on the [component-authoring page](https://docs.convex.dev/components/authoring), as an example of a hybrid component. So the component lives at `labs.convex.dev`, in the Convex GitHub org, maintained by Convex staff, with 151k weekly downloads — but it is not (yet) blessed on the canonical auth page. Read that as "not yet promoted," not "not endorsed": the Convex org owns the repo and its docs domain.

Clerk deserves one line of consideration since Convex recommends it first: it is the lowest-friction option and has Discord as a social connection, but it is another SaaS with a free-tier ceiling for a no-income community project, and getting Discord *guild* scopes and the stored provider access token out of it is more awkward than Better Auth's `getUserInfo`/`getAccessToken`. Not worth revisiting unless the Better Auth component's bus factor becomes a live problem.

---

## 7. Bonus: rate limiting (adjacent open item on the map)

The map lists "rate limiting and abuse controls" as not yet specified. There is a first-party answer: **[`@convex-dev/rate-limiter`](https://www.convex.dev/components/rate-limiter)** ([repo](https://github.com/get-convex/rate-limiter)) — token-bucket and fixed-window limits, `limit()` / `check()` / `reset()`, optional sharding for high throughput, and a `useRateLimit()` React hook for "try again in Xs" without a round trip. Its differentiator is that **consumption is transactional**: it rolls back if the surrounding mutation fails, so no double-spend. `reset()` after a successful sign-in is the documented login-throttle pattern.

Convex offers no WAF, IP throttling, or CAPTCHA — abuse control is application-layer, consistent with their stated authorization philosophy: *"Convex doesn't need an opinionated authorization framework like RLS… the most common way is to simply write code that checks if the user is logged in and if they are allowed to do the requested action at the beginning of each public function."* That is another reason kitcn's RLS module is not a draw.

---

## Sources

**Convex + Better Auth component**
- Docs: https://labs.convex.dev/better-auth (getting started, [Next.js guide](https://labs.convex.dev/better-auth/framework-guides/next), [Authorization](https://labs.convex.dev/better-auth/basic-usage/authorization), [Triggers](https://labs.convex.dev/better-auth/features/triggers), [Local Install](https://labs.convex.dev/better-auth/features/local-install), [Convex Plugin API](https://labs.convex.dev/better-auth/api/convex-plugin), [Component Client API](https://labs.convex.dev/better-auth/api/component-client), [Experimental](https://labs.convex.dev/better-auth/experimental), [Supported Plugins](https://labs.convex.dev/better-auth/supported-plugins))
- Repo: https://github.com/get-convex/better-auth — `src/auth-config.ts`, `src/client/create-client.ts`, `src/component/schema.ts`, issue [#258](https://github.com/get-convex/better-auth/issues/258)
- npm: https://registry.npmjs.org/@convex-dev/better-auth

**Better Auth**
- https://www.better-auth.com/docs/concepts/oauth (provider options, `scope`, `getUserInfo`, `getAccessToken`, server-owned fields)
- https://www.better-auth.com/docs/authentication/discord
- https://www.better-auth.com/docs/concepts/database (`additionalFields`, `mapProfileToUser`)
- https://www.better-auth.com/docs/concepts/users-accounts (token encryption)
- Repo: https://github.com/better-auth/better-auth

**Convex**
- https://docs.convex.dev/auth · [overview.md](https://docs.convex.dev/auth/overview.md) · [functions-auth](https://docs.convex.dev/auth/functions-auth) · [advanced/custom-auth](https://docs.convex.dev/auth/advanced/custom-auth) · [advanced/custom-jwt](https://docs.convex.dev/auth/advanced/custom-jwt)
- https://docs.convex.dev/api/interfaces/server.UserIdentity
- https://docs.convex.dev/functions/http-actions
- https://docs.convex.dev/production/state#beta-features
- Convex Auth: https://labs.convex.dev/auth · https://github.com/get-convex/convex-auth
- Rate limiter: https://www.convex.dev/components/rate-limiter · https://github.com/get-convex/rate-limiter

**Discord** (all under https://docs.discord.com/developers)
- [OAuth2](https://docs.discord.com/developers/topics/oauth2), [User Resource](https://docs.discord.com/developers/resources/user), [Guild Resource](https://docs.discord.com/developers/resources/guild)
- [Gateway](https://docs.discord.com/developers/events/gateway), [Gateway Events](https://docs.discord.com/developers/events/gateway-events), [Webhook Events](https://docs.discord.com/developers/events/webhook-events)
- [Privileged Intent Review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review), [You Might Not Need a Privileged Intent](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent)
- [Rate Limits](https://docs.discord.com/developers/topics/rate-limits), [Opcodes and Status Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes)
- [Changes to Privileged Intent Access](https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps)

**kitcn / better-convex**
- https://github.com/udecode/kitcn (README, `VISION.md`, `CHANGELOG.md`, releases), https://kitcn.dev, https://kitcn.dev/docs/migrations/auth
- https://www.npmjs.com/package/kitcn, https://www.npmjs.com/package/better-convex
- https://github.com/udecode/better-auth-convex (archived), https://github.com/zbeyens/convex-better-auth (personal fork)
