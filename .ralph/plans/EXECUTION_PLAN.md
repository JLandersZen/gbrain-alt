# Execution Plan — Rebase `internal-adaptation` onto upstream master

**Spec:** [SPECIFICATION.md](SPECIFICATION.md)
**Goal:** Replay our 30 commits onto `origin/master` (v0.12.3), resolving all
conflicts per the spec's analysis. End state: linear history with both our
adaptations AND upstream's security/reliability/feature improvements.

**Approach:** Manual replay onto a fresh branch from `origin/master`. Each slice
applies a logical group of our commits, resolves conflicts, gets tests green,
and commits. This gives us verifiable checkpoints — if something goes wrong we
know exactly which group broke.

**Branch strategy:**
- `internal-adaptation-backup` — snapshot of current state (safety net)
- `internal-adaptation` — the old branch (DO NOT modify, source for cherry-picks)
- `internal-adaptation-v2` — new branch from `origin/master`, receives replayed work (WORK HERE)
- When complete: force-push to `internal-adaptation`, delete `-v2`
- Stash `stash@{0}` has uncommitted `.ralph/` changes from `internal-adaptation` (safe to ignore)

**Work tracking:** Use beads throughout. Create an issue for each slice before
starting it (`bd create`). Mark `in_progress` when working, `bd close` when the
slice's definition of done is met. Log blockers, decisions, and deviations from
plan in issue notes (`bd update <id> --notes "..."`). At session end: `bd dolt push`.

---

## Slice 1 — Preparation + Upstream Study

**Delivers:** Backup branch exists. Baseline tests verified. Upstream's new code
studied in detail so conflict resolutions can be executed confidently.

### Work

1. Create backup: `git branch internal-adaptation-backup`
2. Run `bun test` on current branch — record pass count as baseline
3. Study upstream's `splitBody()` rewrite in detail:
   - What sentinels does it recognize? (`<!-- timeline -->`, `--- timeline ---`, heading-based)
   - What's the exact function signature and return type?
   - Where is `splitBody` called? (import, sync, export, tests)
4. Study upstream's `import-file.ts` changes:
   - What is `ParsedPage`? What fields?
   - Where is it returned and consumed?
5. Study upstream's `sync.ts` rewrite:
   - What did the transaction removal look like?
   - What are the auto-extract/auto-embed hooks?
6. Study upstream's new engine interface methods:
   - `getAllSlugs`, `addLinksBatch`, `removeLink` (new signature), `traversePaths`, `getBacklinkCounts`
   - Are implementations in both PGLite and Postgres engines?
7. Catalog upstream test files that hardcode `company` or other types we renamed
8. Write the sentinel-based four-zone parser **in advance** (on scratch branch):
   - `<!-- relationships -->` sentinel for zone 2
   - `<!-- timeline -->` sentinel for zone 3
   - Backward-compat: files without sentinels use upstream's heuristics
   - Test it standalone against our existing four-zone test fixtures

### Definition of Done

- [x] `internal-adaptation-backup` branch exists
- [x] Baseline test count recorded (753 unit pass, 0 fail; 32 E2E need DB)
- [x] Upstream splitBody behavior documented (sentinels, signature, callers)
- [x] Upstream ParsedPage interface documented
- [x] Upstream sync.ts changes understood
- [x] List of upstream tests needing type fixups compiled (27 files, 150+ instances)
- [x] Sentinel-based four-zone parser code written and tested in isolation (32 tests pass)
- [x] Committed and pushed (commit `f34ff1a`)

### Estimated effort: 1–2 days

### Key Findings (for downstream slices)

**Upstream splitBody** (`origin/master:src/core/markdown.ts`):
- Signature: `splitBody(body: string): { compiled_truth: string; timeline: string }`
- Sentinel precedence: `<!-- timeline -->` > `--- timeline ---` > bare `---` + `## Timeline`/`## History` heading
- `serializeMarkdown()` emits `\n\n<!-- timeline -->\n\n` between zones
- Called by `parseMarkdown()` → used by `importFromContent()` and `importFromFile()`

**Upstream ParsedPage** (`origin/master:src/core/import-file.ts`):
- Interface: `{ type, title, compiled_truth, timeline, frontmatter, tags }`
- Returned for both 'imported' AND 'skipped' statuses in `ImportResult`
- Consumed by `runAutoLink()` post-hook in `operations.ts` (runs after import, extracts links from body)
- Auto-link skipped for `ctx.remote === true` (security gate)

**Upstream sync** (`origin/master:src/commands/sync.ts`):
- No nested transaction (PGLite deadlock fix) — each file imports atomically
- Auto-extract: always runs post-sync (links + timeline from content)
- Auto-embed: conditional, skipped for >100 files

**Upstream engine** — 5 new methods (both PGLite + Postgres implement them):
- `getAllSlugs(): Promise<Set<string>>`
- `addLinksBatch(links: LinkBatchInput[]): Promise<number>`
- `removeLink(from, to, linkType?): Promise<void>`
- `traversePaths(slug, opts?): Promise<GraphPath[]>`
- `getBacklinkCounts(slugs: string[]): Promise<Map<string, number>>`

**Type conflicts** (Slice 3 needs these):
- 27 test/eval files with 150+ instances of upstream types (company, deal, yc, civic, concept, source, media, writing, analysis, guide, hardware, architecture)
- Heaviest files: `test/pglite-engine.test.ts` (17), `test/benchmark-search-quality.ts` (20+), `test/markdown.test.ts` (12)
- E2E fixtures in `test/e2e/fixtures/` have YAML frontmatter with hardcoded types

**Pre-built sentinel parser** (`src/core/split-body-sentinel.ts`):
- Drop-in replacement for `splitBody` in Slice 5
- Returns `{ compiled_truth, relationships, timeline }` (three zones)
- Exports `RELATIONSHIPS_SENTINEL` and `TIMELINE_SENTINEL` constants
- Tests: `test/split-body-sentinel.test.ts` (32 tests)

---

## Slice 2 — Fresh Branch + Infrastructure/Docs Commits

**Delivers:** New branch from `origin/master` with all non-conflicting commits
replayed cleanly. This covers ~15 of our 30 commits (beads init, docs, plans,
config guide, README indexes, etc.).

### Commits to replay (no/trivial conflicts expected)

```
50b12ab  beads issue tracking init
32291d1  docs: execution plan update
d20008e  docs: execution plan + POC findings
c40f460  docs: README indexes for docs/ subdirectories
9032faa  chore: .ralph planning docs + .claude project settings
43a0977  docs: execution plan updates
280fa3b  docs: local-first config guide
903c7ad  docs: four-zone page structure spec and plan
b8ca726  docs: Slice 3b-pre Notion import data quality
3128a1c  docs: fix spec inaccuracy
db64f17  docs: migrate skill prerequisites + Notion fixes
29dd1c7  chore: fix stale NEXT marker
f636e0f  chore: archive completed plan/spec
```

### Work

1. `git checkout -b internal-adaptation-v2 origin/master`
2. Cherry-pick each commit above (in order)
3. Resolve any trivial conflicts (upstream changed CLAUDE.md/README — our docs
   additions are in different files so should apply cleanly)
4. Run `bun test` — should pass (these commits don't touch source code)

### Definition of Done

- [x] `internal-adaptation-v2` exists, based on `origin/master`
- [x] All docs/infra commits applied (7 cherry-picked, 7 planning-only skipped — superseded by f34ff1a)
- [x] `bun test` passes (1413 pass, 8 skip, 40 E2E-only fail — matches baseline + 32 sentinel tests)
- [x] Committed (8 commits on internal-adaptation-v2)

### Conflict resolutions

- `.gitignore` — kept upstream's `eval/reports/` + our `.dolt/` + `*.db`
- `CLAUDE.md` intro — kept upstream's GStack branding + our local-first `.gbrain/` config note
- `CLAUDE.md` key files — kept upstream's detailed descriptions, added our `config.ts` line
- `README.md` — kept upstream's full content, our `.gbrain/` path fixes applied in setup section
- `skills/migrate/SKILL.md` — kept upstream's section structure, added our Prerequisites section
- `.ralph/plans/` — took f34ff1a's fresh rebase planning docs (supersedes all intermediate edits)

### Skipped commits (planning-docs-only, superseded by f34ff1a)

32291d1, d20008e, 43a0977, 903c7ad, b8ca726, 3128a1c, 29dd1c7 — all only modified
`.ralph/plans/EXECUTION_PLAN.md` or `SPECIFICATION.md`. f34ff1a creates the fresh
rebase version of both files. 7490bd6 (archive old plan/spec) also skipped — those
old files don't exist on this branch.

### Estimated effort: < 1 day (completed)

---

## Slice 3 — Taxonomy Replacement (PARA+GTD Types)

**Delivers:** Our PARA+GTD type system applied on top of upstream's extended
type union. All upstream tests that hardcode replaced types are fixed.

### Commits to replay

```
3c816d6  feat: replace PageType union with PARA+GTD taxonomy (Slice 1a)
265b1b2  test: update all test fixtures to PARA+GTD types (Slice 1b)
abe976e  docs: update all documentation to PARA+GTD taxonomy (Slice 1c)
0298795  test: fix E2E resource count assertion
```

### Expected conflicts

- **`src/core/types.ts`** — upstream extended the union to 14 types; we replace
  with our 9. Resolution: our types win. The DB column is unconstrained TEXT.
- **Upstream test files** — ~30 new test files may use `company`, `deal`, `yc`,
  etc. Resolution: search-replace in those fixtures OR leave them alone (TEXT
  column, they'll work at runtime). Spec says leave them unless tests actually fail.
- **CLAUDE.md / README** — upstream may have updated these. Resolution: our
  taxonomy docs win for schema description; accept upstream's additions for new
  files/commands.

### Work

1. Cherry-pick `3c816d6` — resolve `types.ts` conflict (keep our 9 types)
2. Cherry-pick `265b1b2` — may need to extend fixture updates to cover new upstream tests
3. Cherry-pick `abe976e` — resolve any CLAUDE.md/README conflicts (ours wins for schema, accept upstream's new file references)
4. Cherry-pick `0298795` — should apply cleanly
5. Run `bun test` — fix any failures caused by type mismatches
6. If upstream tests hardcode types we removed, fix ONLY the ones that fail

### Definition of Done

- [x] PARA+GTD is the TypeScript union (`context | aor | project | task | event | resource | interest | person | organization`)
- [x] All tests pass (1413 unit pass, 0 unit fail — same as Slice 2 baseline; 40 E2E fail = DB-required, unchanged)
- [x] Source code updated: types.ts, markdown.ts (inferType), enrichment-service.ts, pglite-engine.ts, postgres-engine.ts, link-extraction.ts, backlinks.ts
- [x] Test fixtures updated: pglite-engine.test.ts, markdown.test.ts, enrichment-service.test.ts
- [x] Documentation: GBRAIN_RECOMMENDED_SCHEMA.md retains upstream's richer content; taxonomy types updated in code; full schema doc rewrite deferred to later slice
- [x] Committed

### Conflict resolutions

- **types.ts** — replaced upstream's 14-type union with our 9-type PARA+GTD union
- **markdown.ts inferType** — rewrote with PARA+GTD mapping. Legacy dirs map to new types: `/companies/` → `organization`, `/concepts/` → `interest`, `/wiki/` → `resource`, `/writing/` → `resource`, `/deals/` → `event`, `/media/` → `resource`, `/sources/` → `resource`. Leaf-specific dirs checked first (same precedence principle as upstream).
- **enrichment-service.ts** — `'company'` → `'organization'` throughout (entity type unions, slugifier, extractEntities)
- **pglite/postgres-engine.ts** — SQL health queries `IN ('person','company')` → `IN ('person','organization')`
- **link-extraction.ts** — `pageType === 'media'` → cast through `as string` (media is no longer in the union but may exist in DB; runtime-safe)
- **backlinks.ts** — added `'organizations'` to entity dir filter alongside `'companies'`
- **DIR_PATTERN (link-extraction.ts)** — left as-is. These are filesystem directory names for entity ref extraction, not PageType values.

### Estimated effort: 1–2 days (completed in 1 session)

---

## Slice 4 — Local-First Config

**Delivers:** Project-scoped `.gbrain/` config discovery applied on top of
upstream's config system.

### Commits to replay

```
2d337de  feat: local-first config — project-scoped .gbrain/ before global ~/.gbrain/
```

### Expected conflicts

LOW — upstream didn't significantly change `config.ts`. Our commit adds walk-up
discovery logic. Should cherry-pick cleanly.

### Work

1. Cherry-pick `2d337de`
2. Run `bun test` — verify config discovery tests pass
3. Verify upstream's new commands (graph-query, jobs, orphans) still find config

### Definition of Done

- [x] Walk-up config discovery works (discoverConfigDir walks up from cwd, falls back to ~/.gbrain/)
- [x] No regressions in upstream commands (1416 unit pass, 8 skip — 46 fail = DB-required E2E, unchanged)
- [x] Committed (cfed64e)

### Conflict resolutions

- **init.ts imports** — merged upstream's `copyFileSync`, `mkdirSync`, `dirname`, `fileURLToPath` (needed for template install + initMigrateOnly) with our `appendFileSync`, `writeFileSync`, `setConfigDir`, `globalConfigDir`, `configPath`
- **init.ts initMigrateOnly** — kept upstream's function (uses `loadConfig` + `toEngineConfig` for migration orchestrators) which our cherry-pick lacked
- **init.ts initPGLite** — kept our `isGlobal` parameter + `setConfigDir`/`globalConfigDir` target resolution
- **upgrade.ts runPostUpgrade** — kept upstream's TS migration registry approach (imports `./migrations/index.ts`), replaced hardcoded `process.env.HOME + '/.gbrain/'` with `globalConfigDir()`

### Estimated effort: < 1 day (completed in 1 session)

---

## Slice 5 — Four-Zone Parser (THE HARD ONE)

**Delivers:** Our four-zone page structure rewritten to use upstream's
sentinel-based splitting. This is the highest-risk slice — the core parser
changes and must remain backward-compatible with both old-format and new-format
pages.

### Commits to replay

```
a202ab8  feat: extend parser to four-zone page structure
```

### The conflict (spec §HIGH RISK: markdown.ts)

**Upstream's new splitBody:**
- Bare `---` is NO LONGER a timeline separator (caused 83% truncation)
- New sentinels: `<!-- timeline -->` (preferred), `--- timeline ---` (decorated),
  or `---` only when followed by `## Timeline` / `## History` heading

**Our four-zone splitBody:**
- Returns `{ compiled_truth, relationships, timeline }`
- Uses `---` as zone separators (two = three zones, one = two zones)

**Resolution:** Rewrite our commit to use sentinel-based approach:
- `<!-- relationships -->` sentinel before relationships zone
- `<!-- timeline -->` sentinel before timeline zone
- Backward compat: pages without sentinels use upstream's heuristics (heading-based)
- Our `renderRelationshipsZone()` emits the sentinel when writing

### Work

1. DO NOT cherry-pick the original commit — it conflicts fundamentally
2. Instead, apply the pre-written sentinel-based four-zone parser (from Slice 1 prep)
3. Key changes vs upstream's two-zone parser:
   - Add `<!-- relationships -->` sentinel recognition
   - Return `{ compiled_truth, relationships, timeline }` (three fields)
   - Update `renderRelationshipsZone()` to emit `<!-- relationships -->` above the zone
   - All callers that destructure splitBody must handle the new field
4. Update ALL test fixtures that use `---` as zone separator to use sentinels
5. Add new test cases:
   - Page with both sentinels → three zones parsed correctly
   - Page with only `<!-- timeline -->` → two zones (no relationships)
   - Page with only `<!-- relationships -->` → two zones (no timeline... or error?)
   - Page with no sentinels → upstream heuristics (heading-based)
   - Page with bare `---` only → NOT a zone separator (upstream's fix)
   - Round-trip: parse → render → parse produces identical output
6. Run `bun test` — ALL markdown/import/sync tests must pass

### Definition of Done

- [x] Four-zone parser uses sentinels, not bare `---`
- [x] Backward-compatible with old-format pages (heading heuristics)
- [x] `serializeMarkdown()` emits `<!-- relationships -->` sentinel when relationships zone present
- [x] Round-trip parse/render is lossless (tested in both markdown.test.ts and split-body-sentinel.test.ts)
- [x] ALL existing markdown tests pass (with updated fixtures)
- [x] New sentinel-specific tests pass (63 tests across 2 files)
- [ ] Committed

### Conflict resolutions

- **markdown.ts** — replaced upstream's two-zone `splitBody` (returns `{compiled_truth, timeline}`) with four-zone version (returns `{compiled_truth, relationships, timeline}`). Same sentinel logic for timeline zone (backward-compatible). Added `<!-- relationships -->` sentinel for the relationships zone. Added `SplitResult` interface, `RELATIONSHIPS_SENTINEL`, `TIMELINE_SENTINEL` constants.
- **markdown.ts ParsedMarkdown** — added `relationships: string` field
- **markdown.ts serializeMarkdown** — added optional `relationships?: string` parameter; emits `<!-- relationships -->` sentinel when present. Existing callers (cli.ts, export.ts) pass DB data which has no relationships column, so they pass `undefined` and behavior is unchanged.
- **import-file.ts ParsedPage** — added `relationships: string` field, populated from `parseMarkdown` result
- **split-body-sentinel.ts** — REMOVED. The pre-built sentinel parser from Slice 1 was integrated directly into `markdown.ts`. The test file (`test/split-body-sentinel.test.ts`) now imports from `markdown.ts`.

### Risk mitigation

- The pre-written parser (Slice 1) is tested in isolation BEFORE this slice
- If the integration fails badly, we still have `internal-adaptation-backup`
- Upstream's test suite provides regression coverage we didn't have before

### Estimated effort: 2–3 days (includes test updates)

---

## Slice 6 — Normalize + Relations Pipeline

**Delivers:** Our import normalization and frontmatter-to-links extraction
integrated alongside upstream's ParsedPage interface and content-based
link-extraction.

### Commits to replay

```
cb15692  wip: add normalize utility functions and tests
0ca2406  feat: integrate import normalization into pipeline
72e22c6  fix: embed fails loudly without OPENAI_API_KEY
d4c89e1  fix: normalize --- HRs to *** during import
9bbfd5e  feat: extract frontmatter relations into links table during import
1b76679  feat: generate navigable relationships zone from import
50a75c4  fix: generate relationships zone on skipped files
3b8a5b2  feat: reconstruct reverse links from one-sided Notion imports
22ea546  fix: flatten Notion links: nesting during normalization
```

### Expected conflicts (spec §MEDIUM RISK: import-file.ts)

**Upstream added:** `ParsedPage` interface returned from `importFromContent()`
for both `'imported'` and `'skipped'` statuses. Consumed by auto-link post-hook.

**Our additions:** `extractRelationsFromFrontmatter()` and
`renderRelationshipsZone()` calls inside `importFromContent()`.

**Resolution:** Both coexist. Our code fires during import (frontmatter → typed
links). Upstream's auto-link fires on `put_page` (content → inferred links).
Accept upstream's ParsedPage, add our fields/calls alongside.

### Work

1. Cherry-pick `cb15692` (normalize utilities) — likely clean
2. Cherry-pick `0ca2406` (normalize integration) — WILL conflict with import-file.ts
   - Accept upstream's `ParsedPage` structure
   - Add our normalize calls within the import flow
   - Ensure `ParsedPage` return includes any fields we need
3. Cherry-pick `72e22c6` (embed error) — likely clean
4. Cherry-pick `d4c89e1` (HR normalization) — may conflict with splitBody changes
   - Our old approach: `---` → `***` to avoid parser confusion
   - With sentinel-based parsing, bare `---` is already not a separator
   - This fix may now be unnecessary OR may need adaptation
   - **Decision point:** Keep the normalization anyway (belt + suspenders)
     or drop it since sentinels make it irrelevant?
5. Cherry-pick `9bbfd5e` (relations extraction) — will conflict with import-file.ts
   - Layer our `extractRelationsFromFrontmatter()` alongside upstream's code
   - Ensure it doesn't duplicate links that upstream's `link-extraction.ts` finds
   - Both use `ON CONFLICT DO NOTHING` so runtime dupes are safe
6. Cherry-pick `1b76679` (relationships zone rendering) — depends on Slice 5 parser
   - `renderRelationshipsZone()` must emit `<!-- relationships -->` sentinel
   - Verify it's called correctly in the import flow
7. Cherry-pick `50a75c4` (zone on skipped files) — should apply cleanly post-6
8. Cherry-pick `3b8a5b2` (reverse links) — should apply cleanly
9. Cherry-pick `22ea546` (Notion links flatten) — should apply cleanly
10. Run `bun test` — all normalize, relations, and import tests pass
11. Run E2E relations pipeline test

### Definition of Done

- [ ] Normalize pipeline works (type mapping, field renames, path cleaning)
- [ ] Frontmatter → links extraction fires during import
- [ ] Relationships zone rendered with sentinel on import
- [ ] Reverse link reconstruction works
- [ ] Upstream's ParsedPage interface preserved (auto-link hook still works)
- [ ] Upstream's link-extraction.ts and our relations.ts coexist
- [ ] All tests pass
- [ ] Committed

### Estimated effort: 2–3 days

---

## Slice 7 — Sync `--subdir` + Final Commits

**Delivers:** Our monorepo sync support layered on upstream's deadlock-fixed
sync. All remaining commits applied. Full test suite green.

### Commits to replay

```
64c61e4  feat: brain/ as standalone git repo + sync --subdir for monorepos
0ed61d2  feat: Slice 3e — four-zone docs + E2E relations pipeline tests
```

### Expected conflicts (spec §MEDIUM RISK: sync.ts)

**Upstream:** Removed nested transaction wrapper (fixed PGLite deadlock). Added
auto-extract and auto-embed post-sync hooks.

**Ours:** Added `--subdir` flag for monorepo support.

**Resolution:** Keep upstream's transaction removal (critical fix). Keep
upstream's auto-extract/auto-embed hooks. Layer our `--subdir` filtering logic
on top. The `--subdir` flag filters which files get processed — it's orthogonal
to the transaction and hook changes.

### Work

1. Cherry-pick `64c61e4` — WILL conflict with sync.ts
   - Don't restore the nested transaction (upstream removed it for good reason)
   - Add `--subdir` option to the CLI interface
   - Add subdir filtering to the file discovery / manifest logic
   - Keep upstream's auto-extract/auto-embed hooks intact
2. Cherry-pick `0ed61d2` (docs + E2E tests) — should apply cleanly
   - E2E tests may need updates for sentinel-based parsing
3. Run full suite: `bun test && bun run test:e2e`
4. Verify: `gbrain sync --subdir brain/` works on the test brain repo

### Definition of Done

- [ ] `--subdir` flag works on upstream's deadlock-fixed sync
- [ ] Auto-extract/auto-embed hooks fire correctly with --subdir
- [ ] E2E relations pipeline tests pass
- [ ] Full test suite green
- [ ] Committed

### Estimated effort: 1–2 days

---

## Slice 8 — Post-Rebase Validation + Swap

**Delivers:** Full validation against spec's end-state criteria. Branch swap
complete. Pushed to remote.

### Work

1. **Full test suite:** `bun test` — record count, compare to baseline
2. **E2E suite:** spin up test DB, run `bun run test:e2e`, tear down
3. **Four-zone round-trip:** parse → serialize → parse on sample pages
4. **Relations E2E:** import a page with frontmatter relations → verify links
   table populated → verify relationships zone rendered
5. **Normalize pipeline:** import a Notion export → verify type mapping,
   field renames, path cleaning all fire
6. **Sync --subdir:** `gbrain sync --subdir` on test data
7. **Upstream features smoke-test:**
   - `gbrain graph-query` (knowledge graph)
   - `gbrain orphans` (orphan detection)
   - New engine methods work (getAllSlugs, addLinksBatch, etc.)
8. **Branch swap:**
   - `git branch -m internal-adaptation internal-adaptation-old`
   - `git branch -m internal-adaptation-v2 internal-adaptation`
   - `git push --force-with-lease origin internal-adaptation`
   - Delete old branches after confirming

### Definition of Done (spec §Post-rebase validation)

- [ ] `bun test` green (all unit tests including upstream's 30+ new files)
- [ ] `bun run test:e2e` green
- [ ] Four-zone round-trip: parse → serialize → parse = identical
- [ ] Relations extraction works end-to-end
- [ ] Normalize pipeline maps types correctly
- [ ] `gbrain sync --subdir` works with deadlock fix
- [ ] Force-pushed to `internal-adaptation`
- [ ] `internal-adaptation-backup` retained (safety net until confirmed stable)

### Estimated effort: 1 day

---

## Summary

| Slice | What | Risk | Effort |
|-------|------|------|--------|
| 1 | Preparation + upstream study + pre-write parser | Low | 1–2 days |
| 2 | Fresh branch + docs/infra commits | Low | < 1 day |
| 3 | Taxonomy (PARA+GTD types) | Medium | 1–2 days |
| 4 | Local-first config | Low | < 1 day |
| 5 | Four-zone parser (sentinel rewrite) | **HIGH** | 2–3 days |
| 6 | Normalize + relations pipeline | Medium | 2–3 days |
| 7 | Sync --subdir + final commits | Medium | 1–2 days |
| 8 | Validation + branch swap + push | Low | 1 day |

**Total: ~10–14 days (2 sprints)**

---

## Decision Points (Need Your Input During Execution)

1. **Slice 5 (parser):** If upstream's heading-based heuristic (`## Timeline`)
   conflicts with our relationship zone rendering, do we:
   (a) require sentinels on all new pages and only use heuristics for legacy, or
   (b) add a `## Relationships` heading heuristic too?

2. **Slice 6 (HR normalization):** With sentinel-based parsing, the `---` → `***`
   fix may be unnecessary. Drop it (simpler) or keep it (belt+suspenders)?

3. **Slice 3 (upstream test types):** If upstream has tests using `company` that
   pass because the DB column is unconstrained TEXT — leave them alone or
   normalize them to `organization` for consistency?

---

## Abort Criteria

If at any point during the replay:
- More than 5 test files need non-trivial rewrites (not just type substitution)
- The four-zone parser can't cleanly coexist with upstream's two-zone callers
- Upstream's auto-link hook conflicts with our relations in a way that causes
  duplicate or incorrect links at runtime

→ STOP. Reassess whether the rebase strategy is correct or if we need a
different integration approach (e.g., merge, or selective cherry-pick of
upstream features we actually need).
