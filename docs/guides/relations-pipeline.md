# Relations Pipeline

## What the User Gets

Without this: frontmatter arrays like `organizations: [organizations/acme-corp]`
sit in YAML metadata. No clickable links. No graph edges. No way to ask "who
works at Acme?" and get a typed answer. Relationships are invisible to search
and navigation.

With the relations pipeline: every frontmatter relation becomes a typed link in
the database, a clickable markdown link in the relationships zone, and a
traversable edge in the knowledge graph. Edit the frontmatter, re-sync, and the
graph updates automatically. One-sided Notion imports get their reverse links
reconstructed. The result: `gbrain graph-query people/alice --type delegate`
returns Alice's delegated work, and the page itself shows a navigable
Relationships section.

## Two Link Systems

GBrain extracts links from two independent sources. Both populate the same
`links` table but serve different purposes and use different link types.

| System | Source | When | Link types | Example |
|--------|--------|------|-----------|---------|
| **Relations pipeline** | YAML frontmatter arrays | During `import` / `sync` | `assigned_project`, `belongs_to`, `delegate`, `manages`, `parent_*`, etc. | `organizations: [organizations/acme]` |
| **Auto-link** | Markdown body text | On every `put_page` | `attended`, `works_at`, `invested_in`, `founded`, `advises`, `mentions` | `[Alice](people/alice)` in prose |

The relations pipeline captures **declared, semantic relationships** (Alice
manages this project, this task is assigned to that AOR). Auto-link captures
**navigational references** found in prose (Alice was mentioned in a meeting
note, Bob works at Acme based on context clues).

Both use `ON CONFLICT DO NOTHING` at the database layer. If both systems
discover the same edge with different types, both links coexist. The `links`
table unique constraint includes `link_type`, so the same two pages can have
multiple typed edges.

## Supported Frontmatter Fields

The pipeline recognizes 17 relation fields plus `parent`. Each maps to a typed
link in the database.

### Assignment and hierarchy

| Field | Link type | Cardinality | Typical source |
|-------|-----------|-------------|----------------|
| `parent` | `parent_context`, `parent_aor`, `parent_project`, `parent_task`, or `parent_org` | single | Any page |
| `assigned_projects` | `assigned_project` | multi | Task pages |
| `assigned_aors` | `assigned_aor` | multi | Project pages |
| `assigned_contexts` | `assigned_context` | multi | AOR / project pages |
| `delegate` | `delegate` | single | Task / project pages |
| `manager` | `manages` | single | Person pages |
| `supers` | `super` | multi | Person pages |
| `subs` | `sub` | multi | Person pages |
| `delegated_tasks` | `delegated_task` | multi | Person pages |
| `delegated_projects` | `delegated_project` | multi | Person pages |

### Membership and association

| Field | Link type | Cardinality | Typical source |
|-------|-----------|-------------|----------------|
| `organizations` | `belongs_to` | multi | Person pages |
| `people` | `has_member` | multi | Organization pages |

### Cross-references

| Field | Link type | Cardinality | Typical source |
|-------|-----------|-------------|----------------|
| `related_people` | `related_person` | multi | Any page |
| `related_events` | `related_event` | multi | Any page |
| `related_resources` | `related_resource` | multi | Any page |
| `related_tasks` | `related_task` | multi | Any page |
| `related_projects` | `related_project` | multi | Any page |
| `related_interests` | `related_interest` | multi | Any page |

### Parent link type inference

The `parent` field produces a link type based on the source page's directory:

| Source directory | Link type |
|-----------------|-----------|
| `contexts/` | `parent_context` |
| `aors/` | `parent_aor` |
| `projects/` | `parent_project` |
| `tasks/` | `parent_task` |
| `organizations/` | `parent_org` |
| Any other | `parent` |

## Data Flow

```
Markdown file with frontmatter relations
    |
    v
normalizeContent() .......... display names -> slugs, field renames
    |
    v
parseMarkdown() ............. extract frontmatter + four zones
    |
    v
importFromContent() [inside transaction]
    |-- putPage() ........... store page metadata
    |-- extractRelations() .. frontmatter -> RelationLink[]
    |-- syncPageLinks() ..... reconcile DB links with current frontmatter
    |-- upsertChunks() ...... store embeddings
    |
    v
importFromFile() [after transaction]
    |-- renderRelationshipsZone() .. generate markdown
    |-- write zone back to disk .... if changed
```

### Normalization (pre-processing)

Before relation extraction, the normalization pipeline (`normalize.ts`) prepares
frontmatter for clean slug resolution:

1. **Flatten nested links** -- `links: { field: value }` promoted to top-level
2. **Singularize types** -- `tasks` becomes `task`
3. **Rename fields** -- `_events` becomes `related_events`, `parent_page` becomes `parent`
4. **Resolve display names** -- `"Alice Chen"` becomes `people/alice-chen` using the title map
5. **Clean Notion paths** -- hex UUID paths become clean slugs

### Extraction

`extractRelations(frontmatter, sourceSlug)` iterates the 17 recognized fields,
extracts slug values (string or array), filters Notion UUID paths, and returns
`RelationLink[]` with `{ targetSlug, linkType }`.

### Synchronization

`syncPageLinks(tx, sourceSlug, relations)` reconciles the database:

1. Fetches existing links from the source page
2. **Ignores non-frontmatter link types** -- auto-link types (`mentions`,
   `works_at`, etc.) are left untouched
3. Removes stale frontmatter links that no longer appear in the frontmatter
4. Adds new links from the current frontmatter
5. Returns `{ added, removed }` counts

If a target page doesn't exist yet (common during bulk import), the add
silently fails. The link will be created on the next import when both pages
exist.

### Relationships zone rendering

`renderRelationshipsZone(frontmatter, titleMap?)` generates a markdown section:

```markdown
## Relationships
- **Organizations:** [Acme Corp](organizations/acme-corp.md)
- **Related Projects:** [API Migration](projects/api-migration.md)
- **Reports To:** [CEO Jane](people/ceo-jane.md)
```

The zone is placed between `<!-- relationships -->` and `<!-- timeline -->`
sentinels. It regenerates on every import/sync when the frontmatter relations
change. Users should never edit this zone directly -- edit the frontmatter
arrays instead.

Fields are rendered in a fixed display order (parent first, then assignments,
membership, cross-references, delegation). The title map provides human-readable
link text; without it, slugs are converted to title case.

## Reverse Link Reconstruction

Notion exports are often one-sided: a task page lists `delegate: people/alice`
but Alice's page doesn't list `delegated_tasks: [tasks/the-task]`. The
`reconstructReverseLinks()` function computes the missing patches.

For each forward relation, a reverse mapping determines what field should exist
on the target page:

| Forward field (on source) | Source directory | Reverse field (on target) |
|--------------------------|-----------------|--------------------------|
| `assigned_projects` | `tasks/` | `tasks` |
| `assigned_aors` | `projects/` | `projects` |
| `assigned_contexts` | `aors/`, `projects/`, `tasks/`, `events/` | matching plural |
| `delegate` | `tasks/`, `projects/` | `delegated_tasks`, `delegated_projects` |
| `organizations` | `people/` | `people` |
| `people` | `organizations/` | `organizations` |
| `supers` | `people/` | `subs` |
| `related_*` | various | corresponding `related_*` on target |
| `parent` | `organizations/` | `children` |

The function is pure -- it returns patches without touching the database or disk.
The caller applies patches to files and re-imports to persist the changes.

## Worked Example

A task page at `tasks/api-migration.md`:

```yaml
---
type: task
title: API Migration
assigned_projects:
  - projects/platform-v2
delegate: people/alice
related_people:
  - people/bob
organizations:
  - organizations/acme-corp
---
```

After import, the links table contains:

| from_slug | to_slug | link_type |
|-----------|---------|-----------|
| `tasks/api-migration` | `projects/platform-v2` | `assigned_project` |
| `tasks/api-migration` | `people/alice` | `delegate` |
| `tasks/api-migration` | `people/bob` | `related_person` |
| `tasks/api-migration` | `organizations/acme-corp` | `belongs_to` |

Reverse link reconstruction produces patches:

| Target page | Patch field | Added slugs |
|-------------|-------------|-------------|
| `projects/platform-v2` | `tasks` | `[tasks/api-migration]` |
| `people/alice` | `delegated_tasks` | `[tasks/api-migration]` |
| `people/bob` | `related_tasks` | `[tasks/api-migration]` |

The relationships zone on the task page renders as:

```markdown
<!-- relationships -->

## Relationships
- **Assigned Projects:** [Platform V2](projects/platform-v2.md)
- **Organizations:** [Acme Corp](organizations/acme-corp.md)
- **Related People:** [Bob](people/bob.md)
- **Delegate:** [Alice](people/alice.md)

<!-- timeline -->
```

## Querying the Graph

Once relations are in the links table, they are traversable:

```bash
# Who does Alice delegate to?
gbrain graph-query people/alice --type delegate --direction out

# What tasks are assigned to platform-v2?
gbrain graph-query projects/platform-v2 --type assigned_project --direction in

# Full relationship neighborhood
gbrain graph-query tasks/api-migration --depth 2
```

The knowledge graph also improves search ranking. Pages with more inbound links
score higher in `gbrain query` results via backlink boosting.

## How to Verify

1. **Import a page with frontmatter relations.** Check the links table: `gbrain
   graph-query <slug>` should show typed edges.
2. **Edit the frontmatter** to remove a relation. Re-import. The stale link
   should be gone; auto-link edges should be untouched.
3. **Check the relationships zone.** The page on disk should have a
   `## Relationships` section between `<!-- relationships -->` and
   `<!-- timeline -->` sentinels with clickable links.
4. **Run reverse link reconstruction** on a one-sided import. Target pages
   should gain the corresponding reverse fields in their frontmatter.
5. **Query the graph.** `gbrain graph-query <slug> --type <linkType>` should
   return the expected connected pages.

---

*Part of the [GBrain Skillpack](../GBRAIN_SKILLPACK.md). See also:
[Four-Zone Page Structure](compiled-truth.md),
[Page Types](page-types.md),
[Import Normalization](import-normalization.md).*
