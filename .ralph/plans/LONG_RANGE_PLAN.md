# Long Range Plan — GBrain Corporate Adaptation

**Vision:** [VISION.md](VISION.md)
**Approach:** Vertical slices (Cockburn elephant carpaccio). Each slice delivers a
working capability, with passing tests, committed and pushed.
**Branch:** `internal-adaptation` (permanent divergence — master tracks upstream).

**Sequencing principle:** Data first, then search, then navigation, then polish.
There's nothing to search until data is flowing, and no graph to traverse until
entities and links exist. Phase 0 (design) defines the data model that everything
else depends on.

**Status (2026-04-16):** Phase 0 is in progress (`gbrain-alt-f61`). The user's
PARA+GTD information architecture has been captured in VISION.md §5.4. A scoped
POC sprint spec/plan needs to be defined before continuing implementation —
this long-range plan is too broad for direct execution.

**Two-repo topology (vision §1b):**
- **gbrain-alt** (this repo) = the tool (source code, CLI, reusable modules, examples)
- **~/brain/** = the brain repo (markdown pages + deployment config + agent behavior).
  Claude Code sessions run here, calling `gbrain` the same way OpenClaw would.

---

## Audit Summary (2026-04-15)

| Spec Section | Status | Notes |
|---|---|---|
| §3.1 Embeddings (OpenAI-compat gateway) | **Ready** | `embedding.ts` uses OpenAI SDK + env vars. Zero code changes. |
| §3.1 Query expansion (Bedrock adapter) | **Not started** | `expansion.ts` still uses `new Anthropic()`. Needs fetch adapter. |
| §3.2 Typed graph traversal | **Not started** | `traverseGraph()` has no filter params in operations, interface, or engines. |
| §3.4 Orchestrator infrastructure | **Not started** | No orchestrator, schedule, state, or launchd files exist. |
| §3.5 Playwright collectors | **Not started** | No `collectors/` directory. No staging dir references. |
| §5.4 Entity schema mapping | **Not started** | Beads issue `gbrain-alt-73z` (P1) tracks this |
| §5.4 Notion data migration | **Not started** | Depends on entity schema |
| §5.4 Entity resolution | **Not started** | — |
| §5.4 Obsidian view layer | **Not started** | Depends on data in brain |
| 6-layer info architecture mapping | **Not started** | Beads issue `gbrain-alt-n9i` (P2) tracks this |
| Ralph-pva skill porting | **Not started** | Depends on info arch mapping |
| Workflow validation | **Not started** | Depends on everything above |

### Foundation (reused as-is)

PGLite engine (37 ops), import pipeline, hybrid search, chunking, CLI, MCP
server, PGLite lock, sync, link graph, tags, timeline, versioning, file storage.
35 unit test files, 6 E2E test files. v0.9.3 on clean master.

---

## Phase 0 — Entity Schema + Data Model Design

**This is not a vertical slice.** It produces no running code. It's the design
work that every slice depends on — collectors need to know what frontmatter to
emit, the Notion import needs to know what link types to create, and view layers
need to know what fields to query.

**Tracks:** `gbrain-alt-f61` (P0, in_progress), `gbrain-alt-73z` (P1, open)

### Status (2026-04-16)

The user's PARA+GTD taxonomy is now captured in VISION.md §5.4:
- 8 entity types across 5 levels with upward inheritance
- Categorization via properties, not folders
- Many-to-many cross-entity + parent/child relationships
- Inheritance computed by `traverseGraph`, no calculated properties
- People/Orgs outside the level hierarchy

**Remaining work:**
- Define concrete frontmatter schema per entity type (in VISION.md, not as
  committed docs in gbrain-alt — brain repo design belongs in planning docs)
- Define link_type vocabulary and cross-entity relationship schema
- Define a POC sprint that proves the core value before building everything
- `.env.example` + `docs/guides/ai-gateway.md` (this IS gbrain-alt tool config)

### Deliverables

1. **Entity schema + link types** — Update VISION.md §5.4 with:
   - Concrete YAML frontmatter for all 8 entity types
   - Full link_type vocabulary (cross-entity + parent/child)
   - Property definitions per type (status, priority, resource_type, etc.)

2. **Env var setup for Claude Code** — `.env.example` in gbrain-alt (placeholder
   values only) + `docs/guides/ai-gateway.md` covering gateway configuration.

3. **POC sprint definition** — Scoped spec + plan for a provable first slice.
   This long-range plan is too broad for direct execution.

### Definition of done

- [ ] `gbrain-alt-73z` closed — entity schema resolved in VISION.md
- [ ] Entity type frontmatter + link vocabulary defined in VISION.md
- [ ] `.env.example` and ai-gateway guide committed to gbrain-alt
- [ ] POC sprint spec + plan created
- [ ] Committed and pushed

---

## Slice 1 — Brain Repo Setup + Orchestrator + Calendar Collector

**Capability delivered:** The brain repo (`~/brain/`) is set up as the Claude Code
project directory. A single launchd job fires every 10 minutes. The orchestrator
reads `schedule.yaml`, determines which sources are due, runs the Calendar collector
(Playwright → Google Calendar), imports the resulting markdown into GBrain, and
embeds new pages. Calendar data flows into the brain automatically.

**Why first:** Data first. There's nothing to search, navigate, or validate until
real information is flowing into the brain. Calendar is the simplest source
(structured data, clear output format, existing ralph-pva skill to adapt). Once
this works, every subsequent collector follows the same pattern.

**Depends on:** Phase 0 (need frontmatter conventions so the collector knows what
to emit).

**Repo placement:** This slice touches two kinds of code:
- **Reusable library modules** (schedule parser, state manager) → `src/orchestrator/`
  in gbrain-alt. These are tool code, testable, importable by any brain repo.
- **Deployment artifacts** (orchestrator.sh, launchd plist, collector scripts,
  schedule.yaml) → `examples/orchestrator/` and `examples/collectors/` in
  gbrain-alt as **reference implementations**. The brain repo gets its own copies
  (possibly customized). These are templates, not the canonical deployment location.

### Work items

1. **Set up brain repo as Claude Code project** — The brain repo (`~/brain/`)
   is where Claude Code sessions will run from:
   - Add: `CLAUDE.md`, `.claude/rules/`, `.env` (from gbrain-alt's `.env.example`),
     `collectors/` (copy from gbrain-alt `examples/collectors/`),
     `orchestrator/` (copy from `examples/orchestrator/`), `schedule.yaml`
   - Ensure gbrain-alt is installed and `gbrain` CLI is on PATH
   - Run `gbrain init` (PGLite)
   - Verify: `gbrain doctor` passes when run from `~/brain/`

2. **Schedule parser module** — New file: `src/orchestrator/schedule.ts`
   - Parse schedule.yaml (interval or cron expressions)
   - Compute which sources are due given collector-state.json timestamps
   - TypeScript module (testable without shell)

3. **Collector state manager** — New file: `src/orchestrator/state.ts`
   - Read/write collector-state.json
   - Per-source: `last_run` timestamp, `watermark` (source-specific cursor)
   - Atomic writes (write to tmp, rename)

4. **Reference orchestrator script** — `examples/orchestrator/orchestrator.sh`
   - PID guard (`pgrep -f "gbrain"`)
   - Calls schedule parser to get due sources
   - Runs due collectors sequentially
   - Runs `gbrain import <staging> --no-embed && gbrain embed --stale`
   - Updates collector state
   - Logs to `~/.gbrain/logs/`

5. **Reference launchd plist** — `examples/orchestrator/com.gbrain.orchestrator.plist`
   - Fires every 600 seconds (10 min)
   - Invokes `orchestrator.sh`
   - StandardOutPath/StandardErrorPath → `~/.gbrain/logs/`

6. **Calendar collector** — `examples/collectors/calendar.ts`
   - Adapt from ralph-pva `google-calendar` skill
   - Connect to shared Playwright browser (port 3400)
   - Scrape today's (or since-watermark) calendar events
   - Output GBrain-format markdown to `~/.gbrain/staging/calendar/`
   - Track watermark (last-synced date)

7. **Default schedule.yaml** — `examples/orchestrator/schedule.yaml`
   ```yaml
   sources:
     calendar: { every: 60m, script: collectors/calendar.ts }
     brain-sync: { every: 15m, command: "gbrain sync --repo ~/brain" }
   ```

8. **Tests**
   - `test/orchestrator.test.ts` — schedule parsing, due computation, state
     read/write, PID guard logic (tests the library modules in src/)
   - `test/collector-output.test.ts` — validate calendar output format (YAML
     frontmatter, compiled truth, timeline, citations) against fixture files
   - `test/e2e/orchestrator.test.ts` — full cycle: staged markdown → PGLite
     import → pages in DB → embeddings created → state updated

### Files touched

| File | Repo | Change |
|---|---|---|
| `src/orchestrator/schedule.ts` | gbrain-alt | New — schedule parser (reusable) |
| `src/orchestrator/state.ts` | gbrain-alt | New — collector state manager (reusable) |
| `examples/orchestrator/orchestrator.sh` | gbrain-alt | New — reference orchestrator script |
| `examples/orchestrator/com.gbrain.orchestrator.plist` | gbrain-alt | New — reference launchd config |
| `examples/collectors/calendar.ts` | gbrain-alt | New — reference Calendar collector |
| `examples/orchestrator/schedule.yaml` | gbrain-alt | New — reference schedule |
| `test/orchestrator.test.ts` | gbrain-alt | New — orchestrator unit tests |
| `test/collector-output.test.ts` | gbrain-alt | New — output format validation |
| `test/e2e/orchestrator.test.ts` | gbrain-alt | New — E2E integration test |
| `CLAUDE.md`, `.env`, `schedule.yaml` | brain repo | New — project scaffolding |

### Definition of done

- [ ] Brain repo is a working Claude Code project with `gbrain doctor` passing
- [ ] `launchctl load` installs the 10-min timer
- [ ] Orchestrator runs, detects calendar is due, scrapes calendar via Playwright
- [ ] Calendar markdown appears in `~/.gbrain/staging/calendar/`
- [ ] Pages appear in PGLite after import
- [ ] `collector-state.json` updated with new timestamp + watermark
- [ ] PID guard prevents duplicate runs
- [ ] `bun test` passes (all existing + new tests)
- [ ] Committed and pushed (both repos)

---

## Slice 2 — Slack Collector

**Capability delivered:** Significant Slack threads flow into the brain as meeting
pages on schedule. The orchestrator picks up Slack as a new source with no
infrastructure changes.

**Why now:** Slack is a primary data source (§2). The orchestrator pattern from
Slice 1 is proven. This adds a new collector to the existing pipeline.

### Work items

1. **Slack collector** — `examples/collectors/slack.ts`
   - Adapt from ralph-pva `slack-reader` skill
   - Connect to shared Playwright browser
   - Scrape channels/threads since watermark
   - Output: meeting pages from significant threads
   - Watermark: last-seen message timestamp per channel

2. **Schedule entry** — Add to `examples/orchestrator/schedule.yaml`:
   ```yaml
   slack: { every: 15m, script: collectors/slack.ts }
   ```

3. **Tests** — Add Slack fixtures to `test/collector-output.test.ts`

### Definition of done

- [ ] Slack threads → `~/.gbrain/staging/slack/` → brain meeting pages
- [ ] Watermark tracks per-channel progress
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 3 — Gmail Collector

**Capability delivered:** Email flows into the brain. Emails about known people
update their person pages. Standalone important emails become media pages.

### Work items

1. **Gmail collector** — `examples/collectors/gmail.ts`
   - Adapt from ralph-pva gmail-reader skill (or build new)
   - Connect to shared Playwright browser
   - Scrape inbox/sent since watermark
   - Output: person page updates + standalone email media pages
   - Filing rules: email about Sarah → update `people/sarah-chen.md`
   - Watermark: last-seen message ID

2. **Schedule entry** — Add gmail to reference schedule.yaml

3. **Tests** — Add Gmail fixtures to `test/collector-output.test.ts`

### Definition of done

- [ ] Email → person page updates + email media pages in brain
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 4 — Zoom Collector

**Capability delivered:** Zoom meeting recordings/transcripts flow into the brain
as meeting pages with attendee detection and cross-references.

### Work items

1. **Zoom collector** — `examples/collectors/zoom.ts`
   - Adapt from ralph-pva `zoom-web` skill
   - Scrape recordings/transcripts since watermark
   - Output: meeting pages with attendee links
   - Watermark: last-seen recording ID

2. **Schedule entry** — Add zoom to reference schedule.yaml

3. **Tests** — Add Zoom fixtures to `test/collector-output.test.ts`

### Definition of done

- [ ] Zoom transcripts → brain meeting pages with attendee links
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 5 — Google Docs + Confluence Collectors

**Capability delivered:** Documents from Google Docs and Confluence flow into the
brain as concept/project pages. Two collectors in one slice because they share the
same output shape (document → concept/project page).

### Work items

1. **Google Docs collector** — `examples/collectors/gdocs.ts`
   - Adapt from ralph-pva `google-docs` skill
   - Scrape recently modified docs
   - Output: concept or project pages

2. **Confluence collector** — `examples/collectors/confluence.ts`
   - New Playwright skill (no ralph-pva equivalent)
   - Scrape spaces/pages since watermark
   - Output: concept or project pages

3. **Schedule entries + tests** — Update reference schedule.yaml, add fixtures

### Definition of done

- [ ] Google Docs + Confluence → brain concept/project pages
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 6 — Jira + GitHub Collectors

**Capability delivered:** Project tracking data from Jira and GitHub flows into the
brain as project pages with status, assignees, and links.

### Work items

1. **Jira collector** — `examples/collectors/jira.ts`
   - Scrape boards/issues since watermark
   - Output: project pages with task frontmatter (status, priority, assigned_to)

2. **GitHub collector** — `examples/collectors/github.ts`
   - Scrape repos/issues/PRs since watermark
   - Output: project pages

3. **Schedule entries + tests** — Update reference schedule.yaml, add fixtures

### Definition of done

- [ ] Jira + GitHub → brain project pages with structured frontmatter
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 7 — Gateway-Powered Search

**Capability delivered:** `gbrain query "..."` works through the corporate AI
gateway for both embeddings and query expansion. Full hybrid search operational
against the data that's been flowing in from collectors.

**Why now:** There's real data in the brain from Slices 1-6. Keyword search
already works (zero code changes). This slice adds vector search (gateway
embeddings) and query expansion (Bedrock adapter) to search the accumulated data
with full hybrid search.

### Work items

1. **Bedrock fetch adapter** — Replace `new Anthropic()` in `src/core/search/expansion.ts`
   with a direct `fetch()` call to the Bedrock invoke endpoint.
   - Detect environment: if `BEDROCK_BASE_URL` is set, use Bedrock adapter;
     otherwise fall back to standard Anthropic SDK (preserve existing behavior).
   - Model: `us.anthropic.claude-3-5-haiku-20241022-v1:0` (Claude 3.5 Haiku via
     gateway). Use tool_use for structured output (same expand_query tool schema).
   - Parse Bedrock response format (different wire format from Messages API).
   - Fallback: on any error, return `[query]` (existing behavior).

2. **Tests** — New file: `test/expansion-bedrock.test.ts`
   - Mock fetch to test adapter without hitting real gateway
   - Correct URL construction, headers, body shape
   - Response parsing (tool_use extraction)
   - Fallback on 401, timeout, malformed response
   - Env var detection (Bedrock vs Anthropic SDK path selection)

3. **Existing tests pass** — `bun test` green. No regressions in search tests.

4. **Verify against real data** — Run `gbrain embed --stale` then
   `gbrain query "..."` against the brain's accumulated data. Confirm hybrid
   search returns relevant results.

### Files touched

| File | Change |
|---|---|
| `src/core/search/expansion.ts` | Add Bedrock fetch adapter, env detection |
| `test/expansion-bedrock.test.ts` | New test file |

### Definition of done

- [ ] `BEDROCK_BASE_URL` set → expansion uses Bedrock adapter
- [ ] `BEDROCK_BASE_URL` unset → expansion uses Anthropic SDK (unchanged)
- [ ] `gbrain query` returns relevant results from real collected data
- [ ] `bun test` passes (all existing + new tests)
- [ ] Committed and pushed

---

## Slice 8 — Typed Graph Navigation

**Capability delivered:** `gbrain graph <slug> --link-type owns,contains --target-type task`
returns only task pages reachable via `owns`/`contains` links. Backward-compatible:
omitting filters gives the same results as today.

**Why now:** With data and links in the brain from collectors and (if done) the
Notion migration, the graph is populated enough to navigate. Enables the
AOR → Projects → Tasks navigation pattern from Notion (§5.4).

### Work items

1. **Engine interface** — Add optional params to `BrainEngine.traverseGraph()`:
   ```typescript
   traverseGraph(slug: string, depth?: number, linkTypes?: string[], targetType?: string): Promise<GraphNode[]>
   ```

2. **Operations contract** — Add `link_types` (string, comma-separated) and
   `target_type` (string) params to `traverse_graph` in `operations.ts`.

3. **PGLite engine** — Add WHERE clauses to the recursive CTE in
   `pglite-engine.ts:369-403`:
   - `AND ($3::text[] IS NULL OR l.link_type = ANY($3))` in the recursive term
   - `WHERE $4::text IS NULL OR type = $4` in the final SELECT

4. **Postgres engine** — Mirror the same CTE changes in `postgres-engine.ts`.

5. **CLI routing** — Add `--link-type` and `--target-type` flags to the `graph`
   CLI command (parsed in operations.ts cliHints or cli.ts routing).

6. **Tests** — Add to `test/pglite-engine.test.ts`:
   - `traverseGraph with link_types filter` — only follows specified types
   - `traverseGraph with target_type filter` — only returns specified page type
   - `traverseGraph with both filters` — compound filtering
   - `traverseGraph with no filters` — backward-compatible (same as current)
   - `traverseGraph filters with empty result` — valid query, no matches

### Files touched

| File | Change |
|---|---|
| `src/core/engine.ts` | Update interface signature |
| `src/core/operations.ts` | Add params + CLI hints |
| `src/core/pglite-engine.ts` | Add WHERE clauses to CTE |
| `src/core/postgres-engine.ts` | Mirror CTE changes |
| `test/pglite-engine.test.ts` | Add filter test cases |

### Definition of done

- [ ] `gbrain graph my-aor --link-type owns --target-type task` returns filtered results
- [ ] Omitting `--link-type` and `--target-type` returns same results as before
- [ ] `bun test` passes (all existing + new tests)
- [ ] Committed and pushed

---

## Slice 9 — Notion Data Migration + Entity Resolution

**Capability delivered:** All 8 Notion entity types migrated into GBrain with
correct frontmatter, typed links, and deduplicated entities. The brain has both
live-collected data (from Slices 1-6) and historical Notion data.

**Depends on:** Phase 0 (frontmatter conventions), Slice 1 (brain repo set up).

### Work items

1. **Notion export → GBrain import script** — `scripts/notion-import.ts`
   (in brain repo — site-specific migration script)
   - Notion CSV/API export → GBrain markdown conversion
   - Property → frontmatter mapping (per Phase 0 conventions)
   - Relation → typed link creation
   - Transitive/inherited relation elimination
   - Import via `gbrain import`

2. **Entity resolution** — `src/core/entity-resolution.ts` (in gbrain-alt —
   reusable tool code)
   - Merge identities across data sources (same person in Gmail vs Slack vs Calendar vs Notion)
   - Heuristics: name normalization, email matching, Slack display name → person slug
   - Run post-import to deduplicate person/org pages

3. **Tests**
   - `test/entity-resolution.test.ts` — name matching, dedup, cross-source merge
   - Notion import fixture tests (sample CSV → expected GBrain pages)

### Definition of done

- [ ] All 8 entity types imported with correct frontmatter and links
- [ ] Entity resolution deduplicates cross-source person/org pages
- [ ] `bun test` passes
- [ ] Committed and pushed (gbrain-alt for tool code, brain repo for data)

---

## Slice 10 — Notion Bidirectional Integration

**Capability delivered:** GBrain is SoR, but Notion stays as the UI and input
channel. Brain changes sync to Notion. Notion Inbox items flow into GBrain.

**Key decision:** Notion is NOT being replaced. It stays as a bidirectional UI.
This eliminates Codex finding #6 risk (Obsidian vs Notion views) entirely.

**Depends on:** Slice 9 (Notion entities in GBrain with correct schema).

### Work items

1. **Notion sync-out** — After gbrain updates a page, reflect changes to Notion.
   Two options (user prefers option b):
   - (a) Periodic skill: runs every 10 min, diffs brain state, pushes changes
   - (b) Enrichment hook: part of the enrichment skill on every input — after
     updating brain repo, also update the corresponding Notion page
   - Needs: Notion API access via Playwright (scrape) or API token

2. **Notion Inbox collector** — `examples/collectors/notion-inbox.ts`
   - Scrape Notion's "Top of Mind > Inbox" (via Playwright)
   - Pull new items since watermark
   - Convert to gbrain format, run through triage (adapt ralph-pva Triage skill)
   - Route to correct brain pages (person updates, new concepts, task creation)
   - Clear or mark processed items in Notion

3. **Tests** — Notion sync-out mapping tests, Inbox collector output fixtures

### Definition of done

- [ ] Brain changes appear in Notion within sync cycle
- [ ] Notion Inbox items flow into brain pages via triage
- [ ] `bun test` passes
- [ ] Committed and pushed

---

## Slice 11 — Info Architecture Mapping + Skill Porting

**Capability delivered:** The ralph-pva 6-layer information architecture is
explicitly mapped to gbrain-alt equivalents. Ralph-pva skills that add value
beyond vanilla gbrain skills are ported and working.

**Blocked by:** `gbrain-alt-n9i` (6-layer mapping must be resolved first).

### Work items

1. **6-layer mapping document** — `docs/guides/info-architecture.md` in gbrain-alt
   (tool documentation, describes how layers map for any Claude Code deployment).
   The brain repo's own `CLAUDE.md` implements the mapping for this specific deployment.
   - Layer 1 (Session Primer): AGENTS.md → brain repo `CLAUDE.md`
   - Layer 2 (Path-Scoped Context): .claude/rules/ → brain repo `.claude/rules/`
   - Layer 3 (Meta-Memory): README.md + docs/ → brain repo docs/
   - Layer 4 (Skills): ralph-pva skills → brain repo skills/ (port what adds value)
   - Layer 5 (Beads): already in use (acknowledge)
   - Layer 6 (Knowledge Base): Notion → GBrain (covered by Slice 9)

2. **Skill porting** — Identify and port ralph-pva skills into the **brain repo's**
   `skills/` directory (these are site-specific agent behavior, not gbrain tool code):
   - Triage (inbox → categorize → route) — does gbrain's ingest skill cover this?
   - Meeting prep (person context + open threads) — does gbrain's briefing skill cover this?
   - Recall-then-memorize dedup — novel pattern, likely needs porting
   - Evaluate each: port, adapt, or drop with rationale

3. **Tests** — For any ported skill logic that has testable code paths

### Definition of done

- [ ] 6-layer mapping documented with clear keep/change/drop per layer
- [ ] Ported skills integrated into brain repo's `skills/` directory
- [ ] Brain repo's `CLAUDE.md` implements the layer mapping
- [ ] `bun test` passes
- [ ] Committed and pushed (gbrain-alt for docs, brain repo for skills + config)

---

## Slice 12 — Workflow Validation (Final Gate)

**Capability delivered:** Proof that the gbrain + Notion (bidirectional) system
replaces ralph-pva for day-to-day workflows.

**Depends on:** Slices 9, 10, 11 all complete.

### Work items

1. **Triage workflow validation**
   - Notion Inbox items flow into gbrain via collector
   - Triage skill categorizes and routes to correct brain pages
   - Changes sync back to Notion
   - Verify the full bidirectional loop works end-to-end

2. **Meeting prep workflow validation**
   - Upcoming meeting detected (calendar collector)
   - Person context pulled (compiled truth + backlinks)
   - Open threads surfaced
   - Verify output quality matches ralph-pva's meeting prep

3. **Task management workflow validation**
   - Create task (via Notion or gbrain CLI)
   - Verify bidirectional sync (gbrain ↔ Notion)
   - Verify AOR → Project → Task navigation works via typed graph traversal

4. **Gap documentation** — Honest accounting of what works, what's worse,
   what's better, and what's missing vs. ralph-pva.

### Definition of done

- [ ] All 3 workflows validated with real data
- [ ] Gap analysis documented
- [ ] User accepts the system as ralph-pva replacement
- [ ] Committed and pushed

---

## Slice 13 — Obsidian View Layer (Optional, Deferred)

**Capability delivered:** User can browse, filter, and navigate their brain in
Obsidian as an alternative/supplement to Notion.

**Not blocking anything.** User wants the majority of the system functioning
before investing time in learning Obsidian.

### Work items

1. **Obsidian vault setup guide** — `docs/guides/obsidian-setup.md`
2. **Dataview dashboard templates** — `~/brain/_dashboards/`
3. **Validation** — Does Obsidian add value beyond what Notion already provides?

### Definition of done

- [ ] Obsidian opens `~/brain/` and renders pages correctly
- [ ] Dataview dashboards functional
- [ ] User decides if Obsidian adds enough value to keep

---

## Dependency Map

```
Phase 0 (Entity schema + data model design)
  │
  ▼
Slice 1 (Brain repo setup + Orchestrator + Calendar) ◄── first data flowing
  │
  ├── Slice 2 (Slack)        ┐
  ├── Slice 3 (Gmail)        │
  ├── Slice 4 (Zoom)         ├─ collectors (parallel, any order)
  ├── Slice 5 (Docs + Confl) │
  └── Slice 6 (Jira + GH)   ┘
  │
  ├── Slice 7 (Bedrock adapter) ◄── search lights up against real data
  ├── Slice 8 (Typed traversal) ◄── graph nav against real graph
  │
  ├── Slice 9 (Notion migration + entity resolution)
  │     │
  │     ▼
  │   Slice 10 (Notion bidirectional: sync-out + Inbox collector)
  │
  ├── Slice 11 (Info arch + skill porting) ◄── blocked by gbrain-alt-n9i
  │
  └──► Slice 12 (Workflow validation) ◄── final gate (needs 9, 10, 11)
        │
        ▼
      Slice 13 (Obsidian view layer) ◄── optional, deferred
```

- **Phase 0:** Must complete before Slice 1. Design only, no code.
- **Slice 1:** First code slice. Brain repo setup + orchestrator + first collector.
- **Slices 2–6:** Each depends on Slice 1 (orchestrator exists). Independent of each other. Can run in parallel.
- **Slices 7, 8:** Can start any time after Slice 1 (need data to be meaningful). Independent of each other.
- **Slice 9:** Depends on Phase 0 (schema) + Slice 1 (brain repo). Can run in parallel with collectors.
- **Slice 10:** Depends on Slice 9 (Notion entities in GBrain). Notion sync-out + Inbox collector.
- **Slice 11:** Blocked by `gbrain-alt-n9i`. Can run in parallel with anything once unblocked.
- **Slice 12:** Depends on 9, 10, 11. Final acceptance gate.
- **Slice 13:** Optional. Only after user is ready to evaluate Obsidian.

---

## Open Questions (for discussion)

1. **Collector language:** Spec says "shell script (or TypeScript)." TypeScript is
   testable, type-safe, and can import the Playwright MCP client directly. Shell
   scripts add a language boundary. **Recommendation:** TypeScript for all collectors,
   invoked via `bun run collectors/calendar.ts`. Orchestrator shell script calls
   `bun run` for each collector.

2. **Orchestrator language:** Should the orchestrator itself be TypeScript (not shell)?
   This would make the PID guard, schedule parsing, and state management all live
   in one testable codebase. The shell script becomes a one-liner that calls
   `bun run src/orchestrator/main.ts`. **Recommendation:** Yes — keep the shell
   script as thin as possible, push logic into TypeScript.

3. **Dream cycle (§5.3):** Deferred in the spec. Add as optional Slice 14 after
   Slice 12? Or fold into Slice 1 as a schedule entry? **Recommendation:** Optional
   Slice 14. Mechanical dream cycle first (embed --stale, doctor, health),
   LLM-assisted enrichment later.

4. **Notion sync-out mechanism:** Enrichment hook (per-input, option b) vs periodic
   skill (every 10 min, option a). User prefers option b. Need to determine: does
   Notion access work via Playwright scraping or is there an API token available?
   This affects both the sync-out implementation and the Inbox collector.
