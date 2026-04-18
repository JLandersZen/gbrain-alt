# Local-First Configuration

## Goal

Each project gets its own GBrain database and config, isolated from other projects.
No shared global state unless you want it.

## What the User Gets

Without this: every project shares `~/.gbrain/config.json` and `~/.gbrain/brain.pglite`.
Import a work brain and your personal brain search results get polluted. Two worktrees
of the same repo fight over a single database.

With this: `gbrain init` creates `.gbrain/` in the current directory. Each project
has its own config, its own PGLite database, and its own import state. The global
`~/.gbrain/` still works as a fallback.

## How It Works

### Config Discovery

When any `gbrain` command runs, it walks up from the current working directory
looking for `.gbrain/config.json`:

```
/home/user/projects/my-brain/       <- cwd
/home/user/projects/my-brain/.gbrain/config.json   <- found! use this
```

If no project-scoped config is found, it falls back to `~/.gbrain/config.json`.
The walk stops at the user's home directory — it never escapes to `/` or system paths.

```
Discovery order:
  1. ./.gbrain/config.json              (current directory)
  2. ../.gbrain/config.json             (parent)
  3. ../../.gbrain/config.json          (grandparent)
  4. ...                                (continues walking up)
  5. ~/.gbrain/config.json              (global fallback)
```

### Credential Precedence

Environment variables always win over config file values:

```
Priority (highest to lowest):
  1. GBRAIN_DATABASE_URL / DATABASE_URL    (env var)
  2. OPENAI_API_KEY                        (env var)
  3. .gbrain/config.json values            (project or global)
```

This means you can set API keys in your shell profile and they apply everywhere,
while each project keeps its own database path and engine choice.

## Usage

### New project (default — local)

```bash
cd ~/projects/my-brain
gbrain init                     # creates .gbrain/ here
gbrain import ./notes/
gbrain query "what themes emerge?"
```

This creates:
```
my-brain/
├── .gbrain/
│   ├── config.json             # engine: pglite, database_path
│   └── brain.pglite/           # embedded Postgres database
├── .gitignore                  # .gbrain/ added automatically
└── notes/
    └── ...
```

### Global brain (old behavior)

```bash
gbrain init --global            # creates ~/.gbrain/
```

Use `--global` when you want one brain shared across all directories — the v0.6
behavior. Commands run from any directory will find `~/.gbrain/config.json` via
the fallback.

### Multiple projects, isolated databases

```bash
cd ~/work/project-a && gbrain init
cd ~/work/project-b && gbrain init
```

Each project has its own PGLite database. Imports, searches, and page data are
fully isolated. No cross-contamination.

### Verify which config is active

```bash
gbrain config show              # prints the resolved config path
```

## What Goes Where

| Scope | Location | When to use |
|-------|----------|-------------|
| **Project-local** | `./.gbrain/` | Default. Per-project isolation. |
| **Global** | `~/.gbrain/` | Shared brain, or commands with no project context. |

Commands that are inherently global (upgrade state, integration heartbeats) always
use `~/.gbrain/` regardless of local config. Per-brain data (config, database,
import checkpoints) uses the discovered config directory.

| Data | Uses project config | Uses global config |
|------|--------------------|--------------------|
| `config.json` | Yes | Fallback |
| `brain.pglite` | Yes | Fallback |
| Import checkpoints | Yes | — |
| Migration manifests | — | Yes |
| Integration heartbeats | — | Yes |
| Upgrade state | — | Yes |

## .gitignore

`gbrain init` (without `--global`) automatically adds `.gbrain/` to the project's
`.gitignore`. The database and config contain local paths and should not be committed.

If `.gitignore` already exists and already contains `.gbrain/`, no change is made.
If `.gitignore` does not exist, one is created with `.gbrain/` as the only entry.

## Programmatic API

For scripts and tests that need to control config discovery:

```typescript
import {
  configDir,        // returns resolved config path (project or global)
  configPath,       // returns resolved config.json path
  globalConfigDir,  // always returns ~/.gbrain/
  setConfigDir,     // override discovery (for tests)
  resetConfigDir,   // clear override, re-discover on next call
  loadConfig,       // load + merge config with env var precedence
  saveConfig,       // write config to resolved directory
} from 'gbrain';
```

`setConfigDir()` and `resetConfigDir()` are primarily for tests. In production,
discovery runs automatically based on `process.cwd()`.

---

*Part of the [GBrain Skillpack](../GBRAIN_SKILLPACK.md). See also:
[Engines](../ENGINES.md), [Repo Architecture](repo-architecture.md).*
