# Design: shareable review deployments + PR link write-back

**Status:** exploration. Nothing here is built; this doc frames the two ideas,
makes the decisions that are cheap to make now, and names the ones that need
the user's call (chiefly: which hosting provider).

Two ideas, second building on the first:

1. **Deploy the review** — publish the narrative review (Prologue + Chapters +
   diffs) to a hosted URL so people who don't run Review Buddy can read it.
2. **Link it from the PR** — after deploying, write the hosted URL into the
   PR's description so the review travels with the PR.

Companion: `ARCHITECTURE.md` (endpoints, data sources), `build-plan.md`
(deferred "GitHub collaboration" bucket — idea 2 lands there).

---

## 1. What "deploy" means here: a static snapshot, not a hosted server

Today the viewer is already a prebuilt static app; the only live parts are
three endpoints on the loopback-only server:

| Endpoint | Live behavior | Static equivalent |
|---|---|---|
| `GET /api/review` | merged A+B+computed JSON | a literal JSON file — trivially freezable |
| `GET /api/file-content?path=&side=` | reads source C on demand | pre-resolve every file the diff touches into a content manifest |
| `POST /api/done` | unblocks the hook | must not exist — shared viewer is **read-only** |

So the deployable artifact is a **snapshot**: copy of `src/ui/dist/` + the
merged review JSON + pre-fetched file contents, all frozen at the PR's
`headRefOid`. No server-side compute is needed after export, which means any
static host works and there is nothing long-lived to babysit.

**Decision — snapshot, not tunnel.** The alternative (tunnel the live local
server via ngrok/`cloudflared`) was considered and rejected: it dies with the
hook process, exposes a *writable* server (`/api/done` would let any visitor
unblock the author's turn), and fights the loopback-only hardening we
deliberately built. A frozen snapshot has none of these problems.

### Export mechanics

- New module `src/server/export.ts`: `exportSnapshot(session) → dir` writes
  ```
  snapshot/
  ├── index.html + assets/          # copied viewer dist
  ├── api/review                    # the merged JSON, path-shaped so the
  │                                 #   existing fetch("/api/review") just works
  └── api/files/<key>.json          # one file per (path, side) the diff touches
  ```
- The query-string endpoint can't be a static file. The snapshot's review JSON
  carries a `meta.shared: true` flag; when set, the client resolves
  file-content from `api/files/<hash(path:side)>.json` instead of the query
  endpoint, and hides Done/verdict/round-trip UI entirely (read-only mode).
  This is a small, flag-gated client change — with `shared` absent, behavior
  is byte-identical to today.
- Hosts that don't serve extensionless files need `api/review` → `review.json`
  + a tiny fallback fetch; handle in the adapter, not the viewer.
- Renamed files' base side and "expand full file" work in the snapshot only if
  pre-resolved at export time — export resolves **every** file referenced by
  the diff, both sides, so the shared viewer never has a dead expander.

### Deploy adapters

`src/server/deploy/<provider>.ts` with one interface:
`deploy(snapshotDir, opts) → { url }`. Each adapter shells out to the
provider's CLI (present-or-fail with a clear install hint), mirroring how we
already treat `gh` as an ambient dependency.

**Open — the actual provider.** The spoken request was "deploy to *hear dot
now*", which is ambiguous in transcription. Nearest real matches, all fine as
first adapter since they're pure static hosts with one-command CLI deploys:
Vercel (the old **now.sh** / `now` CLI — the likeliest intent), **surge.sh**,
Netlify, Cloudflare Pages. The adapter seam makes this a non-blocking
decision; confirm before building the first adapter.

### Trigger: a Share button, not an auto-deploy

**Decision.** Deploy is initiated by the human from the viewer — a **Share**
button that calls a new `POST /api/share` on the *local* server, which runs
export + adapter and returns `{ url }` for the viewer to display/copy. This:

- keeps a human in the loop before code leaves the machine (see §2),
- works identically in the hook flow and `--standalone` (both already own a
  live local server), and
- needs no new config surface for v1.

An auto-deploy flag can come later; it must never be the default.

## 2. The headline risk: this publishes source code

Everything else in this doc is mechanics; this is the decision that matters.
A deployed snapshot contains real diff hunks **and full file contents** for
every touched file. For private repos that is an exfiltration path if handled
casually.

Guardrails (all v1, non-negotiable):

- **Explicit human action** per deploy (the Share button). Never hook-automatic.
- **Unguessable URLs** as the floor: the adapter must generate a random
  subdomain/slug, never `<repo>-<pr>.provider.app`.
- Prefer providers with **access protection** (Vercel deployment protection,
  Cloudflare Access) and surface the option in the Share UI when available.
- A **teardown path** from day one: record deployments in the session dir and
  ship `review-buddy unshare <url>` so a mistaken deploy is revocable.
- The Share confirmation states plainly what will be published and where.

## 3. Idea 2: write the link into the PR description

Cheap once deploy exists, because capture already runs
`gh pr view --json title,body,…,url,headRefOid` (`src/server/git.ts`) — the PR
ref, current body, and head SHA are all in hand.

**Decision — marker block, idempotent replace.** After a successful deploy in
`source: pr` mode, append/replace a fenced region in the body via
`gh pr edit <ref> --body-file`:

```markdown
<!-- review-buddy:link:start -->
📖 [Narrative review](https://…) · snapshot of `abc1234`
<!-- review-buddy:link:end -->
```

- Fetch the **current** body immediately before editing (not the captured one —
  it may be minutes stale), replace only between markers, append the block if
  absent. Never touch text outside the markers; never duplicate the block.
- Re-deploys update the block in place, so the description always points at
  the newest snapshot; pin the SHA in the link text so staleness is visible
  when the PR moves on.
- Only offered when the review source is `pr` (worktree/branch reviews have no
  PR to edit). If `gh pr edit` is denied (no write access — e.g. reviewing a
  fork's PR), fall back to posting a **PR comment** with the same block, and
  say so in the Share result.

Write-back is part of the Share action (one confirmation covers both), shown
as a checkbox defaulting to on in `pr` mode.

## 4. Shape of the build

Small, and cleanly phased after the current Phase 1 surface:

1. **Snapshot export + read-only viewer mode** — `export.ts`, `meta.shared`
   client gate, manifest-based file-content. Testable entirely offline
   (export, open `index.html`, everything renders).
2. **First deploy adapter + `POST /api/share` + Share UI** — blocked only on
   the provider decision.
3. **PR body write-back** — the marker editor + fork-fallback comment.

Each step is independently shippable and none disturbs the hook/round-trip
path (`/api/done` semantics untouched; the snapshot simply omits it).

## 5. Open questions

- **Provider** (§1) — confirm what "hear dot now" was; adapter seam means we
  can start with one and add others.
- **Auth/tokens** — v1 leans on the provider CLI's own login state; no tokens
  stored by Review Buddy. Revisit if a tokened API adapter is ever wanted.
- **Retention** — should `unshare` also run automatically when a PR merges
  (would require the GitHub-collaboration phase's plumbing)? Deferred.
- **Round-trip on shared views** — could shared reviewers leave annotations?
  Explicitly out of scope: that requires a live backend and is a different
  product decision (§1's snapshot choice forecloses it *for snapshots only*).
