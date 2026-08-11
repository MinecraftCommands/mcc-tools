# Convex preview deployments with Vercel, including seeding cost

Research for [#33](https://github.com/MinecraftCommands/mcc-tools/issues/33). Resolves the question behind
[#7](https://github.com/MinecraftCommands/mcc-tools/issues/7).

Researched 2026-08-11. Convex preview deployments are documented as **beta**.

> No repo convention for research notes existed (`docs/` held only `docs/agents/`), so this lives in
> `docs/research/`.

## TL;DR

- Convex preview deployments give **fully isolated backends per git branch** — separate data, functions,
  crons and config. This is exactly what #7 asked for, and it lands without a table-prefix scheme.
- **The seeding cost worry does not survive contact with the numbers.** The entire Java changelog corpus
  is **~5 MB** of raw JSON across **403 articles** (measured, see below). A full-corpus seed costs roughly
  1–2 % of the free plan's monthly database I/O and 2–4 % of its storage. Several concurrent previews are
  affordable.
- The **real** cost risks are (a) letting the ingestion cron run inside every preview, and (b) using
  `--preview-create`, which re-provisions and re-seeds on **every push**. Both are avoidable by
  configuration.
- Recommended: `--preview-run` a **small checked-in fixture** (20–30 articles), guard the cron off in
  previews, and keep a production snapshot import as a manual escape hatch.
- Auth works, but not for free: with `@convex-dev/better-auth` the OAuth callback lands on the **Convex**
  `.convex.site` origin, which differs per preview. Better Auth's `oAuthProxy` plugin exists precisely for
  this and is the answer.

---

## 1. How the Vercel/Convex preview integration is wired

### Setup

Per [Using Convex with Vercel](https://docs.convex.dev/production/hosting/vercel):

- Override the Vercel build command to `npx convex deploy --cmd 'npm run build'`. Convex deploys functions
  first, then runs the frontend build with `CONVEX_URL` already pointing at the right backend.
- Set `CONVEX_DEPLOY_KEY` **twice** in Vercel:
  - a **Production** deploy key (from the deployment's Settings → General, with `deployment:deploy`
    permission), scoped to the *Production* environment only;
  - a **Preview** deploy key (from the *project* Settings page), scoped to the *Preview* environment only.
- If auto-detection of the frontend URL env var name fails, `--cmd-url-env-var-name CUSTOM_CONVEX_URL`
  overrides it. For Next.js this needs to be `NEXT_PUBLIC_CONVEX_URL` to be visible client-side.

### On a PR / on a push

Vercel creates a preview deployment when you push to a non-production branch, open a PR, or run `vercel`
without `--prod` ([Vercel: Environments](https://vercel.com/docs/deployments/environments)).

`npx convex deploy` then sees the preview deploy key and takes the preview path. From the CLI source
([`deploy.ts`](https://github.com/get-convex/convex-backend/blob/main/npm-packages/convex/src/cli/deploy.ts)):

```ts
const previewName =
  cmdOptions.previewCreate ?? cmdOptions.previewName ?? gitBranchFromEnvironment();
const reuse = cmdOptions.previewCreate === undefined;
```

So the preview deployment is keyed on the **git branch name**, inferred automatically on Vercel, Netlify,
Cloudflare Pages and GitHub CI. The docs put it plainly:

> "This command will create a preview deployment if needed and reuse the existing preview deployment and
> its data when one with the same name already exists."
> — [Preview Deployments](https://docs.convex.dev/production/hosting/preview-deployments)

**Consequence that matters for cost:** pushing 30 commits to one branch produces 30 Vercel deployments but
**one** Convex preview deployment, provisioned and seeded once. `--preview-create` inverts this — it
"deletes and recreates an existing preview deployment with the same name" on every deploy. Do not use it.

### On PR close — teardown is *not* event-driven

Neither side tears down on PR close.

- **Convex** cleans up on a timer, not an event: preview deployments are "automatically cleaned up 5 days
  after they are created (14 days on the Professional, Business and Enterprise plans)". The expiration date
  is adjustable per deployment in the dashboard, and deployments can be deleted manually.
- **Vercel** keeps preview deployments under the project's
  [deployment retention policy](https://vercel.com/docs/security/deployment-retention) — "unlimited
  deployment retention for all deployments, regardless of the plan" by default. Notably, "the latest preview
  deployment for a Git branch that is still active" is explicitly *exempt* from retention deletion, where
  "active" means the branch is undeleted and its PR is unmerged and unclosed. Closing the PR removes that
  exemption; it does not itself delete anything.

So: a stale branch's Convex backend evaporates in 5 days on the free plan, whether or not the PR is still
open. A long-lived PR will silently lose its backend mid-review and get a fresh, re-seeded one on the next
push. That is a UX wrinkle, not a cost problem.

Every preview deployment "counts towards the deployment limit of your team" — **40** on Free/Starter
([Limits](https://docs.convex.dev/production/state/limits)). At a 5-day TTL, 40 is not a realistic ceiling
for this project.

---

## 2. Seeding: how a preview deployment gets data

**Empty by default.** A preview deployment gets your functions, schema and indexes; it does not get data.

Three ways to fill it:

### a. `--preview-run` (the intended hook)

```bash
npx convex deploy --cmd 'npm run build' --preview-run 'seed:previewSeed'
```

The flag is documented as "Function to run if deploying to a preview deployment. This is ignored if
deploying to a production deployment."

**Critically — and this is not stated in the prose docs — it only runs on first creation.** From
`deploy.ts`:

```ts
if (options.previewRun !== undefined && data.isNewDeployment) {
  await runFunctionAndLog(ctx, { ... });
}
```

`isNewDeployment` is false when an existing preview deployment for the branch is reused. So the seed runs
**once per branch**, not once per push. This single fact defuses most of the cost worry.

Caveat from the docs: "if the function call fails, the `deploy` command will fail, but the new preview
deployment will have already been provisioned." A failed seed leaves an empty-but-existing backend that the
next push will *not* re-seed (because it is no longer new). Seed functions must be idempotent and
self-healing, or you need `--preview-create` to recover — a reason to keep the seed dead simple.

### b. Snapshot import

`npx convex import --preview-name <branch> <snapshot>.zip` restores a backup ZIP into a preview deployment
([Import](https://docs.convex.dev/database/import-export/import),
[Backup & Restore](https://docs.convex.dev/database/backup-restore)). ZIP backups preserve `_id`,
`_creationTime` and file storage. Backups exclude code, config, pending scheduled functions and environment
variables.

This is a manual, out-of-band step — it does not fit into the Vercel build, because the build has no
production snapshot to hand. Treat it as an escape hatch.

### c. Let the ingestion cron populate it

Preview deployments have "separate functions, data, crons and all other configuration from any other
deployments". So a cron committed to `convex/crons.ts` **will run in every preview deployment**. Left
unguarded, every preview independently backfills the whole corpus from Mojang. See §3.

---

## 3. The cost question, with real numbers

### Measured corpus size (2026-08-11)

Fetched directly from `https://launchercontent.mojang.com/v2/`:

| Measurement | Value |
| --- | --- |
| `javaPatchNotes.json` manifest | 249,726 bytes (~244 KB) |
| Article entries | **403** |
| Sampled article bodies (n = 21, evenly spread) | mean **12,915 B**, median **8,195 B** |
| Smallest / largest in sample | 518 B (`26.1-rc-1`) / 81,997 B (`1.21.6`) |
| **Extrapolated full corpus** | **~5.0 MB** |

Storage in Convex will be larger than the raw source, because per the map (#27) articles are stored fully
processed: sanitized HTML, fixed list nesting, id'd headings, syntax-highlighted markup, section tree, and
extracted plain text. Assume **2–4×** → call it **10–20 MB per full-corpus deployment**, plus search index.

### Free plan budget

From [Pricing](https://www.convex.dev/pricing) and [Limits](https://docs.convex.dev/production/state/limits):

| Resource | Free / Starter included |
| --- | --- |
| Database storage | 0.5 GB |
| Database I/O (bandwidth) | 1 GB / month |
| File storage | 1 GB |
| Search storage | 0.5 GB |
| Data egress | 1 GB / month |
| Function calls | 1,000,000 / month |
| Action compute | 20 GB-hours |
| Deployments | 40 |

Usage is metered **per team**, not per deployment: "your team's usage of a resource is calculated as the sum
of all your projects' individual usage" ([Pricing FAQ](https://www.convex.dev/pricing/faq)). Preview and dev
deployments therefore share one pot with production. (Only *local* deployments are excluded from quotas —
[Local Deployments](https://docs.convex.dev/cli/local-deployments).)

Database I/O is defined as document and index data moved between functions and the database, counting
everything scanned, not just what is returned. Imports are metered too — they show up as the `_cli/import`
function in the usage dashboard, and backup generation "uses database bandwidth to read all documents".

Overrun behaviour differs sharply by plan: on **Free**, "your deployment may return HTTP errors in response
to function calls". On Starter/Pro, "deployments will always continue to serve traffic" and you are billed
the overage ($0.20–0.22/GB storage, $0.20/GB database I/O, $0.12/GB egress).

### Answering the worry directly

**Does a full-corpus seed count as significant data transfer or storage on the free tier?**
No. A full-corpus seed writes ~10–20 MB → roughly **1–2 % of the 1 GB monthly database I/O** and, while it
lives, **2–4 % of the 0.5 GB storage**. The corpus is megabytes, not gigabytes.

**With several PRs open, do we pay several times over?**
Yes, linearly — storage is per-deployment and all deployments share one team quota. But the multiplier is
small. Five concurrent full-corpus previews ≈ **50–100 MB, or 10–20 % of the storage quota**, and the 5-day
TTL caps how long they accumulate. The seeding I/O also multiplies, but per *branch*, not per push
(§2a): 20 new preview branches in a month ≈ 200–400 MB of the 1 GB I/O budget. That is noticeable but not
fatal — and a fixture subset removes it entirely.

**Where the money actually leaks.** Three failure modes cost far more than the seed:

1. **Unguarded crons in previews.** Per the map, ingestion polls the manifest often and backfills history.
   Running that in five previews for five days each means five independent backfills (403 outbound fetches,
   ~5 MB written, plus action compute) *plus* continuous polling. This is the largest and most easily
   avoided cost, and it is pure waste — previews do not need fresh Mojang data.
2. **`--preview-create`.** Re-provisions and re-seeds on every push. Turns a once-per-branch cost into a
   once-per-commit cost. Never use it in CI.
3. **Backup-based seeding as routine.** Generating the production snapshot itself burns database I/O
   reading every document, *before* the import burns it again writing. Per-PR snapshot seeding pays twice.

---

## 4. Cheaper patterns

| Pattern | Verdict |
| --- | --- |
| **Small checked-in fixture, seeded via `--preview-run`** | **Recommended.** ~20–30 articles ≈ 320 KB raw / <1 MB processed. Deterministic, reviewable, versioned with the branch, zero dashboard steps, negligible quota. Pick the recent 20 plus deliberate nasties — `1.21.6` (82 KB) and `23w31a` (43 KB) — so processing/highlighting/anchoring gets exercised. |
| **Full production snapshot per preview** | Escape hatch only. Fine as an occasional manual `convex import --preview-name` when a PR genuinely needs corpus-scale data (search relevance, ingestion perf). Not in CI. |
| **Point previews at production read-only** | **Not viable and not desirable.** Convex has no read-only cross-deployment access mode, and it reintroduces exactly the production-contamination risk #7 was filed about. |
| **Let the cron populate previews naturally** | **Actively harmful.** Slowest to become useful, most expensive, and multiplies with open PRs. Guard the cron off in previews instead. |

Guarding the cron: preview deployments receive the project's **default environment variables** for their
deployment type — "these default values will be used when creating a new deployment, and will have no effect
on existing deployments (they are not kept in sync)"
([Environment Variables](https://docs.convex.dev/production/environment-variables)). Set a preview default
such as `DISABLE_INGESTION_CRON=1` (or an explicit `DEPLOY_ENV=preview`) and make the cron handler a no-op
when set. Cheaper still, `crons.ts` can register nothing at all when the flag is present.

---

## 5. Auth in previews (better-auth + Discord OAuth)

**It works, but it needs the OAuth proxy — a plain per-preview setup will not.**

The awkward part is *which* origin Discord calls back to. With
[`@convex-dev/better-auth`](https://labs.convex.dev/better-auth), Better Auth runs on the **Convex**
deployment as HTTP actions on the `.convex.site` domain; the Next.js `app/api/auth/[...all]/route.ts`
handler merely proxies to it. The stack needs `BETTER_AUTH_SECRET`, `SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`
and `NEXT_PUBLIC_CONVEX_SITE_URL`.

So a preview has **two** unstable origins, not one:

- the Vercel origin — the branch URL `<project>-git-<branch>-<scope>.vercel.app` is stable per branch, but
  the commit URL `<project>-<hash>-<scope>.vercel.app` changes every push
  ([Generated URLs](https://vercel.com/docs/deployments/generated-urls));
- the Convex preview `.convex.site` origin, which is a fresh backend name per branch.

Discord's developer portal requires exact redirect URIs; registering one per branch is not workable.

**The fix: Better Auth's [`oAuthProxy` plugin](https://www.better-auth.com/docs/plugins/oauth-proxy)**,
which exists for exactly this case. The preview initiates OAuth using the **production** redirect URI;
Discord calls back to production; production exchanges the code, encrypts the profile, and redirects to the
preview, which creates its own session locally. The docs note there is "no database write on production" —
so previews stay isolated, which is the whole point of #7.

Requirements:

- `productionURL` set to the production Better Auth base (the production Convex `.convex.site` origin);
  proxying is skipped when it equals `baseURL`, so production behaves normally.
- **A shared proxy secret across all environments** — "All environments (production, preview, localhost)
  must use the same encryption key", else `state_mismatch`. Set it as a Convex **preview default env var**
  so every new preview backend gets it automatically. Use a dedicated proxy secret rather than
  `BETTER_AUTH_SECRET`: a leak then only allows hijacking OAuth flows inside the short `maxAge` window
  (default 60 s), not forging sessions globally.
- `trustedOrigins` must cover preview origins. Better Auth
  [supports wildcards](https://www.better-auth.com/docs/reference/options) (`https://*.vercel.app`) and a
  request-derived function. Wildcard the Vercel preview domain **only in preview deployments** — never let a
  `*.vercel.app` wildcard reach production config.
- Only one Discord application is needed, with a single production redirect URI.

Remaining wrinkle: the map gates membership on the MCC Discord guild and drives moderation from roles. That
works unchanged in a preview — the proxy hands back the same Discord profile — but each preview has its own
empty user table, so roles/permissions must be re-derived on first sign-in rather than read from seeded
rows. Worth checking when the auth ticket lands, not a blocker here.

---

## 6. Recommended preview strategy

1. **Vercel build command:**
   ```
   npx convex deploy --cmd 'npm run build' --preview-run 'seed:previewSeed'
   ```
   Two `CONVEX_DEPLOY_KEY` values, environment-scoped: Production key → Production, Preview key → Preview.
   **No `--preview-create`.**
2. **Seed a checked-in fixture**, not a snapshot: ~20 recent articles plus `1.21.6` and `23w31a` as
   processing stress cases. Make `seed:previewSeed` idempotent (no-op if the corpus table is non-empty) so a
   partial failure can be repaired by hand without a re-provision.
3. **Disable the ingestion cron in previews** via a preview default env var. This is the single highest-value
   cost control.
4. **Escape hatch:** `npx convex import --preview-name <branch> snapshot.zip` when a PR genuinely needs the
   full corpus. Manual, deliberate, rare.
5. **Auth:** enable `oAuthProxy` with `productionURL` = production Convex site URL, a dedicated shared proxy
   secret as a preview default env var, and a `*.vercel.app` `trustedOrigins` entry scoped to previews only.
   One Discord app.
6. **Accept the 5-day TTL.** Long-lived PRs will occasionally get a fresh backend. Since the seed is a
   fixture, the recovery is a push. Bump the expiry in the dashboard for a specific long-running PR if it
   ever matters.

Under this strategy a preview costs well under 1 MB of storage and a few hundred KB of I/O — noise against
0.5 GB and 1 GB/month, even with a handful of PRs open at once.

---

## 7. What this means for #7

#7 asked for table prefixes so preview branches would not break each other or production, and proposed
switching Prisma → Drizzle to get them.

Convex makes the request moot rather than solving it: preview deployments give an entire isolated backend
per branch — separate data, functions, crons, schema, indexes and environment variables — so there is no
shared namespace to prefix. The ORM-migration workaround that motivated the Drizzle switch is gone with
Prisma and Drizzle themselves (both removed in `1d3a870`).

The one thing #7 wanted that Convex does **not** hand over for free is **preview data**: isolation is total,
so previews start empty. That is a seeding decision, addressed in §4 and §6 above, and it is cheap.

**#7 can be closed** with a pointer to this document.

---

## Sources

All primary; retrieved 2026-08-11.

- [Convex — Preview Deployments](https://docs.convex.dev/production/hosting/preview-deployments)
- [Convex — Using Convex with Vercel](https://docs.convex.dev/production/hosting/vercel)
- [Convex — Limits](https://docs.convex.dev/production/state/limits)
- [Convex — Pricing](https://www.convex.dev/pricing) and [Pricing FAQ](https://www.convex.dev/pricing/faq)
- [Convex — Environment Variables](https://docs.convex.dev/production/environment-variables)
- [Convex — Data Import](https://docs.convex.dev/database/import-export/import)
- [Convex — Backup & Restore](https://docs.convex.dev/database/backup-restore)
- [Convex — Local Deployments](https://docs.convex.dev/cli/local-deployments)
- [Convex CLI source — `npm-packages/convex/src/cli/deploy.ts`](https://github.com/get-convex/convex-backend/blob/main/npm-packages/convex/src/cli/deploy.ts)
  (authoritative for `--preview-run` firing only on `isNewDeployment`)
- [Convex + Better Auth docs](https://labs.convex.dev/better-auth)
- [Better Auth — OAuth Proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy)
- [Better Auth — Options reference (`trustedOrigins`)](https://www.better-auth.com/docs/reference/options)
- [Vercel — Environments](https://vercel.com/docs/deployments/environments)
- [Vercel — Generated URLs](https://vercel.com/docs/deployments/generated-urls)
- [Vercel — Deployment Retention](https://vercel.com/docs/security/deployment-retention)
- [Vercel — System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- Corpus measurements taken directly from `https://launchercontent.mojang.com/v2/javaPatchNotes.json` and
  403 linked `contentPath` documents (21-article sample), 2026-08-11.
