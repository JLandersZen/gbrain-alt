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

const FRONTMATTER_LINK_TYPES = new Set([
  ...Object.values(FIELD_TO_LINK_TYPE),
  ...Object.values(PARENT_LINK_TYPES),
  'parent',
]);

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
  const newTargets = new Set(relations.map(r => `${r.targetSlug}\u0000${r.linkType}`));

  let removed = 0;
  for (const existing of existingLinks) {
    if (!FRONTMATTER_LINK_TYPES.has(existing.link_type)) continue;
    const key = `${existing.to_slug}\u0000${existing.link_type}`;
    if (!newTargets.has(key)) {
      await tx.removeLink(sourceSlug, existing.to_slug, existing.link_type);
      removed++;
    }
  }

  let added = 0;
  for (const rel of relations) {
    try {
      await tx.addLink(sourceSlug, rel.targetSlug, '', rel.linkType);
      added++;
    } catch {
      // Target page may not exist yet during bulk import
    }
  }

  return { added, removed };
}

const REVERSE_MAP: Record<string, Record<string, string>> = {
  assigned_projects: { tasks: 'tasks' },
  assigned_aors: { projects: 'projects' },
  assigned_contexts: {
    aors: 'aors',
    projects: 'projects',
    tasks: 'tasks',
    events: 'events',
  },
  related_people: {
    tasks: 'related_tasks',
    events: 'related_events',
    resources: 'related_resources',
    projects: 'related_projects',
    interests: 'related_interests',
  },
  related_tasks: {
    events: 'related_events',
    resources: 'related_resources',
    people: 'related_people',
  },
  related_events: {
    tasks: 'related_tasks',
    resources: 'related_resources',
    people: 'related_people',
    projects: 'related_projects',
  },
  related_resources: {
    tasks: 'related_tasks',
    events: 'related_events',
    people: 'related_people',
    projects: 'related_projects',
    interests: 'related_interests',
  },
  related_interests: {
    resources: 'related_resources',
    people: 'related_people',
    events: 'related_events',
  },
  related_projects: {
    people: 'related_people',
  },
  delegate: { tasks: 'delegated_tasks', projects: 'delegated_projects' },
  organizations: { people: 'people' },
  people: { organizations: 'organizations' },
  supers: { people: 'subs' },
};

const PARENT_REVERSE: Record<string, string> = {
  organizations: 'children',
};

export interface ReverseChange {
  slug: string;
  patches: Record<string, string[]>;
}

export function reconstructReverseLinks(
  pages: { slug: string; frontmatter: Record<string, unknown> }[],
): ReverseChange[] {
  const reverseIndex = new Map<string, { field: string; slug: string }[]>();

  function addReverse(targetSlug: string, field: string, sourceSlug: string) {
    if (targetSlug === sourceSlug) return;
    if (!reverseIndex.has(targetSlug)) reverseIndex.set(targetSlug, []);
    reverseIndex.get(targetSlug)!.push({ field, slug: sourceSlug });
  }

  for (const page of pages) {
    const fm = flattenLinksNesting(page.frontmatter);
    const sourceDir = page.slug.split('/')[0];

    for (const [forwardField, dirMap] of Object.entries(REVERSE_MAP)) {
      if (!(forwardField in fm)) continue;
      const reverseField = dirMap[sourceDir];
      if (!reverseField) continue;

      const slugs = extractSlugs(fm[forwardField]);
      for (const targetSlug of slugs) {
        if (isNotionUuidPath(targetSlug)) continue;
        addReverse(targetSlug, reverseField, page.slug);
      }
    }

    if ('parent' in fm) {
      const reverseField = PARENT_REVERSE[sourceDir];
      if (reverseField) {
        const parentSlugs = extractSlugs(fm.parent);
        for (const targetSlug of parentSlugs) {
          if (isNotionUuidPath(targetSlug)) continue;
          addReverse(targetSlug, reverseField, page.slug);
        }
      }
    }
  }

  const pageMap = new Map(pages.map(p => [p.slug, p.frontmatter]));
  const changes: ReverseChange[] = [];

  for (const [targetSlug, entries] of reverseIndex) {
    const targetFm = pageMap.get(targetSlug);
    if (!targetFm) continue;

    const flatFm = flattenLinksNesting(targetFm);
    const byField = new Map<string, Set<string>>();
    for (const { field, slug } of entries) {
      if (!byField.has(field)) byField.set(field, new Set());
      byField.get(field)!.add(slug);
    }

    const patches: Record<string, string[]> = {};
    let changed = false;

    for (const [field, sourceSlugs] of byField) {
      const existing = new Set(extractSlugs(flatFm[field]));
      const toAdd: string[] = [];
      for (const slug of sourceSlugs) {
        if (!existing.has(slug)) toAdd.push(slug);
      }
      if (toAdd.length > 0) {
        patches[field] = [...existing, ...toAdd].sort();
        changed = true;
      }
    }

    if (changed) {
      changes.push({ slug: targetSlug, patches });
    }
  }

  return changes;
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
  tasks: 'Tasks',
  projects: 'Projects',
  aors: 'AORs',
  events: 'Events',
  children: 'Children',
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
  'tasks',
  'projects',
  'aors',
  'events',
  'children',
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
