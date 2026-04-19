import matter from 'gray-matter';
import type { PageType } from './types.ts';
import { slugifyPath } from './sync.ts';

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
 * Structure:
 *   ---
 *   type: concept
 *   title: Do Things That Don't Scale
 *   tags: [startups, growth]
 *   ---
 *   Compiled truth content here...
 *
 *   <!-- relationships -->
 *   Relationships zone here...
 *
 *   <!-- timeline -->
 *   Timeline content here...
 *
 * Four-zone page structure using sentinel-based splitting:
 *   Zone 1: compiled_truth (main content)
 *   Zone 2: relationships (auto-generated from frontmatter relations)
 *   Zone 3: timeline (append-only evidence log)
 *
 * Sentinel precedence:
 *   Relationships: `<!-- relationships -->` or `<!--relationships-->`
 *   Timeline: `<!-- timeline -->` (preferred), `--- timeline ---` (decorated),
 *     or `---` immediately preceding `## Timeline`/`## History` heading
 *
 * A bare `---` in body text is a markdown horizontal rule, not a separator.
 */
export function parseMarkdown(content: string, filePath?: string): ParsedMarkdown {
  const { data: frontmatter, content: body } = matter(content);

  const { compiled_truth, relationships, timeline } = splitBody(body);

  // Extract metadata from frontmatter
  const type = (frontmatter.type as PageType) || inferType(filePath);
  const title = (frontmatter.title as string) || inferTitle(filePath);
  const tags = extractTags(frontmatter);
  const slug = (frontmatter.slug as string) || inferSlug(filePath);

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

export interface SplitResult {
  compiled_truth: string;
  relationships: string;
  timeline: string;
}

/**
 * Split body content into up to three zones using sentinel markers.
 *
 * Zone 1 (compiled_truth): everything before the first sentinel
 * Zone 2 (relationships):  between `<!-- relationships -->` and timeline sentinel
 * Zone 3 (timeline):       after the timeline sentinel
 *
 * Recognized sentinels:
 *   Relationships: `<!-- relationships -->` or `<!--relationships-->`
 *   Timeline: `<!-- timeline -->` (preferred), `--- timeline ---` (decorated),
 *     or `---` ONLY when the next non-empty line is `## Timeline`/`## History`
 *
 * A plain `---` line is a markdown horizontal rule, NOT a zone separator.
 * Treating bare `---` as a separator caused 83% content truncation on wiki corpora.
 */
export function splitBody(body: string): SplitResult {
  const lines = body.split('\n');

  const timeIdx = findTimelineSplitIndex(lines, 0);
  const relIdx = findRelationshipsSplitIndex(lines, timeIdx);

  if (relIdx === -1 && timeIdx === -1) {
    return { compiled_truth: body, relationships: '', timeline: '' };
  }

  if (relIdx !== -1 && timeIdx !== -1) {
    const compiled_truth = lines.slice(0, relIdx).join('\n');
    const relationships = lines.slice(relIdx + 1, timeIdx).join('\n');
    const timeline = lines.slice(timeIdx + 1).join('\n');
    return { compiled_truth, relationships, timeline };
  }

  if (relIdx !== -1) {
    const compiled_truth = lines.slice(0, relIdx).join('\n');
    const relationships = lines.slice(relIdx + 1).join('\n');
    return { compiled_truth, relationships, timeline: '' };
  }

  // timeIdx !== -1
  const compiled_truth = lines.slice(0, timeIdx).join('\n');
  const timeline = lines.slice(timeIdx + 1).join('\n');
  return { compiled_truth, relationships: '', timeline };
}

function findRelationshipsSplitIndex(lines: string[], beforeIndex: number): number {
  const limit = beforeIndex === -1 ? lines.length : beforeIndex;
  for (let i = 0; i < limit; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '<!-- relationships -->' || trimmed === '<!--relationships-->') {
      return i;
    }
  }
  return -1;
}

function findTimelineSplitIndex(lines: string[], startFrom: number): number {
  for (let i = startFrom; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '<!-- timeline -->' || trimmed === '<!--timeline-->') {
      return i;
    }

    if (trimmed === '--- timeline ---' || /^---\s+timeline\s+---$/i.test(trimmed)) {
      return i;
    }

    if (trimmed === '---') {
      const beforeContent = lines.slice(0, i).join('\n').trim();
      if (beforeContent.length === 0) continue;

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.length === 0) continue;
        if (/^##\s+(timeline|history)\b/i.test(next)) return i;
        break;
      }
    }
  }
  return -1;
}

export const RELATIONSHIPS_SENTINEL = '<!-- relationships -->';
export const TIMELINE_SENTINEL = '<!-- timeline -->';

/**
 * Serialize a page back to markdown format.
 * Produces: frontmatter + compiled_truth + [relationships] + [timeline]
 *
 * When a relationships zone is present, it's preceded by `<!-- relationships -->`.
 * When a timeline zone is present, it's preceded by `<!-- timeline -->`.
 */
export function serializeMarkdown(
  frontmatter: Record<string, unknown>,
  compiled_truth: string,
  timeline: string,
  meta: { type: PageType; title: string; tags: string[] },
  relationships?: string,
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

  let body = compiled_truth;
  if (relationships) {
    body += '\n\n' + RELATIONSHIPS_SENTINEL + '\n\n' + relationships;
  }
  if (timeline) {
    body += '\n\n' + TIMELINE_SENTINEL + '\n\n' + timeline;
  }

  return yamlContent + '\n\n' + body + '\n';
}

function inferType(filePath?: string): PageType {
  if (!filePath) return 'resource';

  // Normalize: add leading / for consistent matching.
  // Leaf-specific directories checked FIRST — they're stronger signals than
  // ancestor directories. e.g. `projects/blog/writing/essay.md` is a resource
  // (writing), not a project page.
  const lower = ('/' + filePath).toLowerCase();
  if (lower.includes('/writing/') || lower.includes('/wiki/') || lower.includes('/media/') || lower.includes('/sources/') || lower.includes('/source/')) return 'resource';
  if (lower.includes('/contexts/')) return 'context';
  if (lower.includes('/aors/')) return 'aor';
  if (lower.includes('/projects/') || lower.includes('/project/')) return 'project';
  if (lower.includes('/tasks/')) return 'task';
  if (lower.includes('/events/') || lower.includes('/deals/') || lower.includes('/deal/') || lower.includes('/meetings/')) return 'event';
  if (lower.includes('/resources/')) return 'resource';
  if (lower.includes('/interests/') || lower.includes('/concepts/') || lower.includes('/concept/')) return 'interest';
  if (lower.includes('/people/') || lower.includes('/person/')) return 'person';
  if (lower.includes('/organizations/') || lower.includes('/companies/') || lower.includes('/company/')) return 'organization';
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
