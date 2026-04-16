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

### Slice 1c — Documentation

**Goal:** All documentation references the new taxonomy. No Garry Tan-specific
type references remain outside of CHANGELOG.md historical entries.

**Files changed:**

| File | Change | Lines |
|------|--------|-------|
| `docs/GBRAIN_RECOMMENDED_SCHEMA.md` | Replace all old type/directory references with new taxonomy. Update directory structure diagram, decision tree, page templates, and examples. Keep all non-taxonomy content (enrichment pipeline, cron architecture, compiled truth pattern, etc.) intact. | ~200 |
| `skills/_brain-filing-rules.md` | Update filing rules: new directories, new resolver order per spec §2.10 | ~40 |
| `README.md` | Update type list in schema table, code examples (`concepts/` → `resources/`), architecture description. Replace `company` with `organization` in narrative. | ~30 |
| `CLAUDE.md` | Update type list in "Database schema" section and any type references in key files descriptions | ~10 |
| `skills/migrate/SKILL.md` | Update Notion migration section to reference new taxonomy and frontmatter schemas | ~15 |

**Acceptance:**
- `grep -rn` for old type names (`deal`, `yc`, `civic`, `concept`, `source`,
  `media` as page types) finds zero hits outside CHANGELOG.md
- Documentation decision tree matches spec §2.10
- README examples use `resources/` not `concepts/`

**Commit message pattern:** `docs: update all documentation to PARA+GTD taxonomy`

---

### Slice 1 — E2E Validation

After all three sub-slices are committed, run the full E2E test lifecycle
(spin up pgvector container, run `bun run test:e2e`, tear down) to confirm
nothing is broken at the integration level. The E2E tests create pages and
filter by type — since this is a fresh DB (no pre-existing data with old types),
the only concern is that test fixtures themselves use the new types consistently.
Fix any issues, commit, push.

---

## Phase 2: Notion Import POC

**Workspace:** `ralph-brain` worktree (alongside `ralph-pva`, same parent folder).
The user creates this worktree and does the Notion export. No new Notion-specific
code goes into gbrain-alt.

### Slice 2 — Install + Notion Import Test

**Goal:** Install the updated gbrain (with PARA+GTD taxonomy from Phase 1) into
`ralph-brain`, export from Notion, and run the existing migrate skill to validate
end-to-end import. No new Notion-specific code in gbrain-alt.

**Steps:**
1. Install gbrain from the `internal-adaptation` branch into `ralph-brain`:
   `cd <ralph-brain> && bun add <path-to-gbrain-alt>`
   (or `bun link` from gbrain-alt, then `bun link gbrain` in ralph-brain)
2. `gbrain init` (PGLite)
3. Create the 9 entity directories per spec §2.6:
   `contexts/ aors/ projects/ tasks/ events/ resources/ interests/ people/ organizations/`
4. `gbrain doctor` — confirm clean
5. Export from Notion UI (Markdown & CSV format)
6. Run the migrate skill against the Notion export directory
7. `gbrain import <export-dir> --no-embed` then `gbrain embed --stale`
8. Validate: `gbrain search`, `gbrain graph`, inspect imported pages

**Acceptance:**
- `gbrain --version` works in `ralph-brain`
- `gbrain doctor` passes
- 9 entity directories exist
- Notion pages import with correct types via `inferType()`
- Properties map to frontmatter, relations map to links
- `gbrain search` returns meaningful results across imported data
- `gbrain graph` traverses relationships

**What comes back to gbrain-alt:** Any tool-level gaps discovered during import
get fixed on `internal-adaptation` as targeted slices, scoped by whatever
actually breaks. The goal is minimal drift from upstream.

---

## Sequencing Summary

```
Phase 1 — gbrain-alt, branch: internal-adaptation
──────────────────────────────────────────────────
Slice 1a  ─── Core code + unit tests ──────────────── commit
  │
Slice 1b  ─── Remaining tests + benchmark ─────────── commit
  │
Slice 1c  ─── Documentation ───────────────────────── commit
  │
          ─── E2E validation pass ──────────────────── fix + commit if needed

Phase 2 — ralph-brain worktree (alongside ralph-pva)
──────────────────────────────────────────────────
Slice 2   ─── Install updated gbrain + handoff ─────── notify user
                                                        ↓
            User tests Notion import ──────────────── gaps feed back
                                                        ↓
            Fix gaps on internal-adaptation ────────── commit as needed
```

Each step leaves the codebase green. Each commit is independently useful.
Phase 2 validates Phase 1. Gaps discovered by the user are fixed in Phase 1's repo.

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Old type references in files not covered by audit | Post-Slice-1c grep sweep catches stragglers. Acceptance criteria includes zero-hit check. |
| Benchmark search quality regresses with new types | Benchmark page content stays the same; only `type` field values change. Search is type-agnostic. Compare scores before/after. |
| Migrate skill can't infer new type from Notion export directory names | Fix `inferType()` in gbrain-alt if needed. Notion exports nest by database name, which may not match our directory convention. |
| Frontmatter properties not preserved through import | The generic import pipeline reads YAML frontmatter as-is. If Notion export doesn't produce YAML frontmatter, that's a gap the user will discover and report back. |

---

## Out of Scope (per spec §7)

- Inheritance automation (imported as-is from Notion)
- Notion bidirectional sync
- Obsidian view layer
- Orchestrator / collectors
- Cross-source entity resolution
- Dream cycle
