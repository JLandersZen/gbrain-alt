# Monorepo Sync with --subdir

## What the User Gets

Without `--subdir`, `gbrain sync` indexes the entire git repository. If your brain lives in a subdirectory of a larger monorepo (e.g., `brain/` alongside application code), every markdown file in the repo gets imported, including READMEs, changelogs, and documentation that aren't brain pages.

With `--subdir`, sync scopes to a single directory. Only changes inside that directory are detected, and page slugs are relative to the subdirectory, not the repo root. A file at `brain/people/alice.md` becomes the slug `people/alice`, not `brain/people/alice`.

## Usage

```bash
# Explicit subdir
gbrain sync --repo /path/to/monorepo --subdir brain

# Full reimport of just the subdir
gbrain sync --repo /path/to/monorepo --subdir brain --full

# Dry run (preview what would sync)
gbrain sync --repo /path/to/monorepo --subdir brain --dry-run

# Skip embeddings for large initial imports
gbrain sync --repo /path/to/monorepo --subdir brain --no-embed
```

After the first sync, the repo path and subdir are persisted to config. Subsequent runs need no flags:

```bash
gbrain sync
```

## How It Works

### Path scoping

Sync starts by running `git diff` against the full repository. The `scopeToSubdir()` function then filters the diff output:

1. Only files under the subdirectory are kept
2. The subdirectory prefix is stripped from all paths
3. Renames where the target is outside the subdir are excluded

```
Git diff output:              After scopeToSubdir("brain"):
  A  brain/people/alice.md      A  people/alice.md
  A  config.json                (excluded)
  M  brain/projects/alpha.md    M  projects/alpha.md
  D  brain/tasks/old.md         D  tasks/old.md
  R  brain/x.md -> archive/x.md (excluded - target outside subdir)
```

### File resolution

After scoping, paths are subdir-relative (e.g., `people/alice.md`), but files must be read from disk at the full path. The `fileBase` variable handles this:

| Variable | Value | Purpose |
|----------|-------|---------|
| `repoPath` | `/monorepo` | Git operations (diff, log, pull) |
| `fileBase` | `/monorepo/brain` | Disk reads, title map, auto-extract |
| Manifest paths | `people/alice.md` | Slug derivation, database storage |

A file at path `people/alice.md` in the manifest is read from `/monorepo/brain/people/alice.md` and stored with slug `people/alice`.

### Auto-extract and auto-embed

Both post-sync hooks receive `fileBase`, not `repoPath`. This means:

- **Link extraction** finds files at the correct disk location for wikilink resolution
- **Timeline extraction** reads markdown from the correct path
- **Embedding** operates on database pages (slug-based), so no path issues

Auto-embed is skipped for syncs affecting more than 100 files. Run `gbrain embed --stale` afterward for large imports.

## Configuration

### CLI flags

| Flag | Description |
|------|-------------|
| `--repo <path>` | Repository root (where `.git/` lives) |
| `--subdir <dir>` | Subdirectory to scope to (e.g., `brain`, `data/brain`) |
| `--full` | Full reimport (ignore last synced commit) |
| `--dry-run` | Show changes without applying |
| `--no-embed` | Skip embedding generation |
| `--no-pull` | Skip `git pull` before sync |
| `--no-extract` | Skip auto-link and timeline extraction |

### Persisted config

After the first sync, these keys are saved to the engine's config table:

| Key | Example | Description |
|-----|---------|-------------|
| `sync.repo_path` | `/Users/me/monorepo` | Repository root |
| `sync.subdir` | `brain` | Scoped subdirectory |
| `sync.last_commit` | `a1b2c3d` | Last synced commit SHA |
| `sync.last_run` | `2026-04-19T...` | ISO timestamp of last sync |

CLI flags override persisted config. If you pass `--subdir` on the command line, it takes precedence over the stored value.

### Repo discovery fallback

When no `--repo` flag is given and no `sync.repo_path` is stored, sync checks for a `brain/` directory in the current working directory with its own `.git/`:

```
1. --repo flag           (highest priority)
2. sync.repo_path config
3. ./brain/.git exists   (auto-detect)
4. Error                 (no repo found)
```

This supports the common pattern of a standalone brain repo cloned as a subdirectory.

## Directory Layout Examples

### Monorepo with brain subdirectory

```
monorepo/
  .git/
  src/               # application code (ignored by sync)
  docs/              # project docs (ignored by sync)
  brain/             # <- --subdir targets this
    people/
      alice.md
    projects/
      alpha.md
    tasks/
      weekly-review.md
```

```bash
gbrain sync --repo /path/to/monorepo --subdir brain
```

### Nested subdirectory

```
monorepo/
  .git/
  data/
    brain/           # <- --subdir targets this
      people/
      projects/
```

```bash
gbrain sync --repo /path/to/monorepo --subdir data/brain
```

### Standalone brain repo (no --subdir needed)

```
brain/
  .git/
  people/
  projects/
```

```bash
gbrain sync --repo /path/to/brain
```

## File Filtering

After subdir scoping, the standard syncability filter applies. These files are always excluded regardless of location:

| Pattern | Reason |
|---------|--------|
| Non-`.md`/`.mdx` files | Not brain pages |
| Hidden directories (`.git/`, `.raw/`) | Infrastructure files |
| `README.md`, `index.md`, `schema.md`, `log.md` | Meta files |
| `ops/` directory | Operational logs |

## Interaction with Normalization

When `--subdir` is active, the title map is built from files within the subdirectory only. This means display-name resolution in frontmatter stays scoped to the brain boundary. A file referencing `"Alice Smith"` in its frontmatter will resolve to `people/alice-smith` within the brain, not to some unrelated `alice-smith.md` elsewhere in the monorepo.

See [Import Normalization Pipeline](import-normalization.md) for details on what normalization fixes.

## Transaction Safety

Sync does not wrap the import loop in a database transaction. Each file is imported atomically in its own transaction. This prevents a PGLite deadlock that occurs when nested transactions compete for the same mutex. One file's failure does not roll back other successful imports.

*Part of the [GBrain Skillpack](../GBRAIN_SKILLPACK.md). See also: [Live Sync](live-sync.md), [Local-First Config](local-first-config.md), [Repo Architecture](repo-architecture.md).*
