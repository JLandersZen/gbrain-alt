# Specification: Taxonomy Replacement + Notion Import POC

**Branch:** `internal-adaptation`
**Beads:** `gbrain-alt-f61` (Phase 0)
**Date:** 2026-04-16

---

## 1. Current System

### 1.1 Page Types

GBrain has two layers of type definition that don't fully agree:

**In code — 9 hardcoded types** in the TypeScript union, designed around Garry
Tan's personal taxonomy (YC president, investor, civic leader):

```typescript
// src/core/types.ts:2
type PageType = 'person' | 'company' | 'deal' | 'yc' | 'civic' | 'project' | 'concept' | 'source' | 'media';
```

**In docs — ~20 types** described in `docs/GBRAIN_RECOMMENDED_SCHEMA.md`: people,
companies, deals, meetings, projects, ideas, concepts, writing, programs, org,
civic, media, personal, household, hiring, sources, prompts, inbox, archive, and
agent. Many of these (meetings, ideas, writing, programs, org, personal, household,
hiring, agent) have no corresponding value in the TypeScript union.

**Deliberate flexibility:** The database has **no CHECK constraints** on the `type`
column — it accepts any text value. The `inferType()` function returns one of the
9 hardcoded types, but if a page has `type: meeting` in its YAML frontmatter, the
import pipeline accepts it. Garry Tan was evolving toward supporting any taxonomy
by removing validation around the hardcoded types. We preserve this flexibility.

These hardcoded types are referenced in:

| Location | What it does |
|----------|-------------|
| `src/core/types.ts:2` | `PageType` union — the 9 hardcoded types |
| `src/core/markdown.ts:125-139` | `inferType()` — maps directory paths to the 9 types |
| `src/commands/backlinks.ts:31,37` | Hardcoded `people/` and `companies/` regex for entity link detection |
| `docs/GBRAIN_RECOMMENDED_SCHEMA.md` | ~20 types in resolver decision tree, page templates, directory structure |
| `skills/_brain-filing-rules.md` | Filing rules referencing current directories |
| `README.md:116-123,519` | Type names in examples and schema table |
| `test/markdown.test.ts` | `inferType()` tests with current types |
| `test/pglite-engine.test.ts` | Test pages with `person`, `company`, `concept` types |
| `test/dedup.test.ts` | Dedup tests with `person`, `concept` types |
| `test/e2e/mechanical.test.ts` | Type inference and filtering tests |
| `test/backlinks.test.ts` | Entity link extraction for `people/`, `companies/` |
| `test/benchmark-search-quality.ts` | 40+ pages with current types |

### 1.2 Directory-to-Type Mapping

```
people/     → person       companies/  → company
deals/      → deal         yc/         → yc
civic/      → civic        projects/   → project
sources/    → source       media/      → media
(default)   → concept
```

### 1.3 Recommended Schema

`docs/GBRAIN_RECOMMENDED_SCHEMA.md` (1,014 lines) describes a ~20-directory brain
structure built around Garry Tan's use case. It includes page templates, a resolver
decision tree, enrichment pipeline documentation, cron job architecture, and worked
examples — all oriented toward an investor/founder managing a social graph of
people, companies, and deals.

### 1.4 What Does NOT Need Changing

The database schema has **no CHECK constraints** on the `type` column — it accepts
any text value. Search dedup (`src/core/search/dedup.ts`) is generic and works with
any type values. The search pipeline, import pipeline, chunking, embedding, link
graph, and MCP server are all type-agnostic. The `frontmatter` JSONB column already
stores arbitrary key-value pairs with no validation.

`src/core/operations.ts` defines the `type` parameter for `list_pages` and
`put_page` as `type: 'string'` with no enum constraint. This is intentional —
the contract layer is type-agnostic by design. No change needed.

### 1.5 Frontmatter

Currently, frontmatter is a freeform JSONB blob. There are no conventions for what
properties each type should have. The upstream schema doc suggests loose patterns
(State, Open Threads, etc.) but nothing is enforced or standardized. Properties
are whatever the user or agent puts in.

---

## 2. Target System

### 2.1 New Page Types

Replace Garry Tan's 9 hardcoded types with 9 types from the user's PARA+GTD
hybrid system. Replace his ~20 doc types with these same 9 throughout all
documentation. Preserve the existing flexibility — the database remains
unconstrained, and pages with types outside the union still import fine.

```typescript
type PageType =
  | 'context'       // Level 1 — GTD contexts, hierarchical
  | 'aor'           // Level 2 — Areas of Responsibility
  | 'project'       // Level 3 — Active projects (kept from current)
  | 'task'          // Level 4 — Actionable items
  | 'event'         // Level 4 — Calendar events, meetings
  | 'resource'      // Level 5 — Reference material, docs, notes
  | 'interest'      // Outside hierarchy — topics/curiosities to track
  | 'person'        // Outside hierarchy (kept from current)
  | 'organization'  // Outside hierarchy — replaces 'company'
  ;
```

**Dropped from code:** `deal`, `yc`, `civic`, `concept`, `source`, `media`.
**Dropped from docs:** meetings, ideas, writing, programs, org, personal,
household, hiring, agent, prompts, inbox, archive (all ~20 Garry Tan doc types).
**Renamed:** `company` → `organization`.
**Added:** `context`, `aor`, `task`, `event`, `resource`, `interest`.
**Kept:** `person`, `project`.
**Flexibility preserved:** The `type` column has no CHECK constraint. Custom types
beyond these 9 will import and query correctly — they just won't have `inferType()`
path-mapping or appear in the TypeScript union.

### 2.2 Levels and Inheritance

Levels define inheritance direction — lower levels inherit from higher:

| Level | Type | Parent/Child | Inheritance |
|-------|------|-------------|-------------|
| 1 | **Context** | Yes (Context→Context) | None (top level) |
| 2 | **AOR** | Yes (AOR→AOR) | Inherits parent AOR's Contexts |
| 3 | **Project** | Yes (Project→Project) | Inherits related AORs' Combined Contexts + parent Project's Combined AORs/Contexts |
| 4 | **Task** | Yes (Task→Task sub-tasks) | Inherits from related Projects, AORs + parent Task's Combined values |
| 4 | **Event** | No | Inherits from related Projects, AORs |
| 4 | **Resource** | No | Inherits from related Projects, AORs |
| — | **Interest** | No | No inheritance |
| — | **Person** | No | No inheritance |
| — | **Organization** | Yes (Org→Org) | No inheritance |

### 2.3 Three-Tier Relationship Naming

All relationships follow a standardized three-tier naming convention:

| Tier | Pattern | Managed By | Purpose |
|------|---------|-----------|---------|
| **Assigned** | `assigned_contexts`, `assigned_aors`, `assigned_projects` | User | Directly set by user. Only tier the user edits. |
| **Inherited** | `inherited_contexts`, `inherited_aors`, `inherited_projects` | Automation | De-duplicated relations inherited from parent + higher-level entities |
| **Combined** | `combined_contexts`, `combined_aors`, `combined_projects` | Automation | De-duplicated union of Assigned + Inherited. Used for filtering/grouping/search. |

**Decision:** Even though GBrain can compute inherited relations via `traverseGraph`
at query time, the user wants inherited and combined values stored as frontmatter.
This serves two purposes: (1) Notion bidirectional sync needs concrete property
values, not computed traversals, and (2) frontmatter values enable Obsidian Dataview
queries without needing the database.

### 2.4 Inheritance Rules

**Contexts (Level 1):** No inheritance. Top of the hierarchy.

**AORs (Level 2):**
- `inherited_contexts` = parent AOR's `combined_contexts`
- `combined_contexts` = dedup(`assigned_contexts` + `inherited_contexts`)

**Projects (Level 3):**
- `inherited_aors` = parent Project's `combined_aors`
- `inherited_contexts` = dedup(
    parent Project's `combined_contexts` +
    each assigned AOR's `combined_contexts`
  )
- `combined_aors` = dedup(`assigned_aors` + `inherited_aors`)
- `combined_contexts` = dedup(`assigned_contexts` + `inherited_contexts`)

**Tasks (Level 4, inherits):**
- `inherited_projects` = parent Task's `combined_projects`
- `inherited_aors` = dedup(
    parent Task's `combined_aors` +
    each assigned Project's `combined_aors`
  )
- `inherited_contexts` = dedup(
    parent Task's `combined_contexts` +
    each assigned Project's `combined_contexts` +
    each assigned AOR's `combined_contexts`
  )
- `combined_projects` = dedup(`assigned_projects` + `inherited_projects`)
- `combined_aors` = dedup(`assigned_aors` + `inherited_aors`)
- `combined_contexts` = dedup(`assigned_contexts` + `inherited_contexts`)

**Events and Resources (Level 4, inherits):** Same as Tasks, but no parent/child
nesting, so no parent inheritance — only cross-entity inheritance from assigned
Projects and AORs.

**Interest, Person, Organization:** No inheritance. Linked to entities at any
level but do not participate in the Assigned/Inherited/Combined system.

### 2.5 Frontmatter Schema Per Entity Type

All entity types share the compiled truth + timeline page structure. Frontmatter
is standardized per type. Relationship fields store arrays of slugs.

**Note:** These schemas are conventions, not validated contracts. Nothing in the
codebase enforces frontmatter structure — the `frontmatter` JSONB column accepts
any key-value pairs. The schemas below define what the Notion import produces and
what agents/skills should expect, not what the system rejects.

#### Context

```yaml
type: context
title: "At Work"
tags: []
parent: contexts/corporate        # parent context slug (if nested)
```

#### AOR

```yaml
type: aor
title: "Engineering Leadership"
tags: []
parent: aors/technology            # parent AOR slug (if nested)
assigned_contexts: [contexts/at-work]
inherited_contexts: []
combined_contexts: [contexts/at-work]
```

#### Project

```yaml
type: project
title: "GBrain Adaptation"
status: in-progress                # waiting | not-started | in-progress | almost-done | done | wont-do
priority: must-do                  # must-do | important | interesting | not-important
when: now                          # now | urgent | not-urgent
motivation: internal               # internal | external
due_date: 2026-06-01
done: false
link: "https://..."
tags: []
parent: projects/knowledge-management  # parent project slug (if nested)
assigned_aors: [aors/engineering-leadership]
assigned_contexts: []
inherited_aors: []
inherited_contexts: [contexts/at-work]
combined_aors: [aors/engineering-leadership]
combined_contexts: [contexts/at-work]
```

#### Task

```yaml
type: task
title: "Import Notion data into GBrain"
status: in-progress
priority: must-do
when: now
motivation: internal
due_date: 2026-04-20
done: false
reviewed: false
assignee: "Joe Landers"
tl_dr: "First POC slice — prove the import works"
tags: []
parent: tasks/taxonomy-replacement  # parent task slug (sub-tasks)
delegate: people/someone            # delegated to person slug
assigned_projects: [projects/gbrain-adaptation]
assigned_aors: []
assigned_contexts: []
inherited_projects: []
inherited_aors: [aors/engineering-leadership]
inherited_contexts: [contexts/at-work]
combined_projects: [projects/gbrain-adaptation]
combined_aors: [aors/engineering-leadership]
combined_contexts: [contexts/at-work]
related_people: [people/joe-landers]
related_events: []
related_resources: []
```

#### Event

```yaml
type: event
title: "Weekly Engineering Sync"
dates: 2026-04-16
event_id: "google-cal-abc123"      # Google Calendar recurring series ID
priority: important
when: now
motivation: external
reviewed: false
link: "https://meet.google.com/..."
tags: []
assigned_projects: [projects/gbrain-adaptation]
assigned_aors: [aors/engineering-leadership]
assigned_contexts: []
inherited_aors: []
inherited_contexts: [contexts/at-work]
combined_aors: [aors/engineering-leadership]
combined_contexts: [contexts/at-work]
related_people: [people/joe-landers]
related_tasks: []
related_resources: []
```

#### Resource

```yaml
type: resource
title: "GBrain Architecture RFC"
resource_type: rfcs-and-strategy   # feedback | rfcs-and-strategy | curiosities-and-interests | reference-material | status-updates | brag-doc | training-materials | development-plans | meeting-notes | slack-channel | planning-and-tracking | proposal-doc
status: done
priority: important
when: not-urgent
motivation: internal
reviewed: true
archived: false
done: true
link: "https://..."
tags: []
assigned_projects: [projects/gbrain-adaptation]
assigned_aors: []
assigned_contexts: []
inherited_aors: [aors/engineering-leadership]
inherited_contexts: [contexts/at-work]
combined_aors: [aors/engineering-leadership]
combined_contexts: [contexts/at-work]
related_people: []
related_tasks: []
related_events: []
organizations: []
```

#### Interest

```yaml
type: interest
title: "Distributed Systems"
tags: []
related_resources: [resources/cap-theorem-paper]
related_people: [people/martin-kleppmann]
related_events: []
```

Interest is a new entity type, outside the level hierarchy. It captures
topics/curiosities the user wants to track when there is no associated Project or
AOR. Its key relationship is to Resources — allowing the user to attach reference
material to an interest without needing to create a Project or AOR first.

Interest can also relate to People (experts on the topic), Events (relevant
conferences/talks), and other entities via standard gbrain links.

#### Person

```yaml
type: person
title: "Sarah Chen"
email: "sarah@example.com"
slack_id: "U30N6M1FH"
is_archived: false
tags: []
organizations: [organizations/acme-corp]
related_tasks: []
related_resources: []
related_projects: [projects/gbrain-adaptation]
related_events: []
delegated_tasks: []
delegated_projects: []
supers: [people/jane-doe]          # hierarchy: reports to
subs: []                           # hierarchy: direct reports
```

#### Organization

```yaml
type: organization
title: "Acme Corp"
tags: []
parent: organizations/parent-corp  # parent org slug (if nested)
people: [people/sarah-chen]
resources: []
projects: [projects/acme-migration]
manager: people/jane-doe           # one-way relation to person
```

### 2.6 Directory-to-Type Mapping (New)

```
contexts/       → context
aors/           → aor
projects/       → project        (unchanged directory name)
tasks/          → task
events/         → event
resources/      → resource
interests/      → interest
people/         → person         (unchanged)
organizations/  → organization
(default)       → resource       (was 'concept' — resource is the catch-all)
```

### 2.7 Link Type Vocabulary

GBrain stores typed links in the `links` table. The following link types replace
the implicit Notion relation fields:

**Cross-entity relationships (many-to-many, bidirectional):**

| Link Type | From | To | Notes |
|-----------|------|----|-------|
| `assigned_context` | any inheriting entity | context | User-assigned |
| `assigned_aor` | any inheriting entity | aor | User-assigned |
| `assigned_project` | task, event, resource | project | User-assigned |
| `related_person` | task, event, resource, project | person | Bidirectional |
| `related_task` | event, resource, person | task | Bidirectional |
| `related_event` | task, resource, person, project | event | Bidirectional |
| `related_resource` | task, event, person, project, interest | resource | Bidirectional |
| `related_interest` | resource, person, event | interest | Bidirectional |
| `delegate` | task, project | person | Delegated to |
| `belongs_to` | person | organization | Bidirectional |
| `manages` | person | organization | One-way (manager) |

**Parent/child relationships (hierarchical, within type):**

| Link Type | Between | Notes |
|-----------|---------|-------|
| `parent_context` | context → context | |
| `parent_aor` | aor → aor | |
| `parent_project` | project → project | |
| `parent_task` | task → task | Sub-tasks |
| `parent_org` | organization → organization | |
| `super` | person → person | Reports-to hierarchy |

**Inheritance links (automation-managed):**
Inherited and combined relations are stored as **frontmatter arrays**, not as links
in the `links` table. This is because they are denormalized aggregates, not primary
relationships. Storing them in frontmatter makes them queryable via JSONB operators
and exportable to Notion/Obsidian without joins.

### 2.8 Backlinks Command

The current `backlinks.ts` hardcodes regex for `people/` and `companies/`
directories. This must be updated to detect entity mentions for all types that
participate in cross-referencing: `people/`, `organizations/`, `projects/`,
`tasks/`, `events/`, `resources/`, `interests/`, `contexts/`, `aors/`.

### 2.9 Recommended Schema Document

`docs/GBRAIN_RECOMMENDED_SCHEMA.md` will be rewritten to describe the PARA+GTD
taxonomy as the default recommended schema. The document will:

- Replace the 20-directory Garry Tan structure with the 9 entity type directories
- Replace the resolver decision tree with one based on the entity types
- Replace page templates with the frontmatter schemas defined in §2.5
- Keep the compiled truth + timeline pattern (unchanged)
- Keep the enrichment pipeline concepts (unchanged — they are type-agnostic)
- Replace worked examples with ones using the new types
- Document the three-tier relationship naming convention
- Document the inheritance rules
- Document the inbox pattern (zero relationships → triage assigns them)

### 2.10 Filing Rules

`skills/_brain-filing-rules.md` will be updated to reflect the new directories
and the new resolver:

1. A specific named person → `people/`
2. A specific organization → `organizations/`
3. A GTD context (filters, life areas) → `contexts/`
4. An area of responsibility → `aors/`
5. Something being actively built (has work, team, spec) → `projects/`
6. An actionable item with a doer → `tasks/`
7. A calendar event or meeting → `events/`
8. A topic or curiosity with no project/AOR → `interests/`
9. Everything else (documents, notes, reference material) → `resources/`

---

## 3. Changes Required

### 3.1 Code Changes (~25 lines of logic)

| File | Change |
|------|--------|
| `src/core/types.ts:2` | Replace `PageType` union with new 9 types |
| `src/core/markdown.ts:125-139` | Rewrite `inferType()` for new directory→type mapping; default to `resource` |
| `src/commands/backlinks.ts:31,37` | Update regex to include all entity directories |

### 3.2 Test Changes (~400 lines of assertions)

| File | Change |
|------|--------|
| `test/markdown.test.ts` | Update `inferType()` tests for new types/directories |
| `test/pglite-engine.test.ts` | Replace `person`/`company`/`concept` with new types in test pages |
| `test/dedup.test.ts` | Replace type references |
| `test/e2e/mechanical.test.ts` | Update type filtering and assertion tests |
| `test/backlinks.test.ts` | Update entity directory pattern tests |
| `test/benchmark-search-quality.ts` | Update 40+ page definitions to use new types |

### 3.3 Documentation Changes

| File | Change |
|------|--------|
| `docs/GBRAIN_RECOMMENDED_SCHEMA.md` | Full rewrite: new taxonomy, templates, resolver, examples |
| `skills/_brain-filing-rules.md` | Rewrite filing rules for new directories |
| `README.md` | Update type references in schema table, examples, architecture diagram |
| `CLAUDE.md` | Update type list in "Key files" and "Database schema" sections |

### 3.4 No Database Changes

The `type` column is unconstrained `TEXT`. The `frontmatter` column is `JSONB`.
No SQL schema changes are needed. New types and frontmatter conventions are
enforced purely in TypeScript and documentation.

---

## 4. Notion Import (Slice 2)

### 4.1 What It Proves

The Notion import POC proves that the user's existing Notion data — 8 entity types
(now 9 with Interests) with their properties, relationships, and hierarchy — can be
faithfully represented in GBrain pages with the new taxonomy. This is the critical
validation that the taxonomy replacement works end-to-end.

### 4.2 Notion Export → GBrain Pages

Each Notion entity type maps to one GBrain page type. Each Notion page becomes one
markdown file with YAML frontmatter matching the schemas in §2.5.

| Notion Entity | GBrain Type | Directory | Notes |
|---------------|-------------|-----------|-------|
| Contexts | `context` | `contexts/` | |
| AORs | `aor` | `aors/` | |
| Projects | `project` | `projects/` | |
| Tasks | `task` | `tasks/` | |
| Events | `event` | `events/` | |
| Resources | `resource` | `resources/` | |
| Interests | `interest` | `interests/` | New entity |
| People | `person` | `people/` | |
| Organizations | `organization` | `organizations/` | |

### 4.3 Property Mapping

For each Notion property, the disposition is: **keep** (map to frontmatter),
**drop** (calculated/deprecated), or **link** (map to gbrain link).

#### Tasks

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Title | keep | `title` |
| Status | keep | `status` (waiting, in-progress, almost-done, done, wont-do) |
| Priority | keep | `priority` (must-do, important, interesting, not-important) |
| When | keep | `when` (now, urgent, not-urgent) |
| Motivation | keep | `motivation` (internal, external) |
| Due Date | keep | `due_date` |
| Done | keep | `done` |
| Reviewed | keep | `reviewed` |
| TL/DR | keep | `tl_dr` |
| Assignee | keep | `assignee` |
| Created time | keep | `created_at` |
| Last Modified | keep | `updated_at` |
| Assigned Projects | link | `assigned_projects` frontmatter + `assigned_project` links |
| Assigned AORs | link | `assigned_aors` frontmatter (one-way in Notion) |
| Assigned Contexts | link | `assigned_contexts` frontmatter + `assigned_context` links |
| Related People | link | `related_people` frontmatter + `related_person` links |
| Related Resources | link | `related_resources` frontmatter + `related_resource` links |
| Related Events | link | `related_events` frontmatter + `related_event` links |
| Delegate | link | `delegate` frontmatter + `delegate` link |
| Sub-task / Parent task | link | `parent` frontmatter + `parent_task` link |
| Inherited AORs | keep | `inherited_aors` (import as-is from Notion) |
| Inherited Contexts | keep | `inherited_contexts` (import as-is from Notion) |
| Inherited Projects | keep | `inherited_projects` (import as-is from Notion) |
| Combined AORs | keep | `combined_aors` (import as-is from Notion) |
| Combined Contexts | keep | `combined_contexts` (import as-is from Notion) |
| Combined Projects | keep | `combined_projects` (import as-is from Notion) |
| Deprecated * | drop | All deprecated rollups and formulas are dropped |
| Needs Work | drop | Calculated formula |
| Needs Review | drop | Calculated formula |

#### Resources

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Title | keep | `title` |
| Resource Type | keep | `resource_type` |
| Status | keep | `status` |
| Priority | keep | `priority` |
| When | keep | `when` |
| Motivation | keep | `motivation` |
| Reviewed | keep | `reviewed` |
| Archived | keep | `archived` |
| Done | keep | `done` |
| Link | keep | `link` |
| Assigned Projects | link | `assigned_projects` frontmatter |
| Assigned AORs | link | `assigned_aors` frontmatter + `assigned_aor` links |
| Assigned Contexts | link | `assigned_contexts` frontmatter |
| Organizations | link | `organizations` frontmatter + `belongs_to` links |
| People | link | `related_people` frontmatter + `related_person` links |
| Linked Tasks | link | `related_tasks` frontmatter + `related_task` links |
| Related Events | link | `related_events` frontmatter + `related_event` links |
| Inherited AORs | keep | `inherited_aors` |
| Inherited Contexts | keep | `inherited_contexts` |
| Combined AORs | keep | `combined_aors` |
| Combined Contexts | keep | `combined_contexts` |
| Deprecated * | drop | All deprecated values dropped |

#### Events

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Name | keep | `title` |
| Dates | keep | `dates` |
| Event ID | keep | `event_id` |
| Priority | keep | `priority` |
| When | keep | `when` |
| Motivation | keep | `motivation` |
| Reviewed | keep | `reviewed` |
| Link | keep | `link` |
| Assigned Projects | link | `assigned_projects` frontmatter + links |
| Related Tasks | link | `related_tasks` frontmatter + links |
| Assigned AORs | link | `assigned_aors` frontmatter + links |
| Assigned Contexts | link | `assigned_contexts` frontmatter + links |
| People | link | `related_people` frontmatter + links |
| Resources | link | `related_resources` frontmatter + links |
| Inherited AORs | keep | `inherited_aors` |
| Inherited Contexts | keep | `inherited_contexts` |
| Combined AORs | keep | `combined_aors` |
| Combined Contexts | keep | `combined_contexts` |
| Deprecated * | drop | |

#### People

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Name | keep | `title` |
| Email | keep | `email` |
| Slack ID | keep | `slack_id` |
| Is Archived | keep | `is_archived` |
| Organizations | link | `organizations` frontmatter + `belongs_to` links |
| Related Tasks | link | `related_tasks` frontmatter + links |
| Related Resources | link | `related_resources` frontmatter + links |
| Projects | link | `related_projects` frontmatter + links |
| Events | link | `related_events` frontmatter + links |
| Delegated Tasks | link | `delegated_tasks` frontmatter + links |
| Delegated Projects | link | `delegated_projects` frontmatter + links |
| Supers | link | `supers` frontmatter + `super` links |
| Subs | link | `subs` (derived — inverse of `super` links) |

#### Projects

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Title | keep | `title` |
| Status | keep | `status` |
| Priority | keep | `priority` |
| When | keep | `when` |
| Motivator | keep | `motivation` (normalized name) |
| Due Date | keep | `due_date` |
| Done | keep | `done` |
| Link | keep | `link` |
| Parent page | link | `parent` frontmatter + `parent_project` link |
| Assigned AORs | link | `assigned_aors` frontmatter |
| Assigned Contexts | link | `assigned_contexts` frontmatter + links |
| Organizations | link | `organizations` frontmatter + links |
| Resources | link | `related_resources` frontmatter |
| Events | link | `related_events` frontmatter + links |
| Related People | link | `related_people` frontmatter + links |
| Delegate | link | `delegate` frontmatter + `delegate` link |
| Tasks | link | `tasks` (derived — inverse of Task's `assigned_projects`) |
| Inherited AORs | keep | `inherited_aors` |
| Inherited Contexts | keep | `inherited_contexts` |
| Combined AORs | keep | `combined_aors` |
| Combined Contexts | keep | `combined_contexts` |
| Deprecated * | drop | |

#### AORs

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Page (title) | keep | `title` |
| Tags | keep | `tags` |
| Parent page | link | `parent` frontmatter + `parent_aor` link |
| Assigned Contexts | link | `assigned_contexts` frontmatter + links |
| Resources | link | `related_resources` frontmatter + links |
| Projects | link | `projects` (derived — inverse of Project's `assigned_aors`) |
| Events | link | `related_events` frontmatter + links |
| Inherited Contexts | keep | `inherited_contexts` |
| Combined Contexts | keep | `combined_contexts` |
| Deprecated * | drop | |

#### Contexts

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Page (title) | keep | `title` |
| Tags | keep | `tags` |
| Parent page | link | `parent` frontmatter + `parent_context` link |
| AORs | link | `aors` (derived — inverse of AOR's `assigned_contexts`) |
| Projects | link | `projects` (derived — inverse of Project's `assigned_contexts`) |
| Tasks | link | `tasks` (derived — inverse of Task's `assigned_contexts`) |
| Events | link | `events` (derived — inverse of Event's `assigned_contexts`) |

#### Organizations

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| Name | keep | `title` |
| Parent | link | `parent` frontmatter + `parent_org` link |
| Children | link | (derived — inverse of `parent_org`) |
| People | link | `people` frontmatter + links |
| Resources | link | `related_resources` frontmatter + links |
| Projects | link | `related_projects` frontmatter + links |
| Manager | link | `manager` frontmatter + `manages` link |

#### Interests

| Notion Property | Disposition | GBrain Frontmatter / Link |
|----------------|-------------|--------------------------|
| (title) | keep | `title` |
| (tags) | keep | `tags` |
| Resources | link | `related_resources` frontmatter + links |
| People | link | `related_people` frontmatter + links |
| Events | link | `related_events` frontmatter + links |

The Interests schema is incomplete in Notion. The above reflects the binding
relationships that exist, plus the Resources relationship being added.

### 4.4 Slug Generation

Notion page titles → GBrain slugs:
- Lowercase, hyphenated: "Engineering Leadership" → `aors/engineering-leadership`
- Prefixed by entity directory: `{type_directory}/{slug}.md`
- Collision handling: if slug exists, append Notion page ID suffix

### 4.5 Notion Page Content → Compiled Truth + Timeline

Notion page body content (the blocks below properties) maps to compiled truth.
There is no existing timeline in Notion — the timeline section will be initialized
with a single entry recording the import:

```markdown
---

- 2026-04-XX: Imported from Notion (page ID: {notion_id})
```

### 4.6 Import Approach

No new import code in gbrain-alt. The POC uses the existing migrate skill
(`skills/migrate/SKILL.md`) against a Notion UI export:

1. Export from Notion UI (Markdown & CSV format)
2. Run gbrain's migrate skill against the exported directory
3. The skill handles markdown parsing, frontmatter extraction, and slug generation
4. `gbrain import <export-dir> --no-embed` then `gbrain embed --stale`
5. Gaps discovered during import feed back as targeted fixes on `internal-adaptation`

This validates whether the existing tool handles the new taxonomy end-to-end
without building Notion-specific code. The goal is minimal drift from upstream.

### 4.7 Entity Resolution

For the POC, entity resolution is simple: each Notion page gets exactly one GBrain
page. The Notion page ID is stored in frontmatter (`notion_id`) for bidirectional
reference. Cross-source entity resolution (matching people across Notion, Gmail,
Slack) is deferred — it's a Slice 9 concern from the long-range plan.

---

## 5. Four-Zone Page Structure and Relation Storage

### 5.1 Design Decisions (from Notion Import POC findings, 2026-04-18)

The Notion import POC revealed several design gaps:

1. **Notion exports are one-sided.** Only one direction of bidirectional relations
   survives export. If Task A references Project X, Project X does NOT list Task A.
   Reverse relations must be reconstructed during import.

2. **Relations stored only as names/slugs are not navigable.** Users need to click
   through relationships in Obsidian, VS Code, GitHub, or any markdown viewer.
   YAML frontmatter is rendered as raw text — markdown links in YAML are not clickable.

3. **Relations need to serve two audiences.** Machines need queryable data (JSONB
   frontmatter). Humans need clickable navigation (markdown links in the body).

### 5.2 Relation Storage: Dual Representation

**Frontmatter** stores relation slugs as paths — machine-readable, queryable via
JSONB operators in Postgres:

```yaml
assigned_aors:
  - aors/engineering-leadership
related_people:
  - people/joe-landers
```

**Relationships zone** (in the page body) renders the same relations as navigable
markdown links — human-readable, clickable in any markdown viewer:

```markdown
## Relationships
- **Assigned AORs:** [Engineering Leadership](aors/engineering-leadership.md)
- **Related People:** [Joe Landers](people/joe-landers.md)
```

**Frontmatter is authoritative.** The relationships zone is generated by gbrain
from frontmatter. User edits to the relationships zone will be overwritten on sync.
Users modify relations by editing frontmatter slug arrays.

### 5.3 Four-Zone Page Structure

The two-zone page structure (compiled truth + timeline) evolves to four zones:

```markdown
---
type: project
title: GBrain Adaptation
status: in-progress
assigned_aors:
  - aors/engineering-leadership
related_people:
  - people/joe-landers
---

Compiled truth here. User writes and edits this freely.

---

## Relationships
- **Assigned AORs:** [Engineering Leadership](aors/engineering-leadership.md)
- **Related People:** [Joe Landers](people/joe-landers.md)

---

- 2026-04-16: Imported from Notion
```

| Zone | Separator | Owner | Editable by user |
|------|-----------|-------|-----------------|
| **Frontmatter** | `---` pair (YAML) | User / import | Yes |
| **Compiled truth** | After frontmatter, before first body `---` | User / agent | Yes |
| **Relationships** | Between first and second body `---` | gbrain (generated) | No — overwritten on sync |
| **Timeline** | After second body `---` | User / agent (append-only) | Yes (append only) |

Zones are positional — separated by `---` delimiters, same convention already in
use. No magic comments or markers. The parser splits on `---` in order:

1. gray-matter extracts frontmatter (existing behavior)
2. First body `---` → end of compiled truth, start of relationships
3. Second body `---` → end of relationships, start of timeline

If a page has no relationships (no relation frontmatter), the relationships zone
is omitted and the page degrades to the current two-zone format. Backwards
compatible.

### 5.4 Sync Behavior

`gbrain sync` performs three operations per changed file:

1. **Parse frontmatter relations → update `links` table.** Any frontmatter key
   matching known relation patterns (`assigned_*`, `related_*`, `parent`,
   `organizations`, `people`, etc.) containing slug paths is upserted into the
   `links` table with the appropriate `link_type`.

2. **Regenerate relationships zone.** Read frontmatter relation arrays, resolve
   slug paths to page titles (from DB or frontmatter of target files), render as
   markdown links, and write back to the file between the two body `---` separators.

3. **Update page content in DB.** Parse compiled truth, relationships, and timeline
   into their respective database columns. Chunk and embed as before.

**Sync writes back to the user's file.** This is a change from current behavior
where sync is read-only from the repo's perspective. The user runs `gbrain sync`,
sees a diff in git (the regenerated relationships zone), and commits it.

### 5.5 Reverse-Link Reconstruction

On import (especially from Notion's one-sided exports), a post-import pass
reconstructs missing reverse relations:

1. Iterate all imported pages
2. For each relation in frontmatter (e.g. Task A → `assigned_projects: [projects/x]`)
3. Check if the target page (Project X) has the reverse relation (e.g. `tasks: [tasks/a]`)
4. If missing, add it to the target's frontmatter
5. Regenerate both pages' relationships zones

This is not Notion-specific — any import source that provides one-sided relations
benefits from the same pass.

### 5.6 Parser Changes

`splitBody()` in `src/core/markdown.ts` currently splits on the first `---` into
two parts. It must be extended to split into three parts:

```typescript
// Current: { compiled_truth, timeline }
// New:     { compiled_truth, relationships, timeline }
```

If only one `---` is found and the page has relation frontmatter, the parser treats
the split as compiled_truth/timeline (backwards compatible) and generates the
relationships zone between them on next sync. If two `---` are found, the middle
section is the relationships zone.

## 6. What Does Not Change

- Database schema (SQL tables, indexes, constraints)
- Search pipeline (vector + keyword + RRF + dedup)
- Import pipeline (`gbrain import` — idempotent, SHA-256 hash)
- Chunking strategies (recursive, semantic, LLM-guided)
- Embedding model and dimensions
- MCP server and CLI command structure
- Link graph storage (links table)
- Tag system
- Page versioning
- PGLite / Postgres engine architecture
- Engine factory and dynamic imports

---

## 6. Delivery Structure

### Slice 1: Taxonomy Replacement

All changes to gbrain-alt that replace Garry Tan's taxonomy with the PARA+GTD
taxonomy as the default. Code, tests, and documentation.

**Scope:** §3.1, §3.2, §3.3 above. No Notion import, no brain repo setup.

**Acceptance:** `bun test` passes with new types. All docs reference new taxonomy.
No references to `deal`, `yc`, `civic`, `concept`, `source`, or `media` as page
types remain in the codebase (except in CHANGELOG.md historical entries and git
history).

### Slice 2: Notion Import POC

A working import from Notion into a GBrain brain repo using the new taxonomy.

**Scope:** §4 above. Import script, property mapping, slug generation, relationship
mapping, initial brain repo with imported data.

**Acceptance:** All 9 Notion entity types imported as GBrain pages. Properties
mapped to frontmatter. Relations mapped to both frontmatter arrays and gbrain links.
`gbrain search` returns meaningful results. `gbrain graph` traverses relationships.
User can inspect imported pages and verify fidelity against Notion.

### Slice 3: Four-Zone Page Structure + Relation-Aware Sync

Implement the four-zone page structure (§5.3) and relation-aware sync (§5.4).

**Scope:** §5 above. Parser changes, sync pipeline changes, reverse-link
reconstruction, relationships zone generation, documentation, tests.

**Acceptance:**
- `splitBody()` returns three zones (compiled_truth, relationships, timeline)
- `gbrain sync` regenerates the relationships zone from frontmatter
- `gbrain sync` populates the `links` table from frontmatter relation arrays
- Reverse-link reconstruction works on import
- Pages with no relations degrade to two-zone format (backwards compatible)
- All existing tests pass, new tests cover three-zone parsing and relation sync

---

## 7. Out of Scope

| Item | Why |
|------|-----|
| Inheritance automation (computing inherited/combined values) | Import takes Notion's current values as-is. Automation is future work. |
| Notion bidirectional sync | Slice 10 in long-range plan |
| Obsidian view layer | Deferred |
| Orchestrator / collectors | Slice 1 in long-range plan |
| Bedrock adapter / typed traversal | Slices 7-8 in long-range plan |
| Cross-source entity resolution | Slice 9 in long-range plan |
| Dream cycle | Deferred |
| `.env.example` / ai-gateway guide | Separate deliverable, can be done in parallel |
