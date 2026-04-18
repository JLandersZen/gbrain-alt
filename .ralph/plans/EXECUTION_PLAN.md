# Execution Plan: Taxonomy Replacement + Notion Import POC

**Spec:** [SPECIFICATION.md](SPECIFICATION.md)
**Branch:** `internal-adaptation`
**Date:** 2026-04-16
**Method:** Vertical slices. Each sub-slice produces passing tests, a commit, and
a push. No sub-slice leaves the codebase broken.

---

## Phases and Workspaces

| Phase | Where | What |
|-------|-------|------|
| **Phase 1** | This repo (`gbrain-alt`), branch `internal-adaptation` | Taxonomy replacement in tool code, tests, docs |
| **Phase 2** | New worktree alongside `ralph-pva` (same parent folder) | Notion export → brain repo via existing `gbrain` migrate skill |

Phase 1 changes the tool. Phase 2 uses the tool — no new Notion-specific code in
gbrain-alt. The user exports from Notion via the Notion UI, then we run the
migrate skill against the exported markdown+CSV to see how well gbrain handles it
as-is. Gaps found during Phase 2 feed back into gbrain-alt as targeted fixes on
`internal-adaptation`, not as new subsystems.

---

## Phase 1: Taxonomy Replacement

Replace Garry Tan's 9 hardcoded types with the PARA+GTD taxonomy throughout
gbrain-alt. Three sub-slices, each independently committable.

### Slice 1a — Core Code + Direct Unit Tests ✅ DONE

**Completed:** 2026-04-16. All 591 tests pass. Beads: `gbrain-alt-bxp`.

**Goal:** The TypeScript type system and runtime behavior use the new taxonomy.
`bun test` passes.

**Files changed:**

| File | Change | Lines |
|------|--------|-------|
| `src/core/types.ts:2` | Replace `PageType` union with 9 new types | ~3 |
| `src/core/markdown.ts:125-139` | Rewrite `inferType()` — new directory map, default `resource` | ~15 |
| `src/commands/backlinks.ts:31,37` | Update `extractEntityRefs` regex to include all 9 entity directories | ~5 |
| `test/markdown.test.ts` | Update `inferType()` test cases for new directories/types | ~30 |
| `test/backlinks.test.ts` | Update entity directory pattern assertions | ~10 |

**Acceptance:**
- `bun test -- test/markdown.test.ts test/backlinks.test.ts` passes
- `inferType('contexts/at-work.md')` returns `'context'`
- `inferType('organizations/acme.md')` returns `'organization'`
- `inferType('unknown/foo.md')` returns `'resource'` (new default)
- `extractEntityRefs` detects links to all 9 entity directories

**Commit message pattern:** `feat: replace PageType union with PARA+GTD taxonomy`

---

### Slice 1b — Remaining Tests + Benchmark ✅ DONE

**Completed:** 2026-04-16. All 591 tests pass. Beads: `gbrain-alt-2in`.

**Goal:** All test files use the new types. Full `bun test` passes. Search quality
benchmark runs with new entity types.

**Files with old type references** (found via grep post-1a):

| File | Old types found |
|------|-----------------|
| `test/pglite-engine.test.ts` | `person`, `company`, `concept` in fixtures/assertions |
| `test/dedup.test.ts` | `person`, `concept` in SearchResult fixtures |
| `test/search.test.ts` | type values in search result fixtures |
| `test/search-limit.test.ts` | type values in limit test fixtures |
| `test/utils.test.ts` | type values in utility test fixtures |
| `test/file-resolver.test.ts` | type values in resolver fixtures |
| `test/e2e/mechanical.test.ts` | type filtering, assertions, CRUD test types |
| `test/e2e/search-quality.test.ts` | type values in search quality fixtures |
| `test/benchmark-search-quality.ts` | 40+ page definitions — types, slugs, directory prefixes |

**Additional files changed** (discovered during implementation):

| File | Old types found |
|------|-----------------|
| `test/import-file.test.ts` | `concept` types and `concepts/` slug paths in import test fixtures |
| `test/publish.test.ts` | `companies/` directory reference in test content |
| `test/e2e/sync.test.ts` | `concept` types and `concepts/` directory in sync test repo setup |
| `test/e2e/fixtures/` | Renamed directories: `companies/`→`organizations/`, `concepts/`→`resources/`, `deals/`→`events/`, `sources/` merged into `resources/`. Updated all frontmatter `type:` values. |

**Acceptance:**
- `bun test` passes (all unit + inline E2E test files) ✅
- `bun run test/benchmark-search-quality.ts` completes without type errors ✅
- No references to `deal`, `yc`, `civic`, `concept`, `source`, or `media` as
  literal type values in any test file (excluding comments about the migration) ✅

**Commit message pattern:** `test: update all test fixtures to PARA+GTD types`

---

### Slice 1c — Documentation ✅ DONE

**Completed:** 2026-04-16. All 591 tests pass. Beads: `gbrain-alt-0lf`.

**Goal:** All documentation references the new taxonomy. No Garry Tan-specific
type references remain outside of CHANGELOG.md historical entries.

**Files changed:**

| File | Change |
|------|--------|
| `docs/GBRAIN_RECOMMENDED_SCHEMA.md` | Full rewrite: directory structure, decision tree, page templates, disambiguation rules, worked examples, architecture diagrams — all updated to PARA+GTD taxonomy. Non-taxonomy content preserved. |
| `skills/_brain-filing-rules.md` | Decision protocol, misfiling patterns, notability gate, iron law — all updated to new types |
| `README.md` | 11 edits: type list, code examples, schema table, narrative references |
| `CLAUDE.md` | Audited — no old type references found, no changes needed |
| `skills/enrich/SKILL.md` | 8 edits: company→organization in templates and references |
| `skills/query/SKILL.md` | concepts/ → resources/ in citation example |
| `skills/publish/SKILL.md` | 7 occurrences of companies/acme → organizations/acme |
| `skills/setup/SKILL.md` | Updated entity type lists |
| `skills/ingest/SKILL.md` | Updated all directory references |
| `skills/maintain/SKILL.md` | Updated directory references |
| `skills/briefing/SKILL.md` | deal→project throughout |
| `skills/migrations/v0.9.0.md` | companies/ → organizations/ |
| `skills/migrations/v0.8.1.md` | Updated directory references |
| `docs/GBRAIN_V0.md` | concepts/ → resources/, type: concept → type: resource |
| `docs/designs/HOMEBREW_FOR_PERSONAL_AI.md` | deal-tracker → project-tracker |
| `docs/guides/originals-folder.md` | concepts/ → resources/ |
| `docs/guides/entity-detection.md` | companies/ → organizations/, concepts/ → resources/ |
| `docs/guides/diligence-ingestion.md` | companies/ → organizations/ |
| `docs/guides/repo-architecture.md` | Full directory tree rewrite to PARA+GTD |
| `docs/guides/skill-development.md` | media/ → resources/ |
| `docs/guides/idea-capture.md` | concepts/ → resources/, media/ → resources/ |
| `docs/guides/content-media.md` | media/ → resources/, sources/ → resources/ |
| `docs/guides/cron-schedule.md` | deal → project |
| `docs/guides/brain-agent-loop.md` | deal → project |
| `docs/guides/enrichment-pipeline.md` | deal → project, company → organization |

**Acceptance:** ✅
- `grep -rn` for old type names finds zero hits outside CHANGELOG.md ✅
- Documentation decision tree matches spec §2.10 ✅
- README examples use `resources/` not `concepts/` ✅

**Commit message pattern:** `docs: update all documentation to PARA+GTD taxonomy`

---

### Slice 1 — E2E Validation ✅ DONE

**Completed:** 2026-04-16. All 95 E2E tests + 591 unit tests pass. Beads: `gbrain-alt-x63`.

Ran full E2E test lifecycle using podman (pgvector/pgvector:pg16 container on
port 5434). Found one count assertion bug: `test/e2e/mechanical.test.ts` expected
5 resources but the `crustdata-sarah-chen.md` fixture was migrated from `type: source`
to `type: resource` in Slice 1b, making the correct count 6. Fixed and verified.

---

## Phase 2: Notion Import POC

**Workspace:** `ralph-brain` worktree at `/Users/jlanders/gitlab_local/ralph-brain`
(created via `bd worktree create` from `ralph-pva`). Notion export goes in
`ralph-brain/exports/`. Imported brain pages go in `ralph-brain/brain/`.

### Slice 2a — Local-first Config ✅ DONE

**Completed:** 2026-04-18. All 600 tests pass (9 new config discovery tests). Beads: `gbrain-alt-j53`.

**Problem:** gbrain config (`~/.gbrain/config.json`) and PGLite database
(`~/.gbrain/brain.pglite`) were global singletons. No per-project isolation.

**Solution implemented:**
- `src/core/config.ts` — `discoverConfigDir()` walks up from cwd looking for
  `.gbrain/config.json`, falls back to `~/.gbrain/`. New exports: `setConfigDir()`,
  `resetConfigDir()`, `globalConfigDir()`. `configDir()` and `configPath()` now
  return the resolved (local or global) path. Module-level cache with reset for tests.
- `src/commands/init.ts` — `gbrain init` creates `.gbrain/` in cwd by default.
  `--global` flag creates at `~/.gbrain/` (old behavior). `.gitignore` updated
  automatically for local init.
- `src/commands/import.ts` — checkpoint path uses `configDir()` (per-brain).
- `src/commands/migrate-engine.ts` — manifest uses `globalConfigDir()`, default
  pglite target uses `configDir()`.
- `src/commands/integrations.ts` — heartbeat uses `globalConfigDir()` (global).
- `src/commands/upgrade.ts` — upgrade state uses `globalConfigDir()` (global).
- `src/commands/config.ts` — `config show` displays resolved config path.
- `test/config-discovery.test.ts` — 9 tests covering discovery, override, reset,
  global fallback, save/load roundtrip, env var precedence.

**Documentation:** ✅ (2026-04-18, Beads: `gbrain-alt-8hn`)
- `docs/guides/local-first-config.md` — New guide: discovery algorithm, credential
  precedence, usage examples, programmatic API, scope table
- `docs/guides/README.md` — Updated index with new guide
- `docs/ENGINES.md` — Fixed stale `~/.gbrain/brain.db` path, added config discovery link
- `README.md` — Updated Setup details to reference project-local config
- `CLAUDE.md` — Added `src/core/config.ts` and `docs/guides/local-first-config.md` to key files
- `src/core/db.ts` — Updated error message to reference `gbrain config show`

**Acceptance:** ✅
- `gbrain init` creates `.gbrain/config.json` and `.gbrain/brain.pglite` in project dir
- `gbrain init --global` creates at `~/.gbrain/` (old behavior)
- All commands find local config automatically via walk-up
- Two worktrees can each have independent databases
- `bun test` passes (600 tests, 0 failures)

### Slice 2b — Notion Import (second attempt) ⬅ NEXT

**Depends on:** Slice 2a (local-first config) ✅

**Goal:** Same as original Slice 2 but with fixes from first POC attempt.

**What changed since first attempt:**
- Migrate skill updated with prerequisites section (checks init, API keys,
  permanent output dir), Notion-specific fixes (truncated titles, slug collision
  investigation), and post-migration AGENTS.md update
- ralph-brain worktree recreated fresh via `bd worktree create`
- gbrain skills installed in `ralph-brain/.claude/skills/gbrain-*/`
- User needs to re-download Notion export (old one was in deleted worktree)

**Prerequisites completed:**
- ✅ Slice 2a (local-first config) shipped
- ✅ `gbrain` linked from gbrain-alt (v0.9.3 with local-first config)
- ✅ `gbrain init` run in ralph-brain — `.gbrain/config.json` + `.gbrain/brain.pglite` created
- ✅ `.gitignore` updated to exclude `.gbrain/`
- ✅ `gbrain doctor` passes in ralph-brain

**Remaining steps (run from ralph-brain worktree, NOT gbrain-alt):**
1. Set up `.env` with `OPENAI_API_KEY` and `OPENAI_BASE_URL` (company AI gateway)
2. User downloads fresh Notion export into `ralph-brain/exports/`
3. Run migrate skill — it now checks prerequisites, handles truncated titles,
   investigates slug collisions, and outputs to `brain/` (permanent)
4. `gbrain import brain/ --no-embed` then verify `OPENAI_API_KEY` is set
   before running `gbrain embed --stale`
5. Validate: `gbrain search`, `gbrain list -n 999`, spot-check pages

**First POC findings (2026-04-16) to watch for:**
- Notion export truncates long titles → relations don't resolve (migrate skill
  now warns about this)
- Don't create entity subdirs in advance (import creates them)
- Check `OPENAI_API_KEY` before starting embeddings
- PGLite is single-writer — don't run concurrent gbrain commands
- `gbrain list` caps at 50 — may need a tool fix if `-n` flag is still broken

**Acceptance:**
- `gbrain --version` works in `ralph-brain`
- `gbrain doctor` passes with project-local database
- Notion pages import with correct types via `inferType()`
- Properties map to frontmatter, relations map to links
- `gbrain search` returns meaningful results
- `gbrain graph` traverses relationships
- AGENTS.md updated to reflect gbrain as SoR

**What comes back to gbrain-alt:** Tool-level gaps discovered during import
get fixed on `internal-adaptation` as targeted slices.

---

## Phase 3: Four-Zone Page Structure + Relation-Aware Sync

**Workspace:** This repo (`gbrain-alt`), branch `internal-adaptation`
**Spec:** §5 (Four-Zone Page Structure and Relation Storage)

Gaps discovered during Phase 2 (Notion Import POC), fed back as targeted fixes.

### Slice 3a — Three-Zone Parser ✅ DONE

**Completed:** 2026-04-18. All 608 tests pass (23 markdown tests, up from 17). Beads: `gbrain-alt-9qw`.

**Goal:** `splitBody()` returns `{ compiled_truth, relationships, timeline }`.
Backwards compatible — pages with one `---` still parse as compiled_truth + timeline.

**Files changed:**

| File | Change |
|------|--------|
| `src/core/markdown.ts` | Extended `splitBody()` to detect two `---` separators. Returns `relationships` as third field. Updated `parseMarkdown()` to pass through `relationships`. Updated `serializeMarkdown()` to accept optional `relationships` in meta and emit four-zone format. Updated JSDoc to describe four-zone structure. |
| `src/core/types.ts` | `ParsedMarkdown` interface gets `relationships: string` field. `Page` interface unchanged (relationships is a parsing-layer concern, not a DB column). |
| `test/markdown.test.ts` | 6 new tests: three-zone split, empty relationships zone, 3+ separators, four-zone round-trip, serialize with/without relationships. All existing tests updated to assert `relationships` field. |

**Design decision:** `relationships` lives in `ParsedMarkdown` (parsing layer) but NOT in `Page` (database layer). The DB has no `relationships` column — this zone is generated from frontmatter and written back to the markdown file by sync. The database stores `compiled_truth` and `timeline` only.

**Acceptance:** ✅
- `splitBody()` with two `---` returns three zones ✅
- `splitBody()` with one `---` returns compiled_truth + timeline (relationships empty) ✅
- `splitBody()` with no `---` returns compiled_truth only ✅
- `serializeMarkdown()` omits relationships zone when empty (backwards compatible) ✅
- `serializeMarkdown()` includes relationships zone when provided ✅
- `bun test` passes (608 tests, 0 failures) ✅

### Slice 3b-pre — Notion Import Data Quality Fixup ✅ DONE

**Completed:** 2026-04-18. All 652 tests pass (35 normalize + 5 markdown + 4 import integration tests). Beads: `gbrain-alt-1yx`.

**Root cause:** All 5 issues are Notion export artifacts (plural DB names, display-name relations, emoji-sanitized field names, raw paths with UUIDs, Notion property names).

**Solution: integrated into the import pipeline.**

| Layer | What normalizes | Where |
|-------|----------------|-------|
| `parseMarkdown()` | Type singularization (`tasks` → `task`), field renames (`_events` → `related_events`, `parent_page` → `parent`) | Every parse, always |
| `importFromContent()` | Display-name → slug resolution, Notion path cleaning in body | Only when `titleMap` option is provided |
| `runImport()` | Pre-scans all page titles, builds `TitleMap`, passes to `importFromContent()` | Directory imports only |

**Files changed:**

| File | Change |
|------|--------|
| `src/core/markdown.ts` | `parseMarkdown()` calls `normalizeType()`, applies `FIELD_RENAMES` map |
| `src/core/import-file.ts` | `importFromContent()` accepts optional `titleMap`, calls `normalizeFrontmatter()` and `normalizeBody()` |
| `src/commands/import.ts` | `runImport()` pre-scans titles via `buildTitleMap()`, passes to each `importFile()` call |
| `src/core/normalize.ts` | Utility module (unchanged from first attempt) |
| `test/markdown.test.ts` | 5 new tests: plural type singularization, field renames, no-overwrite |
| `test/import-file.test.ts` | 4 new tests: titleMap relation resolution, Notion path cleaning, no-titleMap passthrough, field rename + resolve |
| `test/normalize.test.ts` | 35 tests for utility functions (unchanged) |

**Removed:** `src/commands/normalize.ts` (standalone CLI command), `docs/guides/normalize.md`

**Acceptance:** ✅
- `gbrain import` produces clean data automatically ✅
- Type singularization in every `parseMarkdown()` call ✅
- Field renames in every `parseMarkdown()` call ✅
- Display-name resolution during directory import (with title map) ✅
- Notion path cleaning during import ✅
- `bun test` passes (652 tests, 0 failures) ✅
- No standalone `normalize` command ✅

---

### Slice 3b — Frontmatter → Links Table ⬅ NEXT

**Depends on:** Slice 3b-pre ✅ (import pipeline now produces slug paths in relations)

**Goal:** `gbrain sync` and `gbrain import` populate the `links` table from
frontmatter relation arrays. Known relation keys (`assigned_*`, `related_*`,
`parent`, `organizations`, `people`, `delegate`, `manager`, `supers`, `subs`)
are parsed into typed links.

**Files changed:**

| File | Change |
|------|--------|
| `src/core/import-file.ts` | After parsing frontmatter, extract relation keys → upsert links |
| `src/core/markdown.ts` or new `src/core/relations.ts` | Relation key → link_type mapping, extraction logic |
| `test/import-file.test.ts` | Tests: frontmatter with relations produces correct links |

**Acceptance:**
- Import a page with `assigned_projects: [projects/foo]` → links table has `assigned_project` link
- Import a page with `parent: aors/bar` → links table has `parent_aor` link
- Existing pages without relations still import correctly
- `bun test` passes

### Slice 3c — Relationships Zone Generation

**Goal:** `gbrain sync` regenerates the relationships zone in the markdown file
from frontmatter relation arrays. Titles are resolved from the database or target
file frontmatter. The zone is placed between two `---` separators.

**Files changed:**

| File | Change |
|------|--------|
| `src/core/markdown.ts` or new `src/core/relations.ts` | `renderRelationshipsZone()` — frontmatter → markdown links |
| `src/commands/sync.ts` | After import, write back file with regenerated relationships zone |
| `src/core/import-file.ts` | Support writing relationships zone on import |
| `test/markdown.test.ts` | Tests: relationships rendering, title resolution, roundtrip |

**Acceptance:**
- Page with `related_people: [people/joe-landers]` gets relationships zone with `[Joe Landers](people/joe-landers.md)`
- Page with no relations gets no relationships zone (two-zone format)
- Sync writes back to file, git diff shows the generated zone
- `bun test` passes

### Slice 3d — Reverse-Link Reconstruction

**Goal:** Post-import pass that reconstructs missing reverse relations. If Task A
has `assigned_projects: [projects/x]`, then Project X gets `tasks: [tasks/a]` added
to its frontmatter.

**Files changed:**

| File | Change |
|------|--------|
| `src/core/relations.ts` (or similar) | `reconstructReverseLinks()` — iterate pages, build reverse index, patch frontmatter |
| `src/commands/sync.ts` or `src/commands/import.ts` | Call reverse-link reconstruction after import |
| `test/` (new or existing) | Tests: one-sided relation → both sides populated |

**Acceptance:**
- Import one-sided Notion data → both sides have relations in frontmatter
- Reverse reconstruction is idempotent (running twice doesn't duplicate)
- `bun test` passes

### Slice 3e — Documentation + E2E Validation

**Goal:** All docs reflect four-zone structure. E2E tests validate the full pipeline.

**Files changed:**

| File | Change |
|------|--------|
| `docs/guides/compiled-truth.md` | Update to four-zone structure |
| `docs/GBRAIN_RECOMMENDED_SCHEMA.md` | Page templates show four zones |
| `skills/_brain-filing-rules.md` | Note about relationships zone |
| `skills/migrate/SKILL.md` | Notion one-sided export caveat, reverse reconstruction |
| `README.md` | Update knowledge model example to four zones |
| `CLAUDE.md` | Update architecture description |
| E2E tests | Full sync roundtrip with relations |

**Acceptance:**
- All docs show four-zone structure
- E2E: import → sync → verify relationships zone + links table
- `bun test` and `bun run test:e2e` pass

---

## Sequencing Summary

```
Phase 1 — gbrain-alt, branch: internal-adaptation ✅ DONE
──────────────────────────────────────────────────
Slice 1a  ─── Core code + unit tests ──────────────── ✅
Slice 1b  ─── Remaining tests + benchmark ─────────── ✅
Slice 1c  ─── Documentation ───────────────────────── ✅
          ─── E2E validation pass ──────────────────── ✅

Phase 2 — ralph-brain worktree + gbrain-alt ✅ DONE (POC complete)
──────────────────────────────────────────────────
Slice 2a  ─── Local-first config ──────────────────── ✅
Slice 2b  ─── Notion import POC ───────────────────── ✅ (ran by user)
                                                        ↓
            Gaps identified ───────────────────────── feed into Phase 3

Phase 3 — gbrain-alt, branch: internal-adaptation ⬅ CURRENT
──────────────────────────────────────────────────
Slice 3a      ─── Three-zone parser ─────────────────── ✅
  │
Slice 3b-pre  ─── Notion import data quality fixup ─── ✅
  │
Slice 3b      ─── Frontmatter → links table ────────── ⬅ NEXT
  │
Slice 3c      ─── Relationships zone generation ─────── 
  │
Slice 3d      ─── Reverse-link reconstruction ───────── 
  │
Slice 3e      ─── Documentation + E2E validation ───── 
```

Each step leaves the codebase green. Each commit is independently useful.
Phase 2 validated Phase 1. Phase 3 fixes gaps discovered during Phase 2.

---

## Risk Register

| Risk | Status | Mitigation |
|------|--------|-----------|
| Old type references in files not covered by audit | ✅ Resolved | Post-Slice-1c grep sweep found zero hits. |
| Benchmark search quality regresses with new types | ✅ Resolved | Benchmark ran clean. Search is type-agnostic. |
| Notion export truncates long page titles | **Active** | Migrate skill updated to warn. Agent should match on full title from page content, not filename. |
| Slug collisions from duplicate Notion pages | **Active** | Migrate skill updated to investigate before appending `-2`. |
| PGLite single-writer lock contention | **Active** | Don't run concurrent gbrain commands. Future: add warning or queue. |
| `gbrain list` caps at 50, `-n` flag ignored | **Active** | Needs tool fix in gbrain-alt. Not yet filed as separate issue. |
| Global config/DB prevents per-project isolation | ✅ Resolved | Local-first config (Slice 2a) implemented. Walk-up discovery + `--global` flag. |
| Notion exports one-sided relations | ✅ Designed | Reverse-link reconstruction post-pass (Slice 3d). Not Notion-specific. |
| Relations not navigable in markdown viewers | ✅ Designed | Four-zone structure with generated relationships zone (Slice 3c). |
| Sync writes back to user files (new behavior) | **Active** | Users must understand relationships zone is generated. Git diff shows changes. |
| Pages with literal `---` in compiled truth | **Active** | `splitBody()` splits on first `---`. Workaround: use `***` or `___` for horizontal rules in content. |
| Notion migrate produces plural type values | ✅ Resolved (3b-pre) | `parseMarkdown()` singularizes via `normalizeType()` on every parse. |
| Relations store display names not slug paths | ✅ Resolved (3b-pre) | `runImport()` pre-scans titles, `importFromContent()` resolves via `titleMap`. |
| `_events` field uses wrong name | ✅ Resolved (3b-pre) | `parseMarkdown()` renames via `FIELD_RENAMES` map. |
| Raw Notion paths in compiled truth | ✅ Resolved (3b-pre) | `importFromContent()` cleans via `normalizeBody()` when `titleMap` provided. |
| `parent_page` instead of `parent` | ✅ Resolved (3b-pre) | `parseMarkdown()` renames via `FIELD_RENAMES` map. |
| Publish command won't strip relationships zone | **Active (3e)** | `makeShareable()` regex only matches `## Timeline`, not `## Relationships`. Fix when Slice 3c generates the zone. |
| Existing pages with multiple `---` reinterpreted | **Active** | Three-zone parser treats middle section as relationships. Pages with extra `---` in their timeline will have that content moved to relationships zone. Mitigation: only pages explicitly given a relationships zone via sync will have two separators. Existing two-zone pages are backwards compatible. |

---

## Out of Scope (per spec §7)

- Inheritance automation (imported as-is from Notion)
- Notion bidirectional sync
- Obsidian view layer
- Orchestrator / collectors
- Cross-source entity resolution
- Dream cycle
