import matter from 'gray-matter';
import type { PageType } from './types.ts';
import { slugifyPath } from './sync.ts';
import { normalizeType, type TitleMap } from './normalize.ts';

const FIELD_RENAMES: Record<string, string> = {
  _events: 'related_events',
  parent_page: 'parent',
};

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  compiled_truth: string;
  relationships: string;
  timeline: string;
  slug: string;
  type: PageType;
  title: string;
  tags: string[];
}

/**
 * Parse a markdown file with YAML frontmatter into its components.
 *
 * Four-zone structure:
 *   ---
 *   type: resource
 *   title: Do Things That Don't Scale
 *   tags: [startups, growth]
 *   assigned_aors: [aors/engineering]
 *   ---
 *   Compiled truth content here...
 *   ---
 *   ## Relationships
 *   - **Assigned AORs:** [Engineering](aors/engineering.md)
 *   ---
 *   Timeline content here...
 *
 * The first --- pair is YAML frontmatter (handled by gray-matter).
 * After frontmatter, the body is split at standalone --- separators:
 *   Two separators → compiled_truth, relationships, timeline
 *   One separator  → compiled_truth, timeline (relationships empty)
 *   No separator   → compiled_truth only
 */
export function parseMarkdown(content: string, filePath?: string): ParsedMarkdown {
  const { data: frontmatter, content: body } = matter(content);

  // Split body at standalone --- separators
  const { compiled_truth, relationships, timeline } = splitBody(body);

  // Normalize type: singularize plurals, lowercase
  let rawType = (frontmatter.type as string) || '';
  if (rawType) {
    rawType = normalizeType(rawType).normalized;
  }
  const type = (rawType as PageType) || inferType(filePath);
  const title = (frontmatter.title as string) || inferTitle(filePath);
  const tags = extractTags(frontmatter);
  const slug = (frontmatter.slug as string) || inferSlug(filePath);

  // Rename known fields (e.g. _events → related_events, parent_page → parent)
  for (const [oldName, newName] of Object.entries(FIELD_RENAMES)) {
    if (oldName in frontmatter && !(newName in frontmatter)) {
      frontmatter[newName] = frontmatter[oldName];
    }
    delete frontmatter[oldName];
  }

  // Remove processed fields from frontmatter (they're stored as columns)
  const cleanFrontmatter = { ...frontmatter };
  delete cleanFrontmatter.type;
  delete cleanFrontmatter.title;
  delete cleanFrontmatter.tags;
  delete cleanFrontmatter.slug;

  return {
    frontmatter: cleanFrontmatter,
    compiled_truth: compiled_truth.trim(),
    relationships: relationships.trim(),
    timeline: timeline.trim(),
    slug,
    type,
    title,
    tags,
  };
}

/**
 * Split body content at standalone --- separators.
 *
 * Two separators → { compiled_truth, relationships, timeline }
 * One separator  → { compiled_truth, relationships: '', timeline }
 * No separator   → { compiled_truth, relationships: '', timeline: '' }
 */
export function splitBody(body: string): { compiled_truth: string; relationships: string; timeline: string } {
  const lines = body.split('\n');
  const separators: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      separators.push(i);
    }
  }

  if (separators.length === 0) {
    return { compiled_truth: body, relationships: '', timeline: '' };
  }

  if (separators.length === 1) {
    const compiled_truth = lines.slice(0, separators[0]).join('\n');
    const timeline = lines.slice(separators[0] + 1).join('\n');
    return { compiled_truth, relationships: '', timeline };
  }

  // Two or more separators: first split = end of compiled_truth,
  // second split = end of relationships
  const compiled_truth = lines.slice(0, separators[0]).join('\n');
  const relationships = lines.slice(separators[0] + 1, separators[1]).join('\n');
  const timeline = lines.slice(separators[1] + 1).join('\n');
  return { compiled_truth, relationships, timeline };
}

/**
 * Serialize a page back to markdown format.
 * Produces: frontmatter + compiled_truth [+ --- + relationships] + --- + timeline
 * Omits the relationships zone if empty (backwards compatible two-zone format).
 */
export function serializeMarkdown(
  frontmatter: Record<string, unknown>,
  compiled_truth: string,
  timeline: string,
  meta: { type: PageType; title: string; tags: string[]; relationships?: string },
): string {
  // Build full frontmatter including type, title, tags
  const fullFrontmatter: Record<string, unknown> = {
    type: meta.type,
    title: meta.title,
    ...frontmatter,
  };
  if (meta.tags.length > 0) {
    fullFrontmatter.tags = meta.tags;
  }

  const yamlContent = matter.stringify('', fullFrontmatter).trim();

  const relationships = meta.relationships || '';

  let body = compiled_truth;
  if (relationships) {
    body += '\n\n---\n\n' + relationships + '\n\n---\n\n' + timeline;
  } else if (timeline) {
    body += '\n\n---\n\n' + timeline;
  }

  return yamlContent + '\n\n' + body + '\n';
}

function inferType(filePath?: string): PageType {
  if (!filePath) return 'resource';

  const lower = ('/' + filePath).toLowerCase();
  if (lower.includes('/contexts/')) return 'context';
  if (lower.includes('/aors/')) return 'aor';
  if (lower.includes('/projects/') || lower.includes('/project/')) return 'project';
  if (lower.includes('/tasks/')) return 'task';
  if (lower.includes('/events/')) return 'event';
  if (lower.includes('/resources/')) return 'resource';
  if (lower.includes('/interests/')) return 'interest';
  if (lower.includes('/people/') || lower.includes('/person/')) return 'person';
  if (lower.includes('/organizations/')) return 'organization';
  return 'resource';
}

function inferTitle(filePath?: string): string {
  if (!filePath) return 'Untitled';

  // Extract filename without extension, convert dashes/underscores to spaces
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1]?.replace(/\.md$/i, '') || 'Untitled';
  return filename.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function inferSlug(filePath?: string): string {
  if (!filePath) return 'untitled';
  return slugifyPath(filePath);
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}
