import matter from 'gray-matter';
import type { PageType } from './types.ts';

export interface NormalizeIssue {
  file: string;
  line: number;
  rule: 'plural-type' | 'field-rename' | 'display-name-relation' | 'notion-path' | 'notion-url' | 'links-nesting';
  message: string;
  fixable: boolean;
}

export interface NormalizeResult {
  content: string;
  issues: NormalizeIssue[];
  changed: boolean;
}

export interface TitleMap {
  exact: Map<string, string>;
  loose: Map<string, string>;
  bySlug: Map<string, string>;
}

const PLURAL_TO_SINGULAR: Record<string, PageType> = {
  contexts: 'context',
  aors: 'aor',
  projects: 'project',
  tasks: 'task',
  events: 'event',
  resources: 'resource',
  interests: 'interest',
  people: 'person',
  persons: 'person',
  organizations: 'organization',
};

const FIELD_RENAMES: Record<string, string> = {
  _events: 'related_events',
  parent_page: 'parent',
};

const RELATION_FIELD_DIRS: Record<string, string> = {
  assigned_projects: 'projects',
  assigned_aors: 'aors',
  assigned_contexts: 'contexts',
  related_people: 'people',
  related_events: 'events',
  related_resources: 'resources',
  related_tasks: 'tasks',
  related_projects: 'projects',
  organizations: 'organizations',
  people: 'people',
  delegate: 'people',
  manager: 'people',
  supers: 'people',
  subs: 'people',
  delegated_tasks: 'tasks',
  delegated_projects: 'projects',
};

const SINGLE_VALUED = new Set(['delegate', 'manager']);

const BRAIN_DIRS = new Set([
  'contexts', 'aors', 'projects', 'tasks', 'events',
  'resources', 'interests', 'people', 'organizations',
]);

const NOTION_DIR_MAP: Record<string, string> = {
  people: 'people',
  projects: 'projects',
  tasks: 'tasks',
  events: 'events',
  resources: 'resources',
  aors: 'aors',
  contexts: 'contexts',
  organizations: 'organizations',
  interests: 'interests',
};

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildTitleMap(pages: { title: string; slug: string }[]): TitleMap {
  const exact = new Map<string, string>();
  const loose = new Map<string, string>();
  const bySlug = new Map<string, string>();
  for (const { title, slug } of pages) {
    const lower = title.toLowerCase();
    const dir = slug.split('/')[0];
    exact.set(`${dir}:${lower}`, slug);
    if (!loose.has(lower)) {
      loose.set(lower, slug);
    }
    bySlug.set(slug, title);
  }
  return { exact, loose, bySlug };
}

function resolveTitle(name: string, targetDir: string, titleMap: TitleMap): string {
  const lower = name.toLowerCase();
  if (targetDir) {
    const scoped = titleMap.exact.get(`${targetDir}:${lower}`);
    if (scoped) return scoped;
  }
  const loose = titleMap.loose.get(lower);
  if (loose) return loose;
  if (targetDir) return `${targetDir}/${slugifyTitle(name)}`;
  return slugifyTitle(name);
}

function looksLikeSlugPath(value: string): boolean {
  const slash = value.indexOf('/');
  if (slash < 1) return false;
  const prefix = value.slice(0, slash);
  return BRAIN_DIRS.has(prefix);
}

function resolveDisplayName(
  displayName: string,
  targetDir: string,
  titleMap: TitleMap,
): string {
  if (looksLikeSlugPath(displayName)) return displayName;
  return resolveTitle(displayName.trim(), targetDir, titleMap);
}

function normalizeRelationValue(
  value: unknown,
  targetDir: string,
  titleMap: TitleMap,
  isSingle: boolean,
): unknown {
  if (value === null || value === undefined || value === '') {
    return isSingle ? undefined : [];
  }
  if (typeof value === 'string') {
    const resolved = resolveDisplayName(value, targetDir, titleMap);
    return isSingle ? resolved : [resolved];
  }
  if (Array.isArray(value)) {
    const resolved = value
      .map(v => (typeof v === 'string' ? resolveDisplayName(v, targetDir, titleMap) : v))
      .filter(v => v !== '' && v !== null && v !== undefined);
    return isSingle ? resolved[0] ?? undefined : resolved;
  }
  return value;
}

function inferDirFromPath(filePath: string): string {
  const segments = filePath.split('/');
  for (const seg of segments) {
    if (BRAIN_DIRS.has(seg)) return seg;
  }
  return '';
}

export function normalizeType(typeVal: string): { normalized: string; changed: boolean } {
  const lower = typeVal.toLowerCase().trim();
  const singular = PLURAL_TO_SINGULAR[lower];
  if (singular) return { normalized: singular, changed: true };
  if (lower !== typeVal) return { normalized: lower, changed: true };
  return { normalized: typeVal, changed: false };
}

export function normalizeFrontmatter(
  fm: Record<string, unknown>,
  filePath: string,
  titleMap: TitleMap,
): { fixed: Record<string, unknown>; issues: NormalizeIssue[] } {
  const issues: NormalizeIssue[] = [];
  let result = { ...fm };

  const links = result.links;
  if (links && typeof links === 'object' && !Array.isArray(links)) {
    const nested = links as Record<string, unknown>;
    const lifted = Object.keys(nested);
    for (const key of lifted) {
      if (!(key in result)) {
        result[key] = nested[key];
      }
    }
    delete result.links;
    if (lifted.length > 0) {
      issues.push({
        file: filePath, line: 1, rule: 'links-nesting',
        message: `flattened links: { ${lifted.join(', ')} } to top-level`,
        fixable: true,
      });
    }
  }

  if (typeof result.type === 'string') {
    const { normalized, changed } = normalizeType(result.type);
    if (changed) {
      issues.push({
        file: filePath, line: 1, rule: 'plural-type',
        message: `type "${result.type}" → "${normalized}"`,
        fixable: true,
      });
      result.type = normalized;
    }
  }

  for (const [oldName, newName] of Object.entries(FIELD_RENAMES)) {
    if (oldName in result) {
      issues.push({
        file: filePath, line: 1, rule: 'field-rename',
        message: `field "${oldName}" → "${newName}"`,
        fixable: true,
      });
      if (!(newName in result)) {
        result[newName] = result[oldName];
      }
      delete result[oldName];
    }
  }

  for (const [field, targetDir] of Object.entries(RELATION_FIELD_DIRS)) {
    if (!(field in result) || result[field] === undefined) continue;

    const oldVal = result[field];
    const isSingle = SINGLE_VALUED.has(field);
    const resolved = normalizeRelationValue(oldVal, targetDir, titleMap, isSingle);

    if (JSON.stringify(oldVal) !== JSON.stringify(resolved)) {
      issues.push({
        file: filePath, line: 1, rule: 'display-name-relation',
        message: `"${field}": display name → slug path`,
        fixable: true,
      });
      result[field] = resolved;
    }
  }

  if ('parent' in result && typeof result.parent === 'string') {
    const parentVal = result.parent;
    if (!parentVal.includes('/')) {
      const pageDir = inferDirFromPath(filePath);
      if (pageDir) {
        const resolved = resolveDisplayName(parentVal, pageDir, titleMap);
        if (resolved !== parentVal) {
          issues.push({
            file: filePath, line: 1, rule: 'display-name-relation',
            message: `"parent": "${parentVal}" → "${resolved}"`,
            fixable: true,
          });
          result.parent = resolved;
        }
      }
    }
  }

  return { fixed: result, issues };
}

export function parseNotionPath(rawPath: string): { dir: string; name: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath).replace(/\.md$/, '');
  } catch {
    return null;
  }

  const uuidMatch = decoded.match(/\s([0-9a-f]{32})$/);
  if (!uuidMatch) return null;

  let nameAndDir = decoded.slice(0, uuidMatch.index!);
  if (nameAndDir.startsWith('../')) nameAndDir = nameAndDir.slice(3);

  const lastSlash = nameAndDir.lastIndexOf('/');
  if (lastSlash >= 0) {
    const firstSlash = nameAndDir.indexOf('/');
    const topDir = nameAndDir.slice(0, firstSlash);
    const name = nameAndDir.slice(lastSlash + 1);
    return { dir: NOTION_DIR_MAP[topDir.toLowerCase()] || topDir.toLowerCase(), name: name.trim() };
  }

  return { dir: '', name: nameAndDir.trim() };
}

export function normalizeBody(
  body: string,
  filePath: string,
  titleMap: TitleMap,
): { fixed: string; issues: NormalizeIssue[] } {
  const issues: NormalizeIssue[] = [];
  let fixed = body;
  let pathCount = 0;
  let urlCount = 0;

  fixed = fixed.replace(
    /\(\.\.\/[^)]+?[0-9a-f]{32}[^)]*\.md\)/g,
    (match) => {
      const path = match.slice(1, -1);
      const parsed = parseNotionPath(path);
      if (!parsed) return match;
      const slug = resolveTitle(parsed.name, parsed.dir, titleMap);
      pathCount++;
      return `(${slug}.md)`;
    },
  );

  const currentDir = inferDirFromPath(filePath);
  fixed = fixed.replace(
    /\((?!\.\.\/)([^)]+?[0-9a-f]{32}[^)]*\.md)\)/g,
    (match, path) => {
      if (path.startsWith('http')) return match;
      const parsed = parseNotionPath(path);
      if (!parsed) return match;
      const dir = parsed.dir || currentDir;
      if (!dir) return match;
      const slug = resolveTitle(parsed.name, dir, titleMap);
      pathCount++;
      return `(${slug}.md)`;
    },
  );

  const urlMatches = fixed.match(/\s*\(https:\/\/www\.notion\.so\/[^)]+\)/g);
  if (urlMatches) {
    urlCount = urlMatches.length;
    fixed = fixed.replace(/\s*\(https:\/\/www\.notion\.so\/[^)]+\)/g, '');
  }

  if (pathCount > 0) {
    issues.push({
      file: filePath, line: 0, rule: 'notion-path',
      message: `${pathCount} Notion path(s) cleaned`,
      fixable: true,
    });
  }
  if (urlCount > 0) {
    issues.push({
      file: filePath, line: 0, rule: 'notion-url',
      message: `${urlCount} Notion URL(s) stripped`,
      fixable: true,
    });
  }

  return { fixed, issues };
}

export function normalizeContent(
  content: string,
  filePath: string,
  titleMap: TitleMap,
): NormalizeResult {
  const allIssues: NormalizeIssue[] = [];
  const { data: frontmatter, content: body } = matter(content);

  const { fixed: fixedFm, issues: fmIssues } = normalizeFrontmatter(
    frontmatter, filePath, titleMap,
  );
  allIssues.push(...fmIssues);

  const { fixed: fixedBody, issues: bodyIssues } = normalizeBody(
    body, filePath, titleMap,
  );
  allIssues.push(...bodyIssues);

  if (allIssues.length === 0) {
    return { content, issues: [], changed: false };
  }

  const fixedContent = matter.stringify(fixedBody, fixedFm);
  return { content: fixedContent, issues: allIssues, changed: true };
}
