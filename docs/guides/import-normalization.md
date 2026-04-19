# Import Normalization Pipeline

## What the User Gets

Without normalization, Notion exports arrive with pluralized types (`tasks` instead of `task`), deprecated field names (`_events` instead of `related_events`), nested link structures, hex-UUID-laden file paths, and display names where slugs should be. The brain ingests it all literally, producing broken cross-references and inconsistent metadata.

With the normalization pipeline, every file is cleaned on the way in. Types are singularized, fields are renamed to the current schema, Notion paths become clean slugs, and display names resolve to real page references. The source file on disk is updated too, so git diff shows exactly what changed and the repo stays consistent with the database.

## When Normalization Runs

Normalization fires during import when a `titleMap` is provided. Both import paths support it:

| Path | Trigger | Effect |
|------|---------|--------|
| `importFromFile()` | `opts.titleMap` present | Normalizes content, writes corrected file back to disk, then imports |
| `importFromContent()` | `opts.titleMap` present | Normalizes in-memory before parsing and inserting into the database |

The pipeline runs before any database operations, embedding, or chunking. The sequence is:

```
Read file from disk
  -> normalizeContent() [frontmatter + body fixes]
  -> Write corrected file back to disk (if changed)
  -> parseMarkdown()
  -> SHA-256 hash check (idempotency)
  -> Chunk, embed, insert into DB
```

Sync builds the title map automatically from all markdown files in the repo (or subdir), so every `gbrain sync` run normalizes as a side effect.

## What Gets Normalized

### Type singularization

Plural type values in frontmatter are mapped to their singular form:

| Input | Output |
|-------|--------|
| `tasks` | `task` |
| `people` | `person` |
| `events` | `event` |
| `projects` | `project` |
| `contexts` | `context` |
| `resources` | `resource` |
| `interests` | `interest` |
| `organizations` | `organization` |

Case-insensitive. Types already in singular form pass through unchanged.

### Field renames

Deprecated or non-standard field names are renamed:

| Old field | New field | Reason |
|-----------|-----------|--------|
| `_events` | `related_events` | Notion export artifact |
| `parent_page` | `parent` | Schema standardization |

### Display name resolution

Frontmatter relation fields that contain human-readable names (e.g., `assigned_projects: "Agentic Infrastructure"`) are resolved to slug paths using the title map.

Resolution uses a three-tier lookup:

1. **Exact match** with directory scope: `"organizations:zendesk"` finds `organizations/zendesk`
2. **Loose match** (case-insensitive, first seen wins): `"zendesk"` finds `organizations/zendesk`
3. **Slugify fallback**: `"Agentic Infrastructure"` becomes `projects/agentic-infrastructure`

Single-valued fields (`delegate`, `manager`) produce a string. Multi-valued fields produce an array.

### Links nesting flattening

Notion exports sometimes produce nested link structures:

```yaml
links:
  assigned_projects:
    - projects/alpha
  related_people:
    - people/alice
```

The normalizer lifts these to top-level frontmatter fields:

```yaml
assigned_projects:
  - projects/alpha
related_people:
  - people/alice
```

Existing top-level keys are preserved and not overwritten.

### Notion path cleaning

**Relative paths** with hex UUIDs are converted to clean slugs:

```
../People/Alice%20Smith%20a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.md
  -> people/alice-smith
```

**Absolute Notion paths** infer the directory from context and resolve through the title map or slugification.

**Notion web URLs** (`https://www.notion.so/...`) are stripped entirely from markdown links.

## Frontmatter Relation Extraction

After normalization, the `relations.ts` module extracts structured links from frontmatter fields and writes them to the links table. This runs inside the import transaction.

### Supported relation fields

The pipeline recognizes 23 relation fields. Each maps to a typed link:

| Field | Link type | Cardinality |
|-------|-----------|-------------|
| `assigned_projects` | `assigned_project` | multi |
| `related_people` | `related_person` | multi |
| `delegate` | `delegate` | single |
| `manager` | `manages` | single |
| `supers` | `super` | multi |
| `parent` | `parent_*` (inferred from target directory) | single |

### Link synchronization

`syncPageLinks()` reconciles the database with the current frontmatter state:

- Removes stale frontmatter-type links that no longer appear in the frontmatter
- Adds new links from the current frontmatter
- Leaves auto-created links (from the content-based auto-link system) untouched

This distinction is important: frontmatter relations and content-based auto-links coexist. They use different link types, and `syncPageLinks` only manages the frontmatter set.

### Reverse link reconstruction

`reconstructReverseLinks()` computes bidirectional patches for one-sided imports. If a task page has `delegate: people/alice`, the function produces a patch adding `delegated_tasks: [tasks/the-task]` to Alice's page. The caller applies these patches to files on disk.

## The Title Map

The title map is the lookup table that powers display-name resolution. It is built from all markdown files in the sync scope:

```typescript
const titleMap = buildTitleMap(pages);
// pages: Array<{ title: string; slug: string }>
```

The map has three tiers:

| Tier | Key | Example |
|------|-----|---------|
| `exact` | `"directory:lowercase_title"` | `"organizations:zendesk"` -> `"organizations/zendesk"` |
| `loose` | `"lowercase_title"` | `"zendesk"` -> `"organizations/zendesk"` |
| `bySlug` | slug | `"organizations/zendesk"` -> `"Zendesk"` |

Exact match prevents collisions when two directories have pages with the same title (e.g., `aors/compute` vs `organizations/compute`).

## Idempotency

The entire pipeline is idempotent. Running normalization twice on the same file produces no changes on the second pass:

- `normalizeContent()` returns `changed: false` when content is already clean
- `importFromFile()` skips the disk write when nothing changed
- The SHA-256 hash check catches content that hasn't changed since last import

Re-importing a fully normalized brain is a fast no-op.

## Issue Tracking

Every fix applied by the normalizer is tracked as a `NormalizeIssue`:

```typescript
interface NormalizeIssue {
  file: string;
  line: number;
  rule: 'plural-type' | 'field-rename' | 'display-name-relation'
      | 'notion-path' | 'notion-url' | 'links-nesting';
  message: string;
  fixable: boolean;
}
```

These issues are returned but not persisted. They're useful for debugging import runs and understanding what the normalizer changed.

## Coexistence with Auto-Link

GBrain has two link extraction systems:

| System | Source | When it runs | Link types |
|--------|--------|-------------|------------|
| **Normalize + relations** | YAML frontmatter arrays | During import | `assigned_project`, `delegate`, `manages`, etc. |
| **Auto-link** (`link-extraction.ts`) | Markdown body content | On `put_page` | `attended`, `works_at`, `invested_in`, `founded`, `advises`, `mentions` |

Both use `ON CONFLICT DO NOTHING` at the database layer, so runtime duplicates are harmless. The two systems serve different purposes: frontmatter relations capture declared, semantic relationships; auto-link captures navigational references found in prose.

*Part of the [GBrain Skillpack](../GBRAIN_SKILLPACK.md). See also: [Four-Zone Page Structure](compiled-truth.md), [Page Types](page-types.md).*
