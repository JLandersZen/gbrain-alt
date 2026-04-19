# Guides

Standalone guides broken out from the GBrain Skillpack. Each covers one pattern or workflow.

## Core Patterns

- [Brain-Agent Loop](brain-agent-loop.md) -- The read-write cycle that makes the brain compound daily
- [Brain-First Lookup](brain-first-lookup.md) -- Always check the brain before calling external APIs
- [Brain vs Memory](brain-vs-memory.md) -- When to store info in GBrain vs agent memory vs session context
- [Four-Zone Page Structure](compiled-truth.md) -- Compiled truth + relationships + timeline with sentinel markers
- [Page Types](page-types.md) -- The 9-type PARA+GTD taxonomy: context, aor, project, task, event, resource, interest, person, organization
- [Relations Pipeline](relations-pipeline.md) -- Frontmatter relations to typed links, relationships zone, reverse links, graph traversal
- [Entity Detection](entity-detection.md) -- Auto-scanning every message for entities and original thinking
- [Source Attribution](source-attribution.md) -- Tracing every brain fact to who said it, when, and in what context

## Operational

- [Operational Disciplines](operational-disciplines.md) -- Five non-negotiable rules for a production brain
- [Cron Schedule](cron-schedule.md) -- Reference schedule for 20+ recurring jobs that keep the brain current
- [Live Sync](live-sync.md) -- Keeping the vector index current automatically after markdown changes
- [Quiet Hours](quiet-hours.md) -- Holding notifications during sleep, merging into morning briefing

## Ingestion

- [Meeting Ingestion](meeting-ingestion.md) -- Turning transcripts into brain pages that update all mentioned entities
- [Content and Media](content-media.md) -- Ingesting YouTube, social media, PDFs, and docs into brain pages
- [Import Normalization](import-normalization.md) -- Cleaning Notion exports on import: type fixes, field renames, path resolution, relation extraction
- [Diligence Ingestion](diligence-ingestion.md) -- Converting pitch decks and data rooms into cross-referenced pages
- [Deterministic Collectors](deterministic-collectors.md) -- Separating reliable code tasks from probabilistic LLM judgment

## Knowledge

- [Idea Capture](idea-capture.md) -- Capturing original thinking verbatim with provenance and cross-links
- [Originals Folder](originals-folder.md) -- Storing the user's original frameworks and ideas with exact phrasing
- [Enrichment Pipeline](enrichment-pipeline.md) -- Tiered external-API enrichment scaled by entity importance

## Agent Workflows

- [Executive Assistant](executive-assistant.md) -- Email triage, meeting prep, and scheduling powered by brain context
- [Search Modes](search-modes.md) -- When to use keyword, hybrid, or direct search for optimal lookups
- [Sub-Agent Routing](sub-agent-routing.md) -- Routing sub-agents to the cheapest sufficient model to cut costs 10-40x
- [Skill Development](skill-development.md) -- Turning repeating tasks into durable automated skills

## Infrastructure

- [Local-First Config](local-first-config.md) -- Project-scoped `.gbrain/` with walk-up discovery and global fallback
- [Monorepo Sync](monorepo-sync.md) -- Using `--subdir` to scope sync to a brain directory within a larger repository
- [Repo Architecture](repo-architecture.md) -- Two-repo separation of agent behavior from world knowledge
- [Upgrades and Auto-Update](upgrades-auto-update.md) -- Conversational upgrade notifications and post-upgrade migration
