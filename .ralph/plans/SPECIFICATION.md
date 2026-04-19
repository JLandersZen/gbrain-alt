# Specification: Rebase `internal-adaptation` onto upstream master

## Summary

The `internal-adaptation` branch (26 commits) has diverged from upstream `origin/master` (8 commits, v0.8.1 → v0.12.3). Both sides made significant changes to the import/sync/search pipeline. A careful rebase is needed to incorporate upstream's security fixes, reliability improvements, knowledge graph layer, and job queue — while preserving our PARA+GTD taxonomy, four-zone page structure, frontmatter-driven relations, and Notion import normalization.

## Current State

### Merge base

Commit `d547a64` — "feat: search quality boost — compiled truth ranking + detail parameter (v0.8.1)"

### Our branch (26 commits, oldest → newest)

| Commit | Category | Key changes |
|--------|----------|-------------|
| `50b12ab` | infra | beads issue tracking init |
| `3c816d6` | **taxonomy** | Replace `PageType` union with PARA+GTD (context, aor, project, task, event, resource, interest, person, organization) |
| `32291d1` | docs | execution plan update |
| `265b1b2` | **taxonomy** | Update all test fixtures to PARA+GTD types |
| `0298795` | test | Fix E2E resource count assertion |
| `abe976e` | **taxonomy+docs** | Update all documentation to PARA+GTD taxonomy (Slice 1c) — includes `GBRAIN_RECOMMENDED_SCHEMA.md` rewrite |
| `db64f17` | docs | migrate skill prerequisites + Notion fixes |
| `d20008e` | docs | execution plan + POC findings |
| `2d337de` | **config** | Local-first config — project-scoped `.gbrain/` |
| `c40f460` | docs | README indexes for docs/ subdirectories |
| `9032faa` | infra | .ralph planning docs + .claude project settings |
| `43a0977` | docs | execution plan updates |
| `280fa3b` | docs | local-first config guide |
| `903c7ad` | **four-zone** | Four-zone page structure spec and plan |
| `a202ab8` | **four-zone** | Extend markdown parser to four-zone (compiled_truth + relationships + timeline) |
| `b8ca726` | docs | Slice 3b-pre Notion import data quality |
| `3128a1c` | docs | Fix spec inaccuracy |
| `cb15692` | **normalize** | Add normalize utility functions and tests |
| `0ca2406` | **normalize** | Integrate import normalization into pipeline |
| `72e22c6` | fix | embed fails loudly without OPENAI_API_KEY |
| `d4c89e1` | fix | Normalize `---` HRs to `***` during import |
| `9bbfd5e` | **relations** | Extract frontmatter relations into links table during import |
| `1b76679` | **relations** | Generate navigable relationships zone from frontmatter |
| `50a75c4` | fix | Generate relationships zone on skipped files |
| `3b8a5b2` | **relations** | Reconstruct reverse links from one-sided Notion imports |
| `22ea546` | fix | Flatten Notion `links:` nesting during normalization |
| `64c61e4` | **sync** | `brain/` as standalone git repo + `sync --subdir` for monorepos |
| `0ed61d2` | **four-zone+test** | Four-zone docs + E2E relations pipeline tests |
| `29dd1c7` | chore | Fix stale NEXT marker |
| `f636e0f` | chore | Archive completed plan/spec |

### Upstream (8 commits, oldest → newest)

| Commit | Version | Key changes |
|--------|---------|-------------|
| `e5a9f01` | v0.10.0 | GStackBrain — 16 new skills, resolver, conventions, identity layer |
| `b7e3005` | v0.10.1 | Sync pipeline fixes, extract command, features, autopilot |
| `7bbfc3e` | — | **Security fix wave 3** — 9 vulnerabilities (file_upload, SSRF, recipe trust, prompt injection) |
| `d861336` | v0.11.1 | **Minions** (Postgres job queue), canonical migration, skillify |
| `81b3f7a` | v0.10.3 | **Knowledge graph layer** — auto-link, typed relationships, graph-query |
| `699db50` | v0.12.1 | Fix extract N+1 hang + migration timeout |
| `c0b6219` | v0.12.1 | JSONB double-encode + splitBody wikilink fix + parseEmbedding |
| `013b348` | v0.12.3 | **Reliability wave** — sync deadlock fix, search timeout scoping, wikilinks, orphans |

### Scale of divergence

- Upstream: 435 files changed, +37,897 / -1,229 lines
- Our branch: ~30 files changed, ~1,500 lines net

## Conflict Analysis

### HIGH RISK: `src/core/markdown.ts` — body splitting

**Ours:** Four-zone `splitBody()` that returns `{ compiled_truth, relationships, timeline }`. Uses `---` horizontal rules as zone separators. Two separators = three zones; one separator = two zones (backwards compatible).

**Upstream:** Two-zone `splitBody()` that returns `{ compiled_truth, timeline }`. Fundamentally changed the separator logic: bare `---` is NO LONGER a timeline separator (caused 83% content truncation on wiki corpora). New sentinels: `<!-- timeline -->` (preferred), `--- timeline ---` (decorated), or `---` ONLY when followed by `## Timeline` / `## History` heading.

**Resolution strategy:** We must adopt upstream's sentinel-based approach (it fixes a real data loss bug) AND extend it to support our four-zone structure. The relationships zone needs its own sentinel (e.g., `<!-- relationships -->`) so it's unambiguous. Our `renderRelationshipsZone()` already controls what gets written — we just need to emit a sentinel marker above it and teach the parser to recognize it.

### HIGH RISK: `src/core/types.ts` — PageType union

**Ours:** Replaced the entire `PageType` with PARA+GTD: `'context' | 'aor' | 'project' | 'task' | 'event' | 'resource' | 'interest' | 'person' | 'organization'`

**Upstream:** Extended the original union: `'person' | 'company' | 'deal' | 'yc' | 'civic' | 'project' | 'concept' | 'source' | 'media' | 'writing' | 'analysis' | 'guide' | 'hardware' | 'architecture'`

**Resolution strategy:** Keep our PARA+GTD taxonomy as the authoritative type set. The `PageType` is documented as a TEXT column in the DB (unconstrained) — the TypeScript union is advisory, not enforced at runtime. We keep our nine types. Upstream's additions (`writing`, `analysis`, `guide`, `hardware`, `architecture`) are domain-specific to Garry's brain and not needed. Our normalize pipeline already maps incoming types to our taxonomy.

### MEDIUM RISK: `src/core/import-file.ts` — ParsedPage return

**Ours:** Added `extractRelationsFromFrontmatter()` call and `renderRelationshipsZone()` call inside `importFromContent()`.

**Upstream:** Added `ParsedPage` interface and returns it from `importFromContent()` for both `'imported'` and `'skipped'` statuses. This is consumed by the auto-link post-hook in `put_page`.

**Resolution strategy:** Accept upstream's `ParsedPage` addition — it's purely additive and our relations code can coexist. Our frontmatter-to-links extraction fires during import; upstream's auto-link fires on `put_page`. They're complementary (import-time vs. edit-time).

### MEDIUM RISK: `src/commands/sync.ts` — transaction removal + auto-extract

**Ours:** Added `--subdir` flag for monorepo support, standalone brain repo handling.

**Upstream:** Removed nested transaction wrapper (fixed PGLite deadlock), added auto-extract (links + timeline) and auto-embed post-sync hooks.

**Resolution strategy:** Accept upstream's deadlock fix (critical). Accept auto-extract hook — it calls `extract.ts` which does content-based link extraction (markdown `[Name](slug)` patterns). This is complementary to our frontmatter-based relation extraction. Keep our `--subdir` additions.

### MEDIUM RISK: `src/core/engine.ts` — new interface methods

**Upstream adds:**
- `getAllSlugs(): Promise<Set<string>>`
- `addLinksBatch(links: LinkBatchInput[]): Promise<number>`
- `removeLink(from, to, linkType?)` — now accepts optional linkType
- `traversePaths(slug, opts?)` — edge-based graph traversal
- `getBacklinkCounts(slugs: string[])` — batch backlink counts

**Resolution strategy:** Accept all additions. These are interface extensions our code doesn't need to call immediately, but both PGLite and Postgres engines must implement them. Upstream provides the implementations.

### MEDIUM RISK: `src/schema.sql` — schema changes

**Upstream:**
- `links` unique constraint now includes `link_type` (was just `from_page_id, to_page_id`)
- Timeline dedup index: `UNIQUE(page_id, date, summary)`
- Removed timeline→search_vector trigger (prevents double-weighting)
- Added entire `minion_jobs`, `minion_inbox`, `minion_attachments` tables + indexes

**Resolution strategy:** Accept all schema changes. The links constraint change is actually what we want — it allows multiple typed links between the same two pages (which our relation types require). The minion tables are additive.

### LOW RISK: `src/core/link-extraction.ts` (NEW upstream)

Upstream's new module extracts entity references from markdown link syntax (`[Name](slug)`) and wikilinks (`[[slug]]`). It's complementary to our `relations.ts` which extracts from YAML frontmatter arrays.

**Ours (`relations.ts`):** Frontmatter field arrays → typed links. Semantic relationships declared by users/importers.

**Upstream (`link-extraction.ts`):** Body content markdown links → inferred links. Navigational references found in prose.

**Resolution strategy:** Both should exist. They serve different purposes and produce different link populations. No conflict.

### LOW RISK: `docs/GBRAIN_RECOMMENDED_SCHEMA.md`

**Upstream:** Zero changes since merge base.

**Ours:** Complete rewrite to PARA+GTD taxonomy, four-zone structure, nine directory types.

**Resolution strategy:** Our version wins cleanly. No merge conflict.

### LOW RISK: New upstream modules with no overlap

- `src/core/minions/` — job queue (6 files)
- `src/core/backoff.ts` — retry backoff
- `src/core/check-resolvable.ts` — slug validation
- `src/core/data-research.ts` — enrichment research
- `src/core/enrichment-service.ts` — enrichment orchestrator
- `src/core/fail-improve.ts` — failure learning
- `src/core/preferences.ts` — user preferences
- `src/core/transcription.ts` — audio transcription
- `src/commands/autopilot.ts` — automated operations
- `src/commands/features.ts` — feature flag system
- `src/commands/graph-query.ts` — graph traversal CLI
- `src/commands/jobs.ts` — job queue CLI
- `src/commands/orphans.ts` — orphan page detection
- `src/commands/repair-jsonb.ts` — JSONB repair
- `src/commands/migrations/` — versioned schema migrations
- `eval/data/world-v1/` — synthetic eval dataset (200+ files)
- 30+ new test files

**Resolution strategy:** Accept all. Additive, no overlap with our work.

## End State

After rebase, the codebase will have:

1. **PARA+GTD taxonomy** — our nine types as the TypeScript union and documentation standard
2. **Four-zone page structure** — using sentinel-based splitting (upstream's approach) with our three-zone extension:
   - `<!-- relationships -->` sentinel for relationships zone
   - `<!-- timeline -->` sentinel for timeline zone
   - Backwards compatible: files without sentinels parse correctly
3. **Frontmatter-driven relations** (`relations.ts`) — coexisting with upstream's content-based link extraction (`link-extraction.ts`)
4. **Notion import normalization** (`normalize.ts`) — type mapping, field renames, path cleaning
5. **Sync `--subdir` for monorepos** — our addition on top of upstream's deadlock-fixed sync
6. **All upstream v0.10–v0.12.3 features** — knowledge graph, minions job queue, security fixes, reliability improvements, 16 new skills, autopilot, orphan detection, migration framework

## Rebase Execution Approach

### Why rebase (not merge)

- Our branch is a local adaptation fork — linear history makes future upstream pulls cleaner
- 26 commits is manageable for interactive conflict resolution
- Many of our commits are docs/plans that won't conflict at all
- The 4-5 conflicting commits can be handled individually with full context

### Conflict resolution order (by commit)

Commits will be replayed onto `origin/master`. Expected conflicts at:

1. **`3c816d6` (PageType replacement)** — will conflict with upstream's extended union. Resolution: apply our PARA+GTD types, discarding upstream's additions.

2. **`265b1b2` (test fixtures)** — may conflict with upstream's new tests. Resolution: keep our fixture types, add any new upstream test files verbatim.

3. **`abe976e` (docs rewrite)** — may conflict with upstream CLAUDE.md/README changes. Resolution: our schema doc wins; upstream's CLAUDE.md additions (new files, architecture notes) get merged in.

4. **`a202ab8` (four-zone parser)** — WILL conflict with upstream's `splitBody` rewrite. Resolution: rewrite our four-zone parser to use sentinel-based approach (`<!-- relationships -->`, `<!-- timeline -->`). This is the hardest commit.

5. **`0ca2406` + `9bbfd5e` + `1b76679` (normalize + relations)** — may have minor conflicts with upstream's `import-file.ts` changes (ParsedPage addition). Resolution: integrate our code alongside upstream's additions.

6. **`64c61e4` (sync --subdir)** — will conflict with upstream's sync.ts rewrite (removed transaction, added auto-extract). Resolution: layer our --subdir on top of upstream's fixed sync.

### Pre-rebase preparation

1. Create a backup branch: `git branch internal-adaptation-backup`
2. Verify all our tests pass on current branch (baseline)
3. Review upstream's test suite additions for any that test assumptions incompatible with our taxonomy

### Post-rebase validation

1. `bun test` — all unit tests pass (including upstream's 30+ new test files)
2. `bun run test:e2e` — full E2E lifecycle
3. Verify four-zone round-trip: parse → serialize → parse produces identical output
4. Verify relations extraction still works end-to-end
5. Verify normalize pipeline maps upstream's test data types to our taxonomy
6. Verify `gbrain sync --subdir` still works with upstream's deadlock fix

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Four-zone parser rewrite introduces parsing bugs | Medium | High | Extensive test coverage exists; add sentinel-specific test cases |
| Upstream's link-extraction conflicts with our relations at runtime (duplicate links) | Low | Medium | Both use `ON CONFLICT DO NOTHING`; different link_types prevent true duplicates |
| New engine interface methods not implemented in our PGLite patches | Medium | Medium | Upstream provides implementations; verify they apply cleanly |
| Upstream tests hardcode `company` type that we renamed to `organization` | High | Low | Search-replace in test fixtures during rebase; our normalize pipeline handles runtime mapping |
| Minions job queue adds complexity we don't use yet | Low | Low | It's schema-only until we wire a worker; no runtime cost |

## Non-Goals

- **Not migrating upstream's eval dataset** to our taxonomy. The `eval/data/world-v1/` files use `companies/` paths — that's fine, they're synthetic test data.
- **Not rewriting upstream's link-extraction.ts** to use our PARA+GTD directory names. Its `DIR_PATTERN` regex already accepts custom directories; we just verify our directories work.
- **Not implementing minion workers** in this project. The schema and queue code land but remain dormant until we need async job processing.
- **Not changing upstream's test assertions** about page types unless they fail. The DB column is unconstrained TEXT — `company` and `organization` both work at the database level.
