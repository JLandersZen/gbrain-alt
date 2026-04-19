# Page Types: The PARA+GTD Taxonomy

## Goal

Every brain page has a `type` that determines how it's indexed, searched, and
displayed. GBrain uses a 9-type taxonomy derived from the PARA method
(Projects, Areas, Resources, Archives) and GTD (Getting Things Done). The types
are broad enough to cover any knowledge domain and specific enough to make
search filtering useful.

## The 9 Types

| Type | What it represents | Example directories | Example pages |
|------|-------------------|--------------------|----|
| **context** | A high-level life domain or strategic context. The broadest container. | `contexts/` | `contexts/yc`, `contexts/family`, `contexts/health` |
| **aor** | An area of responsibility. An ongoing commitment with a standard to maintain. | `aors/` | `aors/engineering-hiring`, `aors/investor-relations` |
| **project** | Something being actively built with a defined outcome. Has a repo, spec, or team. | `projects/` | `projects/api-migration`, `projects/gbrain` |
| **task** | A discrete action item with a completion state. | `tasks/` | `tasks/review-q2-budget`, `tasks/ship-v0-12` |
| **event** | A time-bound occurrence. Meetings, deals, conferences, milestones. | `events/`, `deals/`, `meetings/` | `events/2026-04-board-meeting`, `deals/series-a-novatech` |
| **resource** | Reference material. Guides, articles, wiki pages, media, analysis. | `resources/`, `writing/`, `wiki/`, `media/`, `sources/` | `resources/superlinear-returns`, `wiki/architecture/event-sourcing` |
| **interest** | A concept, framework, or topic you track but don't own. Reusable mental models. | `interests/`, `concepts/` | `interests/compounding-knowledge`, `concepts/do-things-that-dont-scale` |
| **person** | A specific human being. | `people/` | `people/sarah-chen`, `people/pedro-franceschi` |
| **organization** | A company, fund, nonprofit, government body, or any institution. | `organizations/`, `companies/` | `organizations/acme-corp`, `companies/ridgeline-ventures` |

### PARA Mapping

The types map to the PARA framework:

- **P (Projects):** `project` and `task`
- **A (Areas):** `context` and `aor`
- **R (Resources):** `resource`, `interest`, `person`, `organization`
- **A (Archives):** Any type can be archived (lifecycle, not a separate type)

The `event` type bridges Projects and Areas. Meetings, deals, and milestones
are time-bound but may belong to a project or recur within an area.

## How Types Are Assigned

### Explicit: frontmatter `type` field

The most reliable method. Set `type:` in YAML frontmatter:

```yaml
---
type: person
title: Sarah Chen
tags: [engineering]
---
```

### Automatic: directory-based inference

When a page has no explicit `type` in frontmatter, GBrain infers it from the
file path. The inference rules check leaf-specific directories first (stronger
signals), then fall back to ancestor directories:

| Directory pattern | Inferred type |
|-------------------|---------------|
| `/writing/`, `/wiki/`, `/media/`, `/sources/`, `/source/` | `resource` |
| `/contexts/` | `context` |
| `/aors/` | `aor` |
| `/projects/`, `/project/` | `project` |
| `/tasks/` | `task` |
| `/events/`, `/deals/`, `/deal/`, `/meetings/` | `event` |
| `/resources/` | `resource` |
| `/interests/`, `/concepts/`, `/concept/` | `interest` |
| `/people/`, `/person/` | `person` |
| `/organizations/`, `/companies/`, `/company/` | `organization` |
| *(no match)* | `resource` (default) |

Leaf-specific directories win over ancestor directories. For example,
`projects/blog/writing/essay.md` infers `resource` (from `/writing/`), not
`project`.

### Import normalization: legacy type conversion

When importing data from Notion or other sources, the normalization pipeline
converts legacy and plural types automatically:

| Input type | Normalized to |
|------------|---------------|
| `contexts` | `context` |
| `aors` | `aor` |
| `projects` | `project` |
| `tasks` | `task` |
| `events` | `event` |
| `resources` | `resource` |
| `interests` | `interest` |
| `people`, `persons` | `person` |
| `organizations` | `organization` |

This conversion is automatic during `gbrain import` and `gbrain sync`. Upstream
types like `company`, `deal`, `concept`, etc. are stored as-is in the database
(the `type` column is unconstrained TEXT) but the TypeScript type union uses the
9 canonical types.

## Disambiguation Rules

When two types seem to fit, apply these tiebreakers:

- **context vs. aor:** A context is a life domain ("family", "YC"). An AOR is a
  specific responsibility within a context ("investor relations" within YC).
  Contexts contain AORs.

- **project vs. task:** A project has multiple tasks, a timeline, and a defined
  outcome. A task is a single action item. If it takes more than a day and
  involves coordination, it's a project.

- **project vs. aor:** A project ends (it ships, it fails, it's cancelled). An
  AOR is ongoing with no end date. "Launch v2" is a project. "Engineering
  hiring" is an AOR.

- **event vs. project:** If it happened at a specific time and is now done, it's
  an event (a meeting, a deal closing, a conference). If it's still in progress,
  it's a project.

- **resource vs. interest:** A resource is specific reference material (a guide,
  an article, an analysis). An interest is a reusable mental model or framework
  ("compounding knowledge", "do things that don't scale"). Could you teach it as
  a standalone concept? Interest. Is it a specific artifact? Resource.

- **person vs. organization:** A page about a human being is always `person`. A
  page about the institution they run is `organization`. Both pages link to each
  other via frontmatter relations.

## Types and the Relationships System

Page types interact with the frontmatter relation fields. Some relations are
type-specific:

| Relation field | Expected on type | Target type |
|----------------|-----------------|-------------|
| `organizations` | `person` | `organization` |
| `people` | `organization` | `person` |
| `assigned_projects` | `task` | `project` |
| `assigned_aors` | `project` | `aor` |
| `assigned_contexts` | `aor`, `project`, `task`, `event` | `context` |
| `supers` / `subs` | `person` | `person` |
| `delegate` / `manager` | `person`, `task` | `person` |
| `parent` | any | same type (hierarchy) |

These relations are extracted from frontmatter during import and stored as typed
links in the knowledge graph. The `<!-- relationships -->` zone is auto-generated
from these links. See [Four-Zone Page Structure](compiled-truth.md) for details.

## The Database Column

The `pages.type` column is unconstrained TEXT in both PGLite and Postgres. The
TypeScript `PageType` union is advisory, not enforced at the database level.
This means:

- Legacy types (`company`, `deal`, `concept`) work at runtime
- Custom types can be stored without schema changes
- The 9-type taxonomy is a convention, not a constraint
- `gbrain list --type person` filters work regardless of how the type was set

## Choosing a Directory Structure

GBrain doesn't enforce directory names. The recommended structure uses plural
forms of the type names:

```
brain/
  contexts/        # type: context
  aors/            # type: aor
  projects/        # type: project
  tasks/           # type: task
  events/          # type: event
  resources/       # type: resource
  interests/       # type: interest
  people/          # type: person
  organizations/   # type: organization
```

Legacy directory names (`companies/`, `deals/`, `concepts/`, `wiki/`, etc.) are
supported by the directory-based inference and will map to the correct type
automatically. You don't need to rename existing directories.

---

*Part of the [GBrain Guides](README.md). See also: [Four-Zone Page Structure](compiled-truth.md), [Recommended Schema](../GBRAIN_RECOMMENDED_SCHEMA.md)*
