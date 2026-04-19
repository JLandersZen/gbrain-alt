import { describe, test, expect } from 'bun:test';
import {
  normalizeType,
  normalizeFrontmatter,
  normalizeBody,
  normalizeContent,
  buildTitleMap,
  slugifyTitle,
  parseNotionPath,
  type TitleMap,
} from '../src/core/normalize.ts';

function makeTitleMap(entries: { title: string; slug: string }[]): TitleMap {
  return buildTitleMap(entries);
}

const SAMPLE_PAGES = [
  { title: 'Agentic Infrastructure', slug: 'projects/agentic-infrastructure' },
  { title: 'Engineering Leadership', slug: 'aors/engineering-leadership' },
  { title: 'Joe Landers', slug: 'people/joe-landers' },
  { title: "Riccardo D'Silva", slug: 'people/riccardo-dsilva' },
  { title: 'In Meetings', slug: 'contexts/in-meetings' },
  { title: 'PointFive POC', slug: 'projects/pointfive-poc' },
  { title: 'Joe / Stuart 1-1', slug: 'events/joe-stuart-1-1' },
  { title: 'Compute Agent PoC', slug: 'projects/compute-agent-poc' },
  { title: 'FedRAMP Moderate Certification', slug: 'projects/fedramp-moderate-certification' },
  { title: 'Compute', slug: 'organizations/compute' },
  { title: 'Self-Hosting LLMs Design Doc', slug: 'resources/self-hosting-llms-design-doc' },
  { title: 'Karpenter Rollout', slug: 'projects/karpenter-rollout' },
  { title: 'Amir Alavi', slug: 'people/amir-alavi' },
];

const titleMap = makeTitleMap(SAMPLE_PAGES);

describe('normalizeType', () => {
  test('singular types pass through', () => {
    expect(normalizeType('task')).toEqual({ normalized: 'task', changed: false });
    expect(normalizeType('project')).toEqual({ normalized: 'project', changed: false });
    expect(normalizeType('person')).toEqual({ normalized: 'person', changed: false });
  });

  test('plural types get singularized', () => {
    expect(normalizeType('tasks')).toEqual({ normalized: 'task', changed: true });
    expect(normalizeType('people')).toEqual({ normalized: 'person', changed: true });
    expect(normalizeType('events')).toEqual({ normalized: 'event', changed: true });
    expect(normalizeType('resources')).toEqual({ normalized: 'resource', changed: true });
    expect(normalizeType('organizations')).toEqual({ normalized: 'organization', changed: true });
    expect(normalizeType('aors')).toEqual({ normalized: 'aor', changed: true });
    expect(normalizeType('contexts')).toEqual({ normalized: 'context', changed: true });
    expect(normalizeType('interests')).toEqual({ normalized: 'interest', changed: true });
  });

  test('case insensitive', () => {
    expect(normalizeType('Tasks')).toEqual({ normalized: 'task', changed: true });
    expect(normalizeType('PEOPLE')).toEqual({ normalized: 'person', changed: true });
  });
});

describe('slugifyTitle', () => {
  test('basic title', () => {
    expect(slugifyTitle('Agentic Infrastructure')).toBe('agentic-infrastructure');
  });

  test('special characters', () => {
    expect(slugifyTitle("Riccardo D'Silva")).toBe('riccardo-dsilva');
  });

  test('unicode dash', () => {
    expect(slugifyTitle('Compute vLLM — Self-Hosted LLM Platform')).toBe('compute-vllm-self-hosted-llm-platform');
  });

  test('parentheses and numbers', () => {
    expect(slugifyTitle('NAT Instance Migration (NETWORK-9908)')).toBe('nat-instance-migration-network-9908');
  });

  test('slashes in title', () => {
    expect(slugifyTitle('Joe / Stuart 1-1')).toBe('joe-stuart-1-1');
  });
});

describe('buildTitleMap', () => {
  test('exact match with directory scope', () => {
    const map = makeTitleMap([
      { title: 'Compute', slug: 'organizations/compute' },
      { title: 'Compute', slug: 'aors/compute' },
    ]);
    expect(map.exact.get('organizations:compute')).toBe('organizations/compute');
    expect(map.exact.get('aors:compute')).toBe('aors/compute');
  });

  test('loose match picks first seen', () => {
    const map = makeTitleMap([
      { title: 'Compute', slug: 'organizations/compute' },
      { title: 'Compute', slug: 'aors/compute' },
    ]);
    expect(map.loose.get('compute')).toBe('organizations/compute');
  });
});

describe('normalizeFrontmatter', () => {
  test('fixes plural type', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { type: 'tasks' }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.type).toBe('task');
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('plural-type');
  });

  test('renames _events to related_events', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { _events: 'Joe / Stuart 1-1' }, 'people/joe.md', titleMap,
    );
    expect(fixed._events).toBeUndefined();
    expect(fixed.related_events).toEqual(['events/joe-stuart-1-1']);
    const rules = issues.map(i => i.rule);
    expect(rules).toContain('field-rename');
  });

  test('renames parent_page to parent', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { parent_page: 'Agentic Infrastructure' }, 'projects/foo.md', titleMap,
    );
    expect(fixed.parent_page).toBeUndefined();
    expect(fixed.parent).toBe('projects/agentic-infrastructure');
    const rules = issues.map(i => i.rule);
    expect(rules).toContain('field-rename');
  });

  test('resolves display names in assigned_projects', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { assigned_projects: 'Agentic Infrastructure' }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.assigned_projects).toEqual(['projects/agentic-infrastructure']);
    expect(issues.some(i => i.rule === 'display-name-relation')).toBe(true);
  });

  test('resolves display name in related_people as array', () => {
    const { fixed } = normalizeFrontmatter(
      { related_people: "Riccardo D'Silva" }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.related_people).toEqual(['people/riccardo-dsilva']);
  });

  test('resolves array of display names', () => {
    const { fixed } = normalizeFrontmatter(
      { related_people: ['Joe Landers', 'Amir Alavi'] }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.related_people).toEqual(['people/joe-landers', 'people/amir-alavi']);
  });

  test('preserves already-slugified values', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { assigned_projects: ['projects/agentic-infrastructure'] }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.assigned_projects).toEqual(['projects/agentic-infrastructure']);
    expect(issues.filter(i => i.rule === 'display-name-relation')).toHaveLength(0);
  });

  test('delegate is single-valued', () => {
    const { fixed } = normalizeFrontmatter(
      { delegate: 'Joe Landers' }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.delegate).toBe('people/joe-landers');
  });

  test('empty relation becomes empty array', () => {
    const { fixed } = normalizeFrontmatter(
      { assigned_projects: '' }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.assigned_projects).toEqual([]);
  });

  test('unknown title falls back to slugified version', () => {
    const { fixed } = normalizeFrontmatter(
      { assigned_projects: 'Unknown Project Title' }, 'tasks/foo.md', titleMap,
    );
    expect(fixed.assigned_projects).toEqual(['projects/unknown-project-title']);
  });

  test('resolves parent display name using page directory', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { parent: 'FedRAMP Moderate Certification' }, 'projects/agent-sandboxes.md', titleMap,
    );
    expect(fixed.parent).toBe('projects/fedramp-moderate-certification');
    expect(issues.some(i => i.rule === 'display-name-relation')).toBe(true);
  });

  test('parent already-slugified stays unchanged', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { parent: 'projects/fedramp-moderate-certification' }, 'projects/foo.md', titleMap,
    );
    expect(fixed.parent).toBe('projects/fedramp-moderate-certification');
    expect(issues.filter(i => i.rule === 'display-name-relation')).toHaveLength(0);
  });

  test('no issues when frontmatter is clean', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { type: 'task', assigned_projects: ['projects/agentic-infrastructure'] }, 'tasks/foo.md', titleMap,
    );
    expect(issues).toHaveLength(0);
    expect(fixed.type).toBe('task');
  });

  test('flattens links: nesting to top-level', () => {
    const { fixed, issues } = normalizeFrontmatter(
      {
        type: 'task',
        links: {
          assigned_projects: ['projects/alpha'],
          related_people: ['people/bob'],
        },
      },
      'tasks/foo.md', titleMap,
    );
    expect(fixed.links).toBeUndefined();
    expect(fixed.assigned_projects).toEqual(['projects/alpha']);
    expect(fixed.related_people).toEqual(['people/bob']);
    expect(issues.some(i => i.rule === 'links-nesting')).toBe(true);
  });

  test('links: flattening preserves existing top-level keys', () => {
    const { fixed } = normalizeFrontmatter(
      {
        assigned_projects: ['projects/existing'],
        links: {
          assigned_projects: ['projects/nested'],
          related_people: ['people/bob'],
        },
      },
      'tasks/foo.md', titleMap,
    );
    expect(fixed.assigned_projects).toEqual(['projects/existing']);
    expect(fixed.related_people).toEqual(['people/bob']);
  });

  test('links: as array is not flattened (not Notion nesting)', () => {
    const { fixed, issues } = normalizeFrontmatter(
      { links: ['some-link'] },
      'resources/foo.md', titleMap,
    );
    expect(fixed.links).toEqual(['some-link']);
    expect(issues.filter(i => i.rule === 'links-nesting')).toHaveLength(0);
  });
});

describe('parseNotionPath', () => {
  test('relative Notion path with UUID', () => {
    const result = parseNotionPath('../People/Amir%20Alavi%20324ec333f05b8151a752fa8732cfa4cd.md');
    expect(result).toEqual({ dir: 'people', name: 'Amir Alavi' });
  });

  test('nested Notion path', () => {
    const result = parseNotionPath('../Organizations/Zendesk/Engineering/ZOS/Cloud/Compute%20325ec333f05b8174ba1edce4ba6f75ad.md');
    expect(result).toEqual({ dir: 'organizations', name: 'Compute' });
  });

  test('path without UUID returns null', () => {
    expect(parseNotionPath('../People/Joe.md')).toBeNull();
  });

  test('simple filename with UUID', () => {
    const result = parseNotionPath('Julian%20Lawrence%20325ec333f05b814c9aedda209ead958a.md');
    expect(result).toEqual({ dir: '', name: 'Julian Lawrence' });
  });
});

describe('normalizeBody', () => {
  test('fixes relative Notion paths in links', () => {
    const body = 'See [Amir Alavi](../People/Amir%20Alavi%20324ec333f05b8151a752fa8732cfa4cd.md) for details.';
    const { fixed, issues } = normalizeBody(body, 'events/foo.md', titleMap);
    expect(fixed).toBe('See [Amir Alavi](people/amir-alavi.md) for details.');
    expect(issues.some(i => i.rule === 'notion-path')).toBe(true);
  });

  test('strips Notion URLs', () => {
    const body = 'Some link (https://www.notion.so/TEST-AOR-B-328ec333f05b81e0a8adda9b67bbb8c3?pvs=21)';
    const { fixed, issues } = normalizeBody(body, 'contexts/foo.md', titleMap);
    expect(fixed).toBe('Some link');
    expect(issues.some(i => i.rule === 'notion-url')).toBe(true);
  });

  test('handles multiple Notion paths', () => {
    const body = [
      'People: [Joe](../People/Joe%20Landers%20324ec333f05b8151a752fa8732cfa4cd.md)',
      'Events: [Meeting](../Events/Joe%20Stuart%201-1%20aaaaaaaabbbbbbbbccccccccdddddddd.md)',
    ].join('\n');
    const { fixed, issues } = normalizeBody(body, 'tasks/foo.md', titleMap);
    expect(fixed).toContain('people/joe-landers.md');
    expect(issues.some(i => i.rule === 'notion-path')).toBe(true);
  });

  test('body without Notion paths unchanged', () => {
    const body = 'Normal content with [a link](resources/foo.md).';
    const { fixed, issues } = normalizeBody(body, 'tasks/foo.md', titleMap);
    expect(fixed).toBe(body);
    expect(issues).toHaveLength(0);
  });

  test('preserves standalone --- horizontal rules (zone separators)', () => {
    const body = 'Compiled truth\n---\n## Relationships\n- **Parent:** [Foo](aors/foo.md)\n---\n- 2026-04-18: Created';
    const { fixed, issues } = normalizeBody(body, 'resources/foo.md', titleMap);
    expect(fixed).toBe(body);
    expect(issues).toHaveLength(0);
  });
});

describe('normalizeContent', () => {
  test('full normalization of a Notion-imported task', () => {
    const content = `---
type: tasks
assigned_projects: Agentic Infrastructure
priority: Interesting
related_people: "Riccardo D'Silva"
status: Waiting
when: Not Urgent
title: Assess Compute Agent for Production Viability
---

Review Riccardo's Compute Agent PoC for production potential.
See [Riccardo](../People/Riccardo%20D'Silva%20324ec333f05b81229a1bc232d51d7db2.md) for details.
`;
    const result = normalizeContent(content, 'tasks/assess-compute.md', titleMap);
    expect(result.changed).toBe(true);
    expect(result.content).toContain('type: task');
    expect(result.content).not.toContain('type: tasks');
    expect(result.content).toContain('people/riccardo-dsilva');
    expect(result.content).toContain('projects/agentic-infrastructure');
    expect(result.content).not.toContain('324ec333f05b');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('clean page produces no issues', () => {
    const content = `---
type: task
title: Clean Task
assigned_projects:
  - projects/agentic-infrastructure
related_people:
  - people/joe-landers
---

Nothing to fix here.
`;
    const result = normalizeContent(content, 'tasks/clean.md', titleMap);
    expect(result.changed).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  test('fixes _events and parent_page together', () => {
    const content = `---
type: project
title: LLM Observability
parent_page: Agentic Infrastructure
_events: Joe / Stuart 1-1
---

Content here.
`;
    const result = normalizeContent(content, 'projects/llm-observability.md', titleMap);
    expect(result.changed).toBe(true);
    expect(result.content).not.toContain('parent_page');
    expect(result.content).not.toMatch(/^_events:/m);
    expect(result.content).toContain('parent:');
    expect(result.content).toContain('related_events');
  });

  test('handles events with plural type and people field', () => {
    const content = `---
type: events
assigned_contexts: In Meetings
event_id: abc123
people: Amir Alavi
title: Amir / Joe
---

Meeting notes.
`;
    const result = normalizeContent(content, 'events/amir-joe.md', titleMap);
    expect(result.changed).toBe(true);
    expect(result.content).toContain('type: event');
  });
});
