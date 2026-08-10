# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

The repo is `MinecraftCommands/mcc-tools`, the sole `git remote` (`origin`) and the configured `gh` default, so bare `gh issue` / `gh pr` commands resolve to it without `--repo`.

## Pull requests as a triage surface

**PRs as a request surface: yes.** External PRs are treated as feature requests and run through the same triage labels and states as issues.

- **Read a PR**: `gh pr view <number> --comments`, and `gh pr diff <number>` for the diff.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.
- **List external PRs for triage**: the association field is only reachable via the REST API — `gh pr list --json` does **not** expose `authorAssociation`, and neither does `gh issue list --json`. Use:

  ```sh
  gh api "repos/MinecraftCommands/mcc-tools/pulls?state=open&per_page=100" \
    --jq '.[] | select(.author_association | IN("CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE"))
          | {number, title, user: .user.login, association: .author_association}'
  ```

  Keep only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, and `NONE`; drop `OWNER`, `MEMBER`, and `COLLABORATOR`. Note that association is per-repo and changes over time — a contributor who later joins the org stops matching, so re-read it rather than caching a roster.

Two GitHub quirks to watch:

- **One number space.** A bare `#42` may be an issue or a PR — resolve with `gh pr view 42`, falling back to `gh issue view 42`.
- **`/issues` returns PRs too.** The REST `repos/.../issues` endpoint includes pull requests in its response. When you want issues only, drop anything carrying a `.pull_request` key: `--jq '.[] | select(.pull_request == null)'`. The `gh issue list` command already filters these out; raw `gh api` calls do not.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue; its tickets are GitHub **sub-issues** of it.

Both sub-issues and native issue dependencies are enabled on this repo — there is no fallback path, so do not use task lists or a `Blocked by:` body line.

**The database-id trap.** The sub-issue and dependency endpoints take an issue's numeric **database id**, never its `#number` and never its `node_id`. These are wildly different values — issue `#9` has database id `2542828622`. Resolve one with:

```sh
gh api repos/MinecraftCommands/mcc-tools/issues/<number> --jq .id
```

Passing a `#number` where a database id belongs is the most common way these calls fail.

- **Map**: one issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / Not-yet-specified / Out-of-scope body. Create with `gh issue create --label wayfinder:map`.
- **Child ticket**: create the issue, then attach it to the map:

  ```sh
  gh api --method POST repos/MinecraftCommands/mcc-tools/issues/<map-number>/sub_issues \
    -F sub_issue_id=<child-database-id>
  ```

  Label each ticket `wayfinder:<type>` — one of `research`, `prototype`, `grilling`, `task`.

- **Blocking**: add an edge with

  ```sh
  gh api --method POST repos/MinecraftCommands/mcc-tools/issues/<child-number>/dependencies/blocked_by \
    -F issue_id=<blocker-database-id>
  ```

  A ticket is unblocked when every blocker is closed; `issue_dependencies_summary.blocked_by` counts **open** blockers only, so it is the live gate.

- **Frontier query**: list the map's children, then check each one's blocker count — the summary is not guaranteed on the list payload, so read it per child:

  ```sh
  gh api repos/MinecraftCommands/mcc-tools/issues/<map-number>/sub_issues \
    --jq '.[] | select(.state == "open") | select(.assignee == null) | .number'
  ```

  For each number returned, keep it only if `blocked_by` is `0`:

  ```sh
  gh api repos/MinecraftCommands/mcc-tools/issues/<number> \
    --jq .issue_dependencies_summary.blocked_by
  ```

  The survivors are the frontier, in map order; the first one wins.

- **Claim**: `gh issue edit <number> --add-assignee @me` — the session's first write, before any work.
- **Resolve**: `gh issue comment <number> --body "<answer>"`, then `gh issue close <number>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
