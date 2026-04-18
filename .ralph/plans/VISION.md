# GBrain Adaptation Specification

**Goal:** Adapt GBrain for use in a restricted corporate environment, replacing
the OpenClaw persistent-agent model with Claude Code / Codex sessions + macOS
launchd, and implement OAuth/API-based data collectors with either Playwright
browser automation or the existing recipe-guided OAuth path.

**Tracking:** gbrain-alt-ws2

---

## 1. Current System

GBrain is a personal knowledge brain backed by Postgres (PGLite for local,
Supabase for production). It stores markdown pages following a compiled truth +
timeline pattern, with hybrid search (vector + keyword + RRF fusion).

### Runtime assumptions

The system assumes a **persistent AI agent** (OpenClaw or Hermes) that:

- Runs 24/7 with cron-scheduled jobs (email sync, dream cycle, health checks)
- Maintains OAuth credentials via a gateway daemon (ClawVisor)
- Has cross-session memory (`memory_search`) for operational state
- Executes background sync loops to keep the search index current
- Follows fat markdown "recipes" to generate collector scripts at install time

### External service dependencies

| Dependency    | Used for                                     | Required?                            |
|---------------|----------------------------------------------|--------------------------------------|
| OpenAI API    | Embeddings (text-embedding-3-large, 1536-dim)| No — keyword search works without it |
| Anthropic API | Query expansion (Haiku)                      | No — original query used as fallback |
| Supabase      | Managed Postgres + pgvector + storage        | No — PGLite is the default engine    |
| ClawVisor     | OAuth credential gateway for Gmail/Calendar  | No — direct OAuth is an alternative  |

### What works fully local (no changes needed)

- PGLite engine (embedded Postgres 17.5 via WASM)
- All page CRUD, link graph, tags, timeline, versioning
- Keyword search (tsvector + pg_trgm)
- Query intent classification (regex-based, no LLM)
- Recursive text chunking
- Local file storage
- Import/export/sync
- MCP server (stdio)
- CLI (`gbrain` commands)

### Integration recipes (the data pipeline)

Six recipes in `recipes/` describe how to get data into GBrain:

| Recipe             | Access method                            | Output                        |
|--------------------|------------------------------------------|-------------------------------|
| email-to-brain     | ClawVisor or Google OAuth → Gmail API    | Daily JSON + markdown digests |
| calendar-to-brain  | ClawVisor or Google OAuth → Calendar API | Daily markdown calendar pages |
| meeting-sync       | Circleback API                           | Meeting transcript pages      |
| x-to-brain         | Twitter API                              | Tweet/thread pages            |
| twilio-voice-brain | Twilio + OpenAI Realtime API             | Voice call transcript pages   |
| credential-gateway | ClawVisor or Google OAuth setup          | Credential management         |

These recipes contain no executable code. They are agent instructions that tell
the AI agent how to build and install collector scripts. The actual scripts are
generated at install time.

---

## 1b. Repository Topology

Two repos, two roles. This distinction is critical because it determines
where code, config, and data live.

```
gbrain-alt (this repo)                  Brain repo (~/brain/)
──────────────────────                  ─────────────────────
The TOOL.                               The USER'S WORLD.
Source code, CLI, MCP server,           Markdown pages (compiled truth + timeline),
skills, tests, docs, examples.          .env (secrets), CLAUDE.md, .claude/rules/,
                                        orchestrator config, collector scripts,
Cloned and installed (bun link).        launchd plist, schedule.yaml, ported skills,
Provides the `gbrain` CLI that          Obsidian .obsidian/ config, Dataview dashboards.
the brain repo calls.
                                        This is the Claude Code project directory.
Never holds user secrets or             Claude Code sessions run here, calling `gbrain`
deployment config.                      the same way OpenClaw would from its runtime.
```

**ralph-pva** is the legacy system being replaced. It is a separate repo with its
own CLAUDE.md, skills, Playwright skills, and Notion integration. Stage 2 sets up
the brain repo to take over ralph-pva's role — same brain repo that holds the
markdown pages also holds the agent configuration, deployment artifacts, and
ported skills. There is no third "agent repo."

**What goes where:**

| Artifact | Repo | Rationale |
|----------|------|-----------|
| `expansion.ts` Bedrock adapter | gbrain-alt | Tool code — reusable engine feature |
| Typed graph traversal | gbrain-alt | Tool code — engine feature |
| Schedule parser + state manager | gbrain-alt | Tool code — reusable library modules |
| `.env.example` (placeholders) | gbrain-alt | Developer documentation |
| `.env` (real secrets) | Brain repo | Deployment config — never in the tool |
| `schedule.yaml` | Brain repo | Deployment config — per-installation |
| `orchestrator.sh` + launchd plist | Brain repo | Deployment infra — per-installation |
| Collector scripts | Brain repo | Deployment scripts — site-specific Playwright |
| Ported ralph-pva skills | Brain repo | Agent behavior — site-specific |
| `CLAUDE.md` + `.claude/rules/` | Brain repo | Agent session primer for Claude Code |
| Obsidian config + dashboards | Brain repo | View layer config (`.obsidian/`, `_dashboards/`) |
| Markdown pages | Brain repo | Data — source of truth |

---

## 2. Target Environment

### Capabilities

- **Machine control:** Full CLI and Docker access on macOS
- **AI access:** Company AI gateway (`ai-gateway.zende.sk`) with two paths:
  OpenAI-compatible (`/v1/`, includes embeddings) and Bedrock-format
  (`/bedrock/model/{id}/invoke`, includes Claude). Same Bearer token for both.
- **Local compute:** NVIDIA DGX Spark available for local embedding models
- **Agent runtime:** Claude Code and/or Codex (session-based, not persistent)
- **Scheduling:** macOS launchd for recurring jobs
- **Cross-session memory:** Claude Code's `.claude/` memory system

### Constraints

- No third-party subscriptions (no Supabase, no Circleback, no direct OpenAI/Anthropic billing)
- No backend API integrations for work tools (no OAuth service accounts, no
  webhook endpoints, no server-side credential daemons)
- All work system access is via Playwright browser automation

### Target data sources

| System          | Priority  | Current access method |
|-----------------|-----------|-----------------------|
| Gmail           | Primary   | Playwright            |
| Slack           | Primary   | Playwright            |
| Google Calendar | Primary   | Playwright            |
| Zoom            | Primary   | Playwright            |
| Google Docs     | Primary   | Playwright            |
| Confluence      | Secondary | Playwright            |
| Jira            | Secondary | Playwright            |
| GitHub          | Secondary | Playwright            |

---

## 3. Changes Required

### 3.1 AI Gateway Configuration

**Current state:** `src/core/embedding.ts` calls `new OpenAI()` (reads
`OPENAI_API_KEY` and `OPENAI_BASE_URL` from env). `src/core/search/expansion.ts`
calls `new Anthropic()` (reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`).

**Change:** One small code change (query expansion adapter). Embeddings unchanged.

**Single token:** The company AI gateway uses one Bearer token for both OpenAI
and Bedrock endpoints. Configure as:

```bash
export AI_GATEWAY_TOKEN=<gateway-issued-token>
export OPENAI_BASE_URL=https://ai-gateway.zende.sk/v1
export OPENAI_API_KEY=$AI_GATEWAY_TOKEN
```

**Embeddings (verified, zero code changes):** The gateway exposes
`text-embedding-3-large` at `/v1/embeddings` (confirmed via `/v1/models`).
This is the exact model GBrain defaults to (1536 dimensions). All three
hardcoded locations (embedding.ts:12-13, pglite-schema.ts vector(1536) column,
upsertChunks model name) match. The OpenAI SDK reads `OPENAI_BASE_URL` and
`OPENAI_API_KEY` from env. No code changes.

**Query expansion (small code change):** The gateway exposes Claude via a
Bedrock-format endpoint at `/bedrock/model/{id}/invoke`. This is a different
wire format from the standard Anthropic Messages API that GBrain's
`expansion.ts` uses (`new Anthropic()` -> `POST /v1/messages`).

Available Claude models via Bedrock (verified):
- `anthropic.claude-3-haiku-20240307-v1:0` (Claude 3 Haiku)
- `us.anthropic.claude-3-5-haiku-20241022-v1:0` (Claude 3.5 Haiku)
- `us.anthropic.claude-sonnet-4-6` (Claude Sonnet 4.6)

Claude is NOT available via the OpenAI-compatible `/v1/chat/completions` path.

**Implementation:** Replace the Anthropic SDK call in `expansion.ts` with a
thin `fetch()` adapter that calls the Bedrock invoke endpoint directly:

```typescript
// expansion.ts — replace new Anthropic() with direct fetch
const resp = await fetch(
  `${process.env.BEDROCK_BASE_URL}/model/${MODEL}/invoke`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.AI_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 256,
    }),
  }
);
```

This eliminates the `@anthropic-ai/sdk` dependency for query expansion and
uses the same token as embeddings. Env vars:

```bash
export BEDROCK_BASE_URL=https://ai-gateway.zende.sk/bedrock
# AI_GATEWAY_TOKEN already set above
```

**Fallback behavior unchanged:** If the Bedrock call fails (network, auth,
model unavailable), `expandQuery()` returns `[query]` and search proceeds
with the original query text. Vector + keyword + RRF still works.

**DGX Spark alternative (deferred):** Local embedding models via Ollama are a
fallback if gateway access changes. Would require dimension updates in 3 files
if the model isn't 1536-dim. Not needed given gateway availability.

### 3.2 Typed Graph Traversal

**Current state:** `traverseGraph()` in `src/core/pglite-engine.ts:369-403`
follows ALL outgoing links regardless of link_type or target page type. The
recursive CTE has no filter predicates.

**Problem:** "Show me all tasks under this AOR" returns every connected entity
(people, companies, resources, other AORs) at every depth. The link_type IS
stored in the database, but the traversal query doesn't use it.

**Change:** Add two optional filter parameters to the `traverse_graph`
operation. Keep traversal outgoing-only (existing behavior). Use the existing
`backlinks` command separately for incoming link queries.

```typescript
// In operations.ts, traverse_graph params:
link_types?: string[]   // e.g. ['owns', 'contains'] — only follow these
target_type?: string    // e.g. 'task' — only return pages of this type
```

Implementation: Add WHERE clauses to the recursive CTE in both PGLite and
Postgres engines:

```sql
WITH RECURSIVE graph AS (
  SELECT p.id, p.slug, p.title, p.type, 0 as depth
  FROM pages p WHERE p.slug = $1
  UNION
  SELECT p2.id, p2.slug, p2.title, p2.type, g.depth + 1
  FROM graph g
  JOIN links l ON l.from_page_id = g.id
  JOIN pages p2 ON p2.id = l.to_page_id
  WHERE g.depth < $2
    AND ($3::text[] IS NULL OR l.link_type = ANY($3))
)
SELECT * FROM graph
WHERE $4::text IS NULL OR type = $4               -- target_type filter
```

**No bidirectional traversal.** The two navigation use cases have clean
separation:

- **Outgoing chains** (AOR → Projects → Tasks): `traverseGraph` with
  `link_types` + `target_type` filters. Walks forward along typed links.
- **Incoming references** (Person → tasks assigned to them): `backlinks`
  command. Flat list of everything pointing at a page. No recursive walk
  needed because you're asking "what points here?", not "walk a chain."

Bidirectional recursive traversal is unnecessary complexity. It risks
O(fan_out^depth) explosion in both directions and doesn't match any real
navigation pattern.

**CLI usage:**
```bash
# AOR → all tasks (outgoing, typed chain)
gbrain graph my-aor --depth 3 --link-type owns,contains --target-type task

# Person → tasks assigned to them (incoming, flat)
gbrain backlinks sarah-chen
```

Both parameters are optional. When omitted, behavior is unchanged (all links,
all types). Backward-compatible.

### 3.3 Data Ingestion — Two Viable Paths

The user has a choice between two approaches. Both produce the same output
(GBrain-format markdown pages) and can coexist.

#### Path A: Playwright-based collectors

Use existing Playwright skills (or write new ones) that scrape work systems via
browser automation.

**Architecture:**

```
launchd trigger (scheduled)
  → shell script
    → Playwright skill scrapes system (Gmail, Slack, Calendar, etc.)
    → outputs GBrain-format markdown to a staging directory
    → gbrain import <staging-dir> --no-embed
    → gbrain embed --stale
```

**Advantages:** Works within corporate constraints. No OAuth setup, no
credential daemons, no API keys for work systems. Leverages existing Playwright
skills.

**Disadvantages:** Browser automation is fragile (UI changes break scrapers).
Slower than API access. Requires an authenticated browser session to be
maintained. Cannot receive webhooks for real-time updates.

#### Path B: Recipe-guided OAuth setup

Follow the existing GBrain recipes. Have Claude Code (acting as the agent) walk
through the OAuth setup steps described in the recipes. This creates collector
scripts that call Google APIs, Slack APIs, etc. directly.

**Viability depends on:** Whether the user can create OAuth credentials in
Google Cloud Console, Slack app manifests, etc. The recipes describe both
ClawVisor (not available) and direct OAuth (may be possible depending on
corporate IT policy).

**Advantages:** More reliable than browser automation. Faster. Supports
webhooks for near-real-time ingestion.

**Disadvantages:** Requires OAuth credentials the user may not be authorized
to create. Each service needs its own setup.

#### Output format (both paths)

Both paths produce identical markdown files:

```markdown
---
type: person | company | meeting | concept | media | source
title: Human-Readable Title
tags: [tag1, tag2]
---

Compiled truth — current synthesis.

---

## Timeline

### YYYY-MM-DD — Event description

What happened.

[Source: <provider>, <context>, YYYY-MM-DD]
```

**Filing rules:**
- File path determines slug: `people/sarah-chen.md` → `people/sarah-chen`
- File by primary subject, not source (email about Sarah → update `people/sarah-chen.md`)
- Every timeline entry must have a `[Source: ...]` citation
- Name entities explicitly ("Sarah Chen" not "she") for automatic back-linking
- Notability gate: only create pages for entities worth tracking

**Page type mapping by source:**

| Source             | Primary page type   | File path                                    |
|--------------------|---------------------|----------------------------------------------|
| Gmail              | `person` (update)   | `people/{name}.md`                           |
| Gmail (standalone) | `media`             | `emails/{date}-{subject-slug}.md`            |
| Slack thread       | `meeting`           | `meetings/{date}-{channel}-{topic}.md`       |
| Google Calendar    | `media`             | `calendar/{year}/{date}.md`                  |
| Zoom transcript    | `meeting`           | `meetings/{date}-{title}.md`                 |
| Google Docs        | `concept`/`project` | `concepts/{slug}.md` or `projects/{slug}.md` |
| Confluence         | `concept`/`project` | `concepts/{slug}.md` or `projects/{slug}.md` |
| Jira               | `project`           | `projects/{key}.md`                          |
| GitHub             | `project`           | `projects/{repo}-{slug}.md`                  |

### 3.4 Agent Runtime — OpenClaw to Claude Code

**Current state:** GBrain assumes a persistent agent that:
- Is always running
- Has cron-like scheduling built in
- Maintains `memory_search` for cross-session state
- Follows the SKILLPACK as permanent behavioral instructions

**Change:** Replace with:

| OpenClaw capability          | Claude Code equivalent                   |
|------------------------------|------------------------------------------|
| Persistent agent process     | Session-based (user invokes as needed)   |
| Built-in cron scheduler      | macOS launchd plist files                |
| `memory_search`              | `.claude/` project memory files          |
| SKILLPACK in agent memory    | CLAUDE.md project instructions           |
| Recipes as agent instructions | Recipes as Claude Code session prompts  |

**In-session behavior (no change needed):** The SKILLPACK's brain-first lookup
protocol (search before responding, detect entities, write back to brain) works
identically in Claude Code sessions. The skills in `skills/` are already
markdown files that Claude Code can read.

**Scheduled jobs — single orchestrator (DECIDED):** PGLite is single-process
with an exclusive file lock (`src/core/pglite-lock.ts`, 30s timeout, 5-min stale
threshold). Multiple concurrent `gbrain` CLI calls will deadlock. The solution
is a single orchestrator that acquires the lock once per cycle.

**Architecture:**

```
launchd fires every 10 min (one plist: com.gbrain.orchestrator.plist)
  → orchestrator.sh
    → PID guard: check for existing gbrain process (pgrep -f "gbrain")
      → if found: log "skipping cycle, gbrain already running", exit 0
    → reads ~/.gbrain/schedule.yaml (per-source intervals + cron expressions)
    → reads ~/.gbrain/collector-state.json (last-run timestamps + watermarks)
    → computes which sources are due this cycle
    → acquires PGLite lock ONCE
    → runs due collectors sequentially (each writes to staging dir)
    → gbrain import <staging> --no-embed
    → gbrain embed --stale
    → releases lock
    → updates collector-state.json with new timestamps + watermarks
    → logs to ~/.gbrain/logs/
```

**PID guard:** The PGLite lock has a 5-minute stale threshold. If a process
holds the lock >5 min (possible during large embeds), another process could
break it. The orchestrator avoids this by checking for any running `gbrain`
process before starting. If a manual `gbrain embed` or interactive session
is active, the orchestrator skips the cycle and logs a warning. This is
simpler and safer than fighting the lock mechanism.

**Schedule config (`~/.gbrain/schedule.yaml`):**

```yaml
sources:
  gmail:        { every: 30m, script: collectors/gmail.sh }
  slack:        { every: 15m, script: collectors/slack.sh }
  calendar:     { every: 60m, script: collectors/calendar.sh }
  zoom:         { every: 60m, script: collectors/zoom.sh }
  brain-sync:   { every: 15m, command: "gbrain sync --repo ~/brain" }
  health:       { every: 7d,  command: "gbrain doctor --json" }
  dream-cycle:  { cron: "0 2 * * *", script: collectors/dream.sh }
```

**Collector state (`~/.gbrain/collector-state.json`):**

Tracks both scheduling (last-run timestamps for interval computation) and
incremental collection (per-source watermarks like last-seen message ID,
last-synced calendar date, etc.). Single file, updated atomically after each
orchestrator cycle.

This design resolves former open questions 5.3 (incremental collection state),
5.4 (PGLite concurrency), and 5.6 (cross-source entity merging — all writes
happen within one lock, sequential execution prevents conflicts).

### 3.5 Playwright Collector Scripts

Playwright-based collectors that scrape work systems via browser automation.
Each collector is a shell script (or TypeScript) that outputs GBrain-format
markdown files to a staging directory.

Ralph-PVA already has working low-level Playwright skills for most target
systems (`../ralph-pva/.claude/skills/`): `google-calendar`, `google-docs`,
`slack-reader`, `zoom-web`. These encode the actual scraping patterns (selectors,
navigation, auth, API quirks) and can be adapted for collector scripts.

Collectors to create:

| Collector                  | Reuses Ralph-PVA skill  | Output                                  |
|----------------------------|-------------------------|-----------------------------------------|
| `collectors/gmail.sh`      | gmail-reader (planned)  | Person page updates + email media pages |
| `collectors/slack.sh`      | slack-reader            | Meeting pages from significant threads  |
| `collectors/calendar.sh`   | google-calendar         | Daily calendar pages                    |
| `collectors/zoom.sh`       | zoom-web                | Meeting transcript pages                |
| `collectors/gdocs.sh`      | google-docs             | Concept/project pages                   |
| `collectors/confluence.sh` | (new)                   | Concept/project pages                   |
| `collectors/jira.sh`       | (new)                   | Project pages                           |
| `collectors/github.sh`     | (new)                   | Project pages                           |

Each collector must:
- Use the shared Playwright browser (port 3400, `--user-data-dir` for cookies)
- Output GBrain-format markdown to `~/.gbrain/staging/<source>/`
- Track its own watermark in collector-state.json (last-seen ID, timestamp)
- Handle session expiry gracefully (log warning, skip cycle, don't crash)

### 3.6 launchd Configuration

Single plist: `~/Library/LaunchAgents/com.gbrain.orchestrator.plist`

Fires every 10 minutes. Invokes `~/.gbrain/orchestrator.sh` which handles:
- Reading schedule.yaml and collector-state.json
- Computing due sources
- Sequential execution with single PGLite lock
- Logging to `~/.gbrain/logs/`
- Atomic state updates

---

## 4. What Does Not Change

- **PGLite engine** — used as-is, no Supabase
- **Core CLI** — all `gbrain` commands work unchanged
- **Search pipeline** — keyword + vector + RRF + dedup, unchanged
- **Chunking** — recursive (default), semantic and LLM-guided available via gateway
- **Skills** — all 7 skill files work as Claude Code session prompts
- **Page format** — compiled truth + timeline, unchanged
- **MCP server** — works for IDE integration if desired
- **Link graph, tags, timeline, versioning** — all local SQL, unchanged
- **Import pipeline** — `gbrain import` + `gbrain embed --stale`, unchanged
- **Local file storage** — used instead of S3/Supabase storage

---

## 5. Design Decisions

### 5.1 Resolved — Scheduling & Concurrency (formerly 5.3, 5.4, 5.6)

Single orchestrator design. See Section 3.3. Resolves incremental collection
state (watermarks in collector-state.json), PGLite concurrency (one lock per
cycle), and cross-source entity merging (sequential writes, no conflicts).

### 5.2 Resolved — Playwright Session Lifecycle

Ralph-PVA's shared browser architecture is reused as-is. Persistent headed
Chrome via Playwright MCP server (SSE, port 3400), `--user-data-dir` for cookie
persistence. See `../ralph-pva/docs/shared-browser.md`.

Open sub-questions (not blocking, address during implementation):
- MFA re-verification during unattended launchd jobs
- Corporate SSO or anti-bot measures

### 5.3 Open — Dream Cycle Implementation

Deferred. Not blocking. Options: mechanical-only (CLI commands) vs. LLM-assisted
(Claude Code headless). Decide during implementation.

### 5.4 Resolved — Information Architecture (PARA + GTD Hybrid)

#### Decision: User's taxonomy is the target, not GBrain's recommended schema

GBrain's recommended schema (GBRAIN_RECOMMENDED_SCHEMA.md) fragments resources
into ~10 specialized directories (hiring/, writing/, civic/, deals/, media/,
etc.) and has no first-class Tasks, AORs, or Contexts. The user's system is a
PARA + GTD hybrid that uses properties for categorization and many-to-many
relationships for association. GBrain adapts to maintain this system — not the
other way around.

#### The 8 Entity Types (5 Levels)

Levels determine inheritance direction — lower inherits from higher:

| Level | Entity Type | Mandatory Relations | Parent/Child |
|-------|-------------|-------------------|--------------|
| 1 | **Contexts** | None (top level) | Yes (Context→Context) |
| 2 | **AORs** | Must have Context | Yes (AOR→AOR) |
| 3 | **Projects** | Must have AOR or Context (one required) | Yes (Project→Project) |
| 4 | **Tasks** | Can relate to Project, AOR, Context | Yes (Task→Task sub-tasks) |
| 4 | **Events** | Same level as Tasks | No |
| — | **People** | Outside hierarchy | No |
| — | **Organizations** | Outside hierarchy | Yes (Org→Org) |
| 5 | **Resources** | Can relate to anything above | No |

**People and Organizations sit outside the level hierarchy.** They relate to
entities at any level but don't participate in inheritance. Pragmatic reason:
returning every person related to "At Work" context would be useless.

#### Categorization: Properties, Not Folders

All categorization is via properties and relationships. Resources use a `type`
property for sub-categorization (RFC, meeting notes, training material, etc.),
not separate directories.

#### Two Relationship Kinds

1. **Cross-entity (many-to-many):** Task↔Project, Project↔AOR, AOR↔Context,
   Resource↔Task, etc. These are the primary association mechanism.
2. **Parent/child (hierarchical, within type):** Context→Context, AOR→AOR,
   Project→Project, Task→Task (sub-tasks), Org→Org.

#### Inheritance / Visibility Rule

An entity is visible when searching or filtering under:
1. Any relationships the user explicitly set
2. Any relationships inherited from its same-type parent
3. Any relationships inherited through higher-level relations

Example: A Task related to Project X is visible under Project X's AORs AND
Project X's Contexts AND Project X's AOR's Contexts — without the user setting
those on the Task.

**Implementation:** `traverseGraph` (recursive CTE) computes this at query time.
No "Calculated AOR" or "Calculated Context" properties needed. This replaces the
entire Make.com automation scenario (4603968) and all 9 Calculated relations from
the Notion system.

If user sets an AOR and a Context that differs from the AOR's Context, the entity
is visible under ALL of them (union, not override).

#### Inbox Pattern

Items enter inbox with zero relationships. Triage assigns AOR, Context, and
optionally Project. Frictionless capture — nothing is mandatory at creation time.

#### Notion's 43 Relations — Disposition

- **Direct relations** → GBrain typed links (many-to-many)
- **Transitive/inherited relations** (9 Calculated + rollups) → ELIMINATED,
  computed by `traverseGraph` at query time
- **Either/or relations** → separate link types (parent_project, child_project)

**Link constraint:** UNIQUE(from_page_id, to_page_id) works for current use
cases. If multiple concurrent link types between the same pair arise, the schema
change is small: UNIQUE(from_page_id, to_page_id, link_type).

#### Archive Problem (Known, Deferred)

When a Project is archived, which linked Resources/Tasks should archive with it?
Future automation problem. Not blocking.

#### Obsidian as View Layer (Optional, Deferred)

Obsidian pointed at `~/brain/` as a read-only view layer. Dataview plugin for
filtered views over YAML frontmatter. GBrain's database links invisible to
Obsidian's graph view (non-blocking — Dataview covers same use cases). Graph
visualization gap accepted. If it becomes important later: (a) export step that injects
`[[wikilinks]]` into markdown copies, or (b) Obsidian's Dataview relationship
queries (`WHERE contains(file.outlinks, ...)`) as a substitute.

#### Ralph-PVA Reference

Key files in `../ralph-pva/` for understanding the existing system:

- `docs/life-os-reference.md` — Full Notion schema: 8 entities, all properties,
  43 relations, templates, inheritance patterns, API notes
- `docs/life-os-design.md` — Design rationale, taxonomy decisions
- `docs/automations.md` — Make.com scenario 4603968 (inheritance cascades)
- `docs/shared-browser.md` — Shared Playwright browser architecture
- `.claude/skills/check-meetings/SKILL.md` — Calendar → Events data flow
- `.claude/skills/fetch-meeting-notes/SKILL.md` — Zoom → Docs + Notion flow
- `.claude/skills/triage/SKILL.md` — Inbox processing (GTD/Eisenhower)
- `.claude/skills/memory/SKILL.md` — Recall-then-memorize dedup pattern

---

## 6. End State

A fully functional GBrain installation running on macOS where:

- **Database:** PGLite (local embedded Postgres), zero external dependencies
- **Embeddings:** Company AI gateway or local model on DGX Spark
- **Query expansion:** Company AI gateway (Claude via Bedrock endpoint + fetch adapter)
- **Data ingestion:** Playwright-based browser automation, single orchestrator
  on 10-min launchd cycle with per-source scheduling via schedule.yaml
- **Agent runtime:** Claude Code sessions for interactive use, launchd for
  background jobs
- **Cross-session memory:** Claude Code's `.claude/` memory system
- **Information architecture:** All 8 Notion entity types stored as GBrain pages.
  Transitive relations computed by graph traversal, not manual cascades.
  Make.com automations eliminated.
- **View layer:** Obsidian pointed at `~/brain/`, Dataview plugin for filtered
  views. Zero sync, reads filesystem directly. (Section 5.4, resolved)
- **Data sources:** Gmail, Slack, Google Calendar, Zoom, Google Docs,
  Confluence, Jira, GitHub — all flowing into brain pages on schedule
- **Search:** Full hybrid search (vector + keyword + RRF fusion) operational
- **Compounding:** Dream cycle runs nightly via launchd, brain gets smarter
  over time without manual intervention

---

## 7. Test Plan

All new code paths require tests. Existing GBrain test coverage is excellent
(28 unit test files, 5 E2E files). New tests extend the existing suite.

### 7.1 Typed Graph Traversal (add to `test/pglite-engine.test.ts`)

Tests require a PGLite instance with pages + typed links seeded.

| Test | Asserts |
|------|---------|
| `traverseGraph with link_types filter` | Only follows specified link types, ignores others |
| `traverseGraph with target_type filter` | Returns only pages of specified type |
| `traverseGraph with link_types + target_type` | Compound filter (e.g., owns links → task pages) |
| `traverseGraph direction=incoming` | Follows backlinks (to_page_id → from_page_id) |
| `traverseGraph filters with empty result` | Valid query, no matches → empty array |
| `traverseGraph backward-compatible (no filters)` | Omitting all new params matches old behavior |

### 7.2 Bedrock Fetch Adapter (new file: `test/expansion-bedrock.test.ts`)

Mock the fetch call to test the adapter without hitting the real gateway.

| Test | Asserts |
|------|---------|
| `expandQuery calls Bedrock invoke endpoint` | Correct URL, headers, body shape |
| `expandQuery parses Bedrock response` | Extracts expanded queries from tool_use response |
| `expandQuery falls back on network error` | Returns `[original_query]` on fetch failure |
| `expandQuery falls back on 401` | Returns `[original_query]` on auth failure |
| `expandQuery falls back on malformed response` | Returns `[original_query]` on parse error |
| `expandQuery uses AI_GATEWAY_TOKEN env var` | Token read from correct env var |

### 7.3 Orchestrator (`test/orchestrator.test.ts`)

Unit tests for the orchestrator logic (schedule parsing, state management).
These can be TypeScript tests even if orchestrator.sh is a shell script,
by extracting the schedule/state logic into a testable module.

| Test | Asserts |
|------|---------|
| `parseSchedule reads interval sources` | `{ every: "30m" }` → 1800000ms |
| `parseSchedule reads cron sources` | `{ cron: "0 2 * * *" }` → next run time |
| `computeDueSources with fresh state` | All sources due on first run |
| `computeDueSources with recent timestamps` | Sources not yet due are skipped |
| `updateCollectorState atomicity` | State file updated only after cycle completes |
| `PID guard skips when gbrain running` | Detects existing process, returns skip |
| `PID guard proceeds when no gbrain` | No existing process, proceeds normally |

### 7.4 Collector Output Validation (`test/collector-output.test.ts`)

Validate that collector output matches GBrain's expected import format.
Test with fixture files, not live Playwright scraping.

| Test | Asserts |
|------|---------|
| `collector output has valid YAML frontmatter` | type, title, tags present |
| `collector output has compiled truth section` | Content above `---` separator |
| `collector output has timeline with citations` | `[Source: ...]` on each entry |
| `collector output file path matches slug convention` | `people/name.md` → `people/name` |
| `collector output handles empty/missing data` | Graceful output, no crash |
| `task entity has Dataview frontmatter fields` | status, priority, due_date present |

### 7.5 E2E Integration (`test/e2e/orchestrator.test.ts`)

Full orchestrator cycle against a real PGLite database.

| Test | Asserts |
|------|---------|
| `orchestrator cycle imports staged markdown` | Pages appear in DB after cycle |
| `orchestrator cycle embeds new pages` | Chunks created with embeddings |
| `orchestrator skips unchanged files` | Re-run with same staging → no new writes |
| `orchestrator updates collector state` | Timestamps advance after cycle |

---

## 8. NOT in Scope

| Item | Rationale |
|------|-----------|
| Supabase migration / remote DB | PGLite only. No external DB dependency. |
| Real-time webhooks | Playwright is polling-based, not event-driven. |
| ClawVisor / OAuth credential gateway | Corporate environment doesn't support it. |
| Custom web UI for navigation | Obsidian handles the view layer. |
| Obsidian graph view (wikilinks) | Dataview covers all navigation patterns. Defer. |
| Voice-to-Brain / Twilio | Not a target data source. |
| X-to-Brain / Twitter | Not a target data source. |
| Multi-user / team brain | Single-user deployment. |
| Dream cycle implementation details | Deferred (Section 5.3). Decide during implementation. |
| Obsidian plugin development | Use existing Dataview plugin. No custom plugins. |

---

## 9. What Already Exists

| Capability | Existing code | Reused as-is? |
|------------|--------------|---------------|
| PGLite engine (all 37 operations) | `src/core/pglite-engine.ts` | Yes |
| PGLite lock (file-based, stale detection) | `src/core/pglite-lock.ts` | Yes |
| Import pipeline (idempotent, SHA-256) | `src/core/import-file.ts` | Yes |
| Git-based sync (incremental, force-push recovery) | `src/core/sync.ts` | Yes |
| Hybrid search (vector + keyword + RRF) | `src/core/search/` | Yes |
| Query intent classification (regex) | `src/core/search/intent.ts` | Yes |
| Recursive chunking | `src/core/chunkers/recursive.ts` | Yes |
| Embedding (OpenAI SDK, base URL from env) | `src/core/embedding.ts` | Yes |
| Engine factory (dynamic imports) | `src/core/engine-factory.ts` | Yes |
| CLI (all commands) | `src/cli.ts` + `src/commands/` | Yes |
| MCP server (stdio) | `src/mcp/server.ts` | Yes |
| Page versioning | `src/core/pglite-engine.ts` | Yes |
| Ralph-PVA Playwright skills | `../ralph-pva/.claude/skills/` | Adapted |
| Query expansion | `src/core/search/expansion.ts` | Modified (Bedrock adapter) |
| Graph traversal | `src/core/pglite-engine.ts` | Modified (typed filters) |

---

## 10. Failure Modes

| Codepath | Failure scenario | Test coverage | Error handling | User visibility |
|----------|-----------------|---------------|----------------|-----------------|
| Bedrock fetch adapter | Gateway returns 401 (token expired) | Yes (7.2) | Falls back to `[query]` | Silent (search quality degrades slightly) |
| Bedrock fetch adapter | Gateway timeout | Yes (7.2) | Falls back to `[query]` | Silent |
| Typed graph traversal | No pages match filters | Yes (7.1) | Returns empty array | Explicit (empty result) |
| Orchestrator PID guard | Stale PID file (process crashed) | Yes (7.3) | `pgrep` checks live processes, not files | Silent (skips one cycle, next one works) |
| Orchestrator embed | Embed takes >10 min (launchd fires again) | Yes (PID guard) | Guard skips duplicate cycle | Logged warning |
| Playwright collector | Session expired (cookie stale) | Yes (7.4) | Log warning, skip source, continue cycle | Logged, other sources still run |
| Playwright collector | UI change breaks selector | No (fragile by nature) | Script fails, orchestrator catches exit code | Logged error, needs manual fix |
| Import staging | Malformed markdown in staging dir | Yes (existing) | import-file.ts rejects (size, symlink, parse) | Logged, skipped file |

**Critical gap:** Playwright selector breakage (UI changes) has no test and no
automatic recovery. This is inherent to browser automation. Mitigation: log
clearly which collector failed, alert on consecutive failures, and maintain
selector patterns in one place per collector for easy updates.

---

## 11. Implementation Order

Detailed vertical slice plan with work items, file placements, and definitions of
done is in [LONG_RANGE_PLAN.md](LONG_RANGE_PLAN.md). This section captures the
high-level sequencing and dependencies.

**Sequencing principle:** Data first, then search, then navigation, then polish.
Phase 0 (design) defines the data model that everything depends on.

### Phase 0: Data Model Design (no code)

Entity schema mapping (frontmatter conventions for all 8 Notion entity types),
Notion relation → gbrain link type mapping, env var setup documentation.
Tracked by `gbrain-alt-73z`.

### Data Pipeline (Slices 1-6)

Brain repo setup as Claude Code project + orchestrator infrastructure + collectors
(Calendar, Slack, Gmail, Zoom, Docs/Confluence, Jira/GitHub). Calendar first
(simplest source, proves the full pipeline). Remaining collectors are parallel.

### Search + Navigation (Slices 7-8)

Bedrock fetch adapter (query expansion via corporate AI gateway) and typed graph
traversal (link_types + target_type filters on CTE). Both independent, both
require data in the brain to be meaningful.

### Notion Integration (Slices 9-10)

Notion data migration + entity resolution, then Notion bidirectional integration
(sync-out + Inbox collector). GBrain is SoR, Notion stays as UI and input channel.

### Agent Behavior (Slice 11)

6-layer info architecture mapping + ralph-pva skill porting into brain repo.
Blocked by `gbrain-alt-n9i`.

### Validation (Slice 12)

Workflow validation: triage, meeting prep, task management. Final acceptance gate.

### Obsidian (Slice 13, optional)

Deferred until user is ready. Not blocking anything.

### Stage 2: Notion as Bidirectional UI + Migration

**Key decision (2026-04-15):** Notion is NOT being replaced wholesale. GBrain
becomes the SoR, but Notion stays as a **bidirectional UI and input channel**:

- **GBrain → Notion (sync-out):** Brain changes reflected to Notion pages. Either
  via a periodic skill (every 10 min) or as part of the enrichment skill that runs
  on every input. The enrichment hook approach (option b) is preferred — after
  updating the brain repo, also update Notion.
- **Notion → GBrain (Inbox collector):** Notion's Inbox (under "Top of Mind") is a
  key input channel. User clips links, drops phone notes, captures ideas there.
  The ralph-pva "Triage" skill processes this inbox. This becomes a gbrain collector
  that pulls Inbox items into brain pages.
- **Obsidian is optional, not required.** The user doesn't want to learn Obsidian
  until the majority of the system is functioning. Obsidian view layer is a
  nice-to-have slice at the end, not a blocking dependency.

This eliminates the riskiest part of the original plan (Codex finding #6 — can
Obsidian replace Notion's operational views?) by not attempting it. Keep what works
(Notion UI, Inbox, phone capture) and add what was missing (compounding knowledge
base, hybrid search, cross-source synthesis).

**Depends on:** Stage 1 complete (working gbrain with data flowing in).

```
Phase 4: Notion entity mapping + data migration
  ├── 4a. Concrete frontmatter schema per entity type (all 8 Notion entities)
  ├── 4b. Notion relation → gbrain typed link mapping (43 relations → simplified set)
  ├── 4c. Notion data export → GBrain import (with entity resolution)
  └── 4d. Entity resolution across data sources (same person in Gmail vs Slack vs Calendar)

Phase 5: Notion bidirectional integration
  ├── 5a. Notion sync-out skill (gbrain → Notion, via enrichment hook or periodic)
  ├── 5b. Notion Inbox collector (Notion → gbrain, adapts ralph-pva Triage skill)
  └── 5c. Frontmatter conventions for task-managed entities (status, priority, due_date)

Phase 6: Skill porting + workflow validation
  ├── 6a. Map ralph-pva 6-layer info architecture to gbrain-alt equivalents
  ├── 6b. Port ralph-pva skills that add value beyond vanilla gbrain skills
  │       (triage, meeting prep, recall-then-memorize dedup)
  ├── 6c. Validate triage workflow (inbox → categorize → route to correct pages)
  ├── 6d. Validate meeting prep workflow (person context, open threads, history)
  └── 6e. Validate task management workflow (create, prioritize, delegate, complete)

Phase 7: Obsidian view layer (optional, deferred)
  ├── 7a. Obsidian vault setup pointed at ~/brain/
  └── 7b. Dataview dashboard notes (AOR→Projects→Tasks, person context, filtered views)
```

**Success criteria:** GBrain is the SoR with data flowing from collectors AND
Notion Inbox. Brain changes sync back to Notion. The user can triage, prep for
meetings, and manage tasks using Notion as the UI while GBrain handles search,
synthesis, and the compounding knowledge base.

**Risk profile:** Entity resolution across sources (Codex finding #7). Multi-link
constraint (Codex finding #8). Notion sync-out fidelity (new risk — how much of
a brain page maps cleanly back to Notion properties?).

**Key dependencies on open issues:**
- `gbrain-alt-73z` (P1): Notion entity-to-gbrain schema mapping — needed for 4a, 4b
- `gbrain-alt-n9i` (P2): 6-layer info architecture mapping — needed for 6a
- `gbrain-alt-kwj` (P2): Outside Voice findings — #7, #8 affect feasibility

### Worktree Parallelization Strategy

See [LONG_RANGE_PLAN.md](LONG_RANGE_PLAN.md) dependency map for full details.
Collectors (Slices 2-6) are independent and can run in parallel worktrees.
Search/navigation (Slices 7-8) are independent of collectors and each other.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 5 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG REVIEW CLEARED — 5 issues found and resolved, 1 critical gap documented (Playwright selector fragility, inherent to browser automation).
