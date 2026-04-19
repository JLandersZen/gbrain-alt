import type { BrainEngine } from './engine.ts';
import type { TitleMap } from './normalize.ts';

const FIELD_TO_LINK_TYPE: Record<string, string> = {
  assigned_projects: 'assigned_project',
  assigned_aors: 'assigned_aor',
  assigned_contexts: 'assigned_context',
  related_people: 'related_person',
  related_events: 'related_event',
  related_resources: 'related_resource',
  related_tasks: 'related_task',
  related_projects: 'related_project',
  related_interests: 'related_interest',
  organizations: 'belongs_to',
  people: 'has_member',
  delegate: 'delegate',
  manager: 'manages',
  supers: 'super',
  subs: 'sub',
  delegated_tasks: 'delegated_task',
  delegated_projects: 'delegated_project',
};

const PARENT_LINK_TYPES: Record<string, string> = {
  contexts: 'parent_context',
  aors: 'parent_aor',
  projects: 'parent_project',
  tasks: 'parent_task',
  organizations: 'parent_org',
};

const NOTION_UUID_RE = /[0-9a-f]{32}/;

export interface RelationLink {
  targetSlug: string;
  linkType: string;
}

export function flattenLinksNesting(fm: Record<string, unknown>): Record<string, unknown> {
  const links = fm.links;
  if (!links || typeof links !== 'object' || Array.isArray(links)) return fm;

  const result = { ...fm };
  delete result.links;
  for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
    if (!(key in result)) {
      result[key] = value;
    }
  }
  return result;
}

function isNotionUuidPath(value: string): boolean {
  return NOTION_UUID_RE.test(value) && value.length > 40;
}

function extractSlugs(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map(v => v.trim());
  }
  return [];
}

export function extractRelations(
  frontmatter: Record<string, unknown>,
  sourceSlug: string,
): RelationLink[] {
  const fm = flattenLinksNesting(frontmatter);
  const links: RelationLink[] = [];

  for (const [field, linkType] of Object.entries(FIELD_TO_LINK_TYPE)) {
    if (!(field in fm)) continue;
    const slugs = extractSlugs(fm[field]);
    for (const slug of slugs) {
      if (isNotionUuidPath(slug)) continue;
      links.push({ targetSlug: slug, linkType });
    }
  }

  if ('parent' in fm) {
    const parentSlugs = extractSlugs(fm.parent);
    const sourceDir = sourceSlug.split('/')[0];
    const parentLinkType = PARENT_LINK_TYPES[sourceDir] || 'parent';
    for (const slug of parentSlugs) {
      if (isNotionUuidPath(slug)) continue;
      links.push({ targetSlug: slug, linkType: parentLinkType });
    }
  }

  return links;
}

export async function syncPageLinks(
  tx: BrainEngine,
  sourceSlug: string,
  relations: RelationLink[],
): Promise<{ added: number; removed: number }> {
  const existingLinks = await tx.getLinks(sourceSlug);
  const newTargets = new Set(relations.map(r => r.targetSlug));

  let removed = 0;
  for (const existing of existingLinks) {
    if (!newTargets.has(existing.to_slug)) {
      await tx.removeLink(sourceSlug, existing.to_slug);
      removed++;
    }
  }

  let added = 0;
  for (const rel of relations) {
    try {
      await tx.addLink(sourceSlug, rel.targetSlug, '', rel.linkType);
      added++;
    } catch {
      // Target page may not exist yet during bulk import — skip silently
    }
  }

  return { added, removed };
}

const DISPLAY_LABELS: Record<string, string> = {
  assigned_projects: 'Assigned Projects',
  assigned_aors: 'Assigned AORs',
  assigned_contexts: 'Assigned Contexts',
  related_people: 'Related People',
  related_events: 'Related Events',
  related_resources: 'Related Resources',
  related_tasks: 'Related Tasks',
  related_projects: 'Related Projects',
  related_interests: 'Related Interests',
  organizations: 'Organizations',
  people: 'People',
  delegate: 'Delegate',
  manager: 'Manager',
  supers: 'Reports To',
  subs: 'Direct Reports',
  delegated_tasks: 'Delegated Tasks',
  delegated_projects: 'Delegated Projects',
  parent: 'Parent',
};

const RELATION_FIELDS_ORDER = [
  'parent',
  'assigned_contexts',
  'assigned_aors',
  'assigned_projects',
  'organizations',
  'people',
  'related_people',
  'related_projects',
  'related_tasks',
  'related_events',
  'related_resources',
  'related_interests',
  'delegate',
  'manager',
  'supers',
  'subs',
  'delegated_tasks',
  'delegated_projects',
];

function slugToTitle(slug: string, titleMap?: TitleMap): string {
  if (titleMap?.bySlug.has(slug)) return titleMap.bySlug.get(slug)!;
  const name = slug.includes('/') ? slug.split('/').pop()! : slug;
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderLink(slug: string, titleMap?: TitleMap): string {
  const title = slugToTitle(slug, titleMap);
  return `[${title}](${slug}.md)`;
}

export function renderRelationshipsZone(
  frontmatter: Record<string, unknown>,
  titleMap?: TitleMap,
): string {
  const fm = flattenLinksNesting(frontmatter);
  const lines: string[] = ['## Relationships'];

  for (const field of RELATION_FIELDS_ORDER) {
    if (!(field in fm)) continue;
    const raw = fm[field];
    if (raw === null || raw === undefined || raw === '') continue;

    const label = DISPLAY_LABELS[field] || field;
    const slugs = typeof raw === 'string' ? [raw.trim()] : Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim())
      : [];

    if (slugs.length === 0) continue;

    const rendered = slugs.map(s => renderLink(s, titleMap)).join(', ');
    lines.push(`- **${label}:** ${rendered}`);
  }

  if (lines.length <= 1) return '';
  return lines.join('\n');
}
