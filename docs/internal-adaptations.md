# Internal Adaptations

This fork customizes upstream GBrain (v0.12.3) for a corporate environment with
specific knowledge management needs. Six adaptations were applied via a clean
rebase onto `origin/master`. All upstream features (knowledge graph, minions job
queue, security fixes, reliability improvements, 26 skills, autopilot, orphan
detection) are preserved and working.

## The 6 Customizations

### 1. PARA+GTD Page Taxonomy

Upstream ships 14 domain-specific page types (`company`, `deal`, `yc`, `civic`,
etc.) tied to a specific user's brain. This fork replaces them with a 9-type
taxonomy based on the PARA and GTD frameworks, designed to work for any knowledge
domain.

| Type | Category | Purpose |
|------|----------|---------|
| `context` | PARA: Areas | Broad life/work domains (career, health, family) |
| `aor` | PARA: Areas | Narrow areas of responsibility with ongoing ownership |
| `project` | PARA: Projects | Time-bound efforts with a defined outcome |
| `task` | GTD | Single actionable items with priority levels |
| `event` | GTD | Dated occurrences (meetings, deadlines, milestones) |
| `resource` | PARA: Resources | Reference material, guides, articles, media |
| `interest` | PARA: Resources | Topics and concepts worth tracking |
| `person` | Entity | Individual people |
| `organization` | Entity | Companies, teams, institutions |

The database column is unconstrained TEXT, so both upstream and fork types coexist
at runtime. The TypeScript union and `inferType()` directory heuristics enforce
the 9-type set in code.

**Guide:** [Page Types](guides/page-types.md)

### 2. Four-Zone Page Structure

Upstream uses a two-zone page structure: compiled truth + timeline, separated by
sentinel comments (`<!-- timeline -->`). This fork extends it to four zones:
frontmatter, compiled truth, relationships, and timeline.

```markdown
---
type: person
title: Alice Chen
---

Alice is a founding partner at Sequoia Capital...

<!-- relationships -->

- **Works at:** [Sequoia Capital](organizations/sequoia-capital)
- **Invested in:** [Acme AI](organizations/acme-ai)

<!-- timeline -->

- 2024-03-15: Led Series A for Acme AI
```

The relationships zone is auto-generated from frontmatter relation fields during
import. Both sentinels (`<!-- relationships -->` and `<!-- timeline -->`) follow
upstream's sentinel-based parsing approach, so backward compatibility with pages
that lack sentinels is preserved.

**Guide:** [Four-Zone Page Structure](guides/compiled-truth.md)

### 3. Frontmatter Relations Pipeline

Upstream extracts links from markdown body content (auto-link). This fork adds a
complementary pipeline that extracts typed links from YAML frontmatter fields.

```yaml
---
type: person
title: Alice Chen
works_at: [organizations/sequoia-capital]
invested_in: [organizations/acme-ai, organizations/bolt]
---
```

The frontmatter pipeline fires during import. Upstream's auto-link fires on
`put_page`. Both use `ON CONFLICT DO NOTHING` at the database layer, so they
coexist without duplication. The frontmatter pipeline also generates the
relationships zone (see above) and reconstructs reverse links from one-sided
Notion imports.

17 relation fields are supported, each mapping to a typed link in the graph:
`works_at`, `invested_in`, `founded`, `attended`, `advises`, `board_member_of`,
`investor`, `portfolio`, `acquired`, `partner_of`, `competitor_of`,
`subsidiary_of`, `funded_by`, `advisor`, `member_of`, `collaborates_with`, and
`parent`.

**Guide:** [Relations Pipeline](guides/relations-pipeline.md)

### 4. Import Normalization

A preprocessing pipeline that cleans Notion exports before import. Handles the
systematic data quality issues that come from Notion's export format:

- **Type singularization:** `companies` → `organization`, `People` → `person`
- **Field renames:** `_events` → `related_events`, `_key_people` → `key_people`
- **Path cleaning:** strips Notion hex UUIDs from slugs
- **Display name resolution:** 3-tier lookup (frontmatter title → title map → slug)
- **Links flattening:** Notion's nested link arrays → flat string arrays

Normalization runs during `gbrain import` when a `titleMap` is provided. It
modifies files on disk (idempotent, safe to re-run).

**Guide:** [Import Normalization](guides/import-normalization.md)

### 5. Monorepo Sync (`--subdir`)

Upstream's `gbrain sync` assumes the brain is the entire git repository. This
fork adds a `--subdir` flag for monorepo setups where the brain lives in a
subdirectory.

```bash
gbrain sync --subdir brain/
```

The flag filters the sync manifest to only process files under the specified
subdirectory, strips the prefix for slug derivation, and adjusts file paths for
auto-extract hooks. It layers cleanly on upstream's deadlock-fixed sync (no
nested transactions) and preserves auto-extract/auto-embed behavior.

Can be persisted in config (`sync.subdir`) so you don't need to pass it every time.
Auto-detects a `brain/` directory if present.

**Guide:** [Monorepo Sync](guides/monorepo-sync.md)

### 6. Local-First Config Discovery

Upstream stores config in `~/.gbrain/` (global). This fork adds project-scoped
config: `gbrain init` creates a `.gbrain/` directory in the current project by
default. Config discovery walks up from the current working directory to find the
nearest `.gbrain/config.json`, falling back to `~/.gbrain/` if none is found.

This supports multiple brains (one per project) and keeps brain config alongside
the code that uses it. Use `--global` to get the old `~/.gbrain/` behavior.

**Guide:** [Local-First Config](guides/local-first-config.md)

## What's Preserved from Upstream

All upstream v0.10 through v0.12.3 features work unchanged:

- Knowledge graph with auto-link, typed relationships, graph-query
- Minions job queue (Postgres-native, BullMQ-inspired)
- Security fixes (file upload confinement, SSRF protection, recipe trust, prompt injection defense)
- Reliability improvements (sync deadlock fix, search timeout scoping, JSONB repair)
- 26 skills with resolver routing
- Orphan detection, doctor health checks, autopilot daemon
- Bidirectional engine migration (PGLite ↔ Postgres)
- Hybrid search (vector + keyword + RRF + multi-query expansion)

## Technical Approach

The adaptations were applied via a clean rebase onto `origin/master` (v0.12.3),
not a merge. Each logical group of changes was applied as a separate slice with
its own test validation checkpoint. The full rebase replayed 30 commits across
8 slices, resolving conflicts in `markdown.ts` (parser), `types.ts` (taxonomy),
`import-file.ts` (relations), and `sync.ts` (subdir support).

Test coverage: 1552 unit tests, 148 E2E tests. All passing.
