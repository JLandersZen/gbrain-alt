# Migrate Skill

Universal migration from any wiki, note tool, or brain system into GBrain.

## Supported Sources

| Source | Format | Strategy |
|--------|--------|----------|
| Obsidian | Markdown + `[[wikilinks]]` | Direct import, convert wikilinks to gbrain links |
| Notion | Exported markdown or CSV | Parse Notion's export structure |
| Logseq | Markdown with `((block refs))` | Convert block refs to page links |
| Plain markdown | Any .md directory | Import directory into gbrain directly |
| CSV | Tabular data | Map columns to frontmatter fields |
| JSON | Structured data | Map keys to page fields |
| Roam | JSON export | Convert block structure to pages |

## Prerequisites

Before migrating, verify gbrain is set up. If any of these fail, run the
**setup skill** (`skills/setup/SKILL.md`) first — it handles init, API key
discovery, AGENTS.md injection, and health verification.

1. **gbrain is initialized.** Run `gbrain doctor --json`. If it fails with
   "no config found" or connection errors, gbrain hasn't been set up yet.
2. **API keys are available.** Check that `OPENAI_API_KEY` is set in the
   environment before starting any embedding work. Without it, keyword search
   works but semantic search and `gbrain embed` will fail. Do NOT start
   embeddings in the background without confirming the key exists first.
3. **Output directory is permanent.** Migration output goes in `brain/` (at the
   project root), not `tmp/` or any ephemeral location. These files are the
   source of truth alongside the database — they must be committed to git.
   Do NOT create the entity subdirectories in advance; the migration creates
   them as needed based on the imported data.

## General Workflow

1. **Assess the source.** What format? How many files? What structure?
2. **Plan the mapping.** How do source fields map to gbrain fields (type, title, tags, compiled_truth, timeline)?
3. **Test with a sample.** Import 5-10 files, verify by reading them back from gbrain and exporting.
4. **Bulk import.** Import the full directory into gbrain. Output to `brain/` at the project root.
5. **Verify.** Check gbrain health and statistics, spot-check pages.
6. **Build links.** Extract cross-references from content and create typed links in gbrain.

## Obsidian Migration

1. Import the vault directory into gbrain (Obsidian vaults are markdown directories)
2. Convert `[[wikilinks]]` to gbrain links:
   - Read each page from gbrain
   - For each `[[Name]]` found, resolve to a slug and create a link in gbrain
   - `[[Name|alias]]` uses the alias for context

Obsidian-specific:
- Tags (`#tag`) become gbrain tags
- Frontmatter properties map to gbrain frontmatter
- Attachments (images, PDFs) are noted but handled separately via file storage

## Notion Migration

1. Export from Notion: Settings > Export > Markdown & CSV
2. Notion exports nested directories with UUIDs in filenames
3. Strip UUIDs from filenames for clean slugs
4. **Convert `---` horizontal rules to `***` in the exported files before
   importing.** Notion exports use `---` as HRs, but GBrain uses `---` as
   the zone separator (compiled truth / relationships / timeline). Run a
   find-and-replace across the export directory before `gbrain import`:
   `find <export-dir> -name '*.md' -exec sed -i '' 's/^---$/***/' {} +`
5. **Watch for truncated titles.** Notion truncates long page titles in export
   filenames and CSV columns. When building relations between pages, resolve
   by matching against the full title from the page content, not the filename.
   If a relation reference doesn't resolve, search for partial matches before
   giving up.
5. Map Notion's database properties to frontmatter
6. **Handle slug collisions.** If two Notion pages produce the same slug
   (same title, different UUIDs), investigate before appending a `-2` suffix.
   They may be genuine duplicates worth merging. Check page content and
   properties to decide.
7. Import the cleaned directory into gbrain. Output to `brain/` at the
   project root: `gbrain import brain/ --no-embed`
8. **Reverse-link reconstruction.** Notion exports are one-sided — if Task A
   references Project X, Project X does NOT list Task A. The import pipeline
   automatically reconstructs reverse relations (e.g., adds `tasks: [tasks/a]`
   to Project X's frontmatter). This happens in the post-import pass.
9. **Relationships zone.** After import, each page with frontmatter relations
   gets a `## Relationships` zone with clickable markdown links. This is
   auto-generated — do not hand-edit it. Run `gbrain embed --stale` after
   verifying the import looks correct.

## CSV Migration

For tabular data (e.g., CRM exports, contact lists):
1. For each row in the CSV, create a page with column values as frontmatter
2. Use a designated column as the slug (e.g., name)
3. Use another column as compiled_truth (e.g., notes)
4. Store each page in gbrain

## Post-Migration: Update Agent Config

After a successful migration, update the project's AGENTS.md (or CLAUDE.md) to
reflect that gbrain is now the source of truth. Add or update these sections:

1. **gbrain is SoR.** The `brain/` directory and the gbrain database together
   are the knowledge base. Pages in `brain/` are permanent, version-controlled
   markdown — not ephemeral intermediates.
2. **Brain-first lookup.** For any entity question, check gbrain before grep.
   (See setup skill Phase D for the full lookup protocol.)
3. **Sync-after-write.** After creating or updating any brain page, run
   `gbrain sync --no-pull --no-embed` to keep the index current.

## Verification

After any migration:
1. Check gbrain statistics to verify page count matches source
2. Check gbrain health for orphans and missing embeddings
3. Export pages from gbrain for round-trip verification
4. Spot-check 5-10 pages by reading them from gbrain
5. Test search: search gbrain for "someone you know is in the data"

## Tools Used

- Store/update pages in gbrain (put_page)
- Read pages from gbrain (get_page)
- Link entities in gbrain (add_link)
- Tag pages in gbrain (add_tag)
- Get gbrain statistics (get_stats)
- Check gbrain health (get_health)
- Search gbrain (query)
